// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "forge-std/Test.sol";
import "../src/WCTC.sol";
import "../src/Stablecoin.sol";
import "../src/PushOracle.sol";
import "../src/Treasury.sol";
import "../src/VaultManager.sol";
import "../src/StabilityPool.sol";
import "../src/LiquidationEngine.sol";

contract CreditCDPTest is Test {
    // Contracts
    WCTC public wctc;
    Stablecoin public rusd;
    PushOracle public oracle;
    Treasury public treasury;
    VaultManager public vaultManager;
    StabilityPool public stabilityPool;
    LiquidationEngine public liquidationEngine;

    // Test accounts
    address public alice = address(0x1);
    address public bob = address(0x2);
    address public charlie = address(0x3);
    address public liquidator = address(0x4);

    // Constants
    uint256 constant PRECISION = 1e18;
    uint256 constant INITIAL_PRICE = 2000e18; // $2000 per wCTC
    uint256 constant MCR = 1.3e18; // 130%
    uint256 constant BORROWING_FEE = 5e15; // 0.5%
    uint256 constant LIQUIDATION_PENALTY = 5e16; // 5%
    uint256 constant STALENESS_THRESHOLD = 1 hours;

    function setUp() public {
        // Deploy contracts
        wctc = new WCTC();
        rusd = new Stablecoin();
        oracle = new PushOracle(STALENESS_THRESHOLD, INITIAL_PRICE);
        treasury = new Treasury();

        vaultManager = new VaultManager(
            address(wctc),
            address(rusd),
            address(oracle),
            address(treasury),
            MCR,
            BORROWING_FEE
        );

        stabilityPool = new StabilityPool(address(rusd), address(wctc));

        liquidationEngine = new LiquidationEngine(
            address(vaultManager),
            address(stabilityPool),
            address(treasury),
            address(wctc),
            LIQUIDATION_PENALTY
        );

        // Setup permissions
        rusd.addMinter(address(vaultManager));
        rusd.addBurner(address(vaultManager));
        rusd.addBurner(address(stabilityPool));

        vaultManager.setLiquidationEngine(address(liquidationEngine));
        stabilityPool.setLiquidationEngine(address(liquidationEngine));

        // Fund test accounts with native tokens
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);
        vm.deal(liquidator, 100 ether);
    }

    // =============================================================
    //                      WCTC TESTS
    // =============================================================

    function testWrapAndUnwrap() public {
        vm.startPrank(alice);

        // Wrap 10 native tokens
        wctc.wrap{value: 10 ether}();
        assertEq(wctc.balanceOf(alice), 10 ether);
        assertEq(wctc.totalSupply(), 10 ether);

        // Unwrap 5 tokens
        wctc.unwrap(5 ether);
        assertEq(wctc.balanceOf(alice), 5 ether);
        assertEq(wctc.totalSupply(), 5 ether);

        vm.stopPrank();
    }

    function testWrapViaReceive() public {
        vm.prank(alice);
        (bool success, ) = address(wctc).call{value: 5 ether}("");
        assertTrue(success);
        assertEq(wctc.balanceOf(alice), 5 ether);
    }

    // =============================================================
    //                      ORACLE TESTS
    // =============================================================

    function testOraclePrice() public {
        uint256 price = oracle.getPrice();
        assertEq(price, INITIAL_PRICE);
        assertTrue(oracle.isFresh());
    }

    function testOracleStaleness() public {
        // Fast forward past staleness threshold
        skip(STALENESS_THRESHOLD + 1);

        assertFalse(oracle.isFresh());

        vm.expectRevert(PushOracle.StalePrice.selector);
        oracle.getPrice();
    }

    function testOraclePriceUpdate() public {
        uint256 newPrice = 2500e18;
        oracle.setPrice(newPrice, block.timestamp);

        assertEq(oracle.getPrice(), newPrice);
    }

    // =============================================================
    //                   VAULT MANAGER TESTS
    // =============================================================

    function testOpenVault() public {
        vm.startPrank(alice);

        // Wrap 10 wCTC ($20,000 at $2000/wCTC)
        wctc.wrap{value: 10 ether}();
        wctc.approve(address(vaultManager), 10 ether);

        // Borrow 10,000 crdUSD (requires ~13,000 collateral at 130% MCR)
        uint256 debtAmount = 10_000e18;
        uint256 vaultId = vaultManager.openVault(10 ether, debtAmount);

        assertEq(vaultId, 1);

        VaultManager.Vault memory vault = vaultManager.getVault(vaultId);
        assertEq(vault.owner, alice);
        assertEq(vault.collateral, 10 ether);
        assertTrue(vault.debt > debtAmount); // Includes fee

        // Alice should have received the borrowed amount (not including fee)
        assertEq(rusd.balanceOf(alice), debtAmount);

        vm.stopPrank();
    }

    function testOpenVaultInsufficientCollateral() public {
        vm.startPrank(alice);

        wctc.wrap{value: 1 ether}();
        wctc.approve(address(vaultManager), 1 ether);

        // Try to borrow too much (would be under-collateralized)
        vm.expectRevert(VaultManager.InsufficientCollateralRatio.selector);
        vaultManager.openVault(1 ether, 2000e18); // 1 wCTC = $2000, need MCR

        vm.stopPrank();
    }

    function testAdjustVault() public {
        uint256 vaultId = _openVaultForAlice(10 ether, 10_000e18);

        vm.startPrank(alice);

        // Add 5 more wCTC collateral
        wctc.wrap{value: 5 ether}();
        wctc.approve(address(vaultManager), 5 ether);
        vaultManager.adjustVault(vaultId, int256(5 ether), 0);

        VaultManager.Vault memory vault = vaultManager.getVault(vaultId);
        assertEq(vault.collateral, 15 ether);

        vm.stopPrank();
    }

    function testCloseVault() public {
        uint256 vaultId = _openVaultForAlice(10 ether, 10_000e18);

        // Get debt amount (includes fee)
        VaultManager.Vault memory vault = vaultManager.getVault(vaultId);

        vm.startPrank(alice);

        // Alice needs additional crdUSD to cover the fee portion
        // Open another small vault to get the fee amount
        wctc.wrap{value: 1 ether}();
        wctc.approve(address(vaultManager), 1 ether);
        vaultManager.openVault(1 ether, 100e18); // Small vault for extra crdUSD

        // Approve repayment
        rusd.approve(address(vaultManager), vault.debt);

        // Close vault
        uint256 balanceBefore = wctc.balanceOf(alice);
        vaultManager.closeVault(vaultId);
        uint256 balanceAfter = wctc.balanceOf(alice);

        // Alice should have received her collateral back
        assertEq(balanceAfter - balanceBefore, 10 ether);

        vm.stopPrank();
    }

    function testVaultCollateralRatio() public {
        uint256 vaultId = _openVaultForAlice(10 ether, 10_000e18);

        uint256 ratio = vaultManager.getVaultCollateralRatio(vaultId);
        // 10 wCTC * $2000 = $20,000 collateral
        // ~$10,050 debt (including 0.5% fee)
        // Ratio should be around 199% (1.99e18)
        assertTrue(ratio > 1.9e18 && ratio < 2.1e18);
    }

    // =============================================================
    //                  STABILITY POOL TESTS
    // =============================================================

    function testStabilityPoolDeposit() public {
        // Alice opens vault and gets crdUSD
        _openVaultForAlice(10 ether, 10_000e18);

        vm.startPrank(alice);

        // Deposit 5000 crdUSD into stability pool
        rusd.approve(address(stabilityPool), 5000e18);
        stabilityPool.deposit(5000e18);

        (uint256 depositAmount, ) = stabilityPool.getDepositorInfo(alice);
        assertEq(depositAmount, 5000e18);
        assertEq(stabilityPool.getTotalDeposits(), 5000e18);

        vm.stopPrank();
    }

    function testStabilityPoolWithdraw() public {
        _openVaultForAlice(10 ether, 10_000e18);

        vm.startPrank(alice);

        rusd.approve(address(stabilityPool), 5000e18);
        stabilityPool.deposit(5000e18);

        // Withdraw 2000 crdUSD
        stabilityPool.withdraw(2000e18);

        (uint256 depositAmount, ) = stabilityPool.getDepositorInfo(alice);
        assertEq(depositAmount, 3000e18);

        vm.stopPrank();
    }

    // =============================================================
    //                    LIQUIDATION TESTS
    // =============================================================

    function testLiquidation() public {
        // Alice opens vault
        uint256 vaultId = _openVaultForAlice(10 ether, 10_000e18);

        // Bob deposits into stability pool (needs to cover Alice's debt including fee)
        _openVaultForBob(15 ether, 15_000e18);
        vm.startPrank(bob);
        rusd.approve(address(stabilityPool), 15_000e18);
        stabilityPool.deposit(15_000e18);
        vm.stopPrank();

        // Price drops to make Alice's vault liquidatable
        // Original: 10 wCTC * $2000 = $20,000 collateral, ~$10,050 debt
        // New: 10 wCTC * $1200 = $12,000 collateral, ~$10,050 debt
        // Ratio: 12,000 / 10,050 = 119% < 130% MCR
        oracle.setPrice(1200e18, block.timestamp);

        // Verify vault can be liquidated
        assertTrue(vaultManager.canLiquidate(vaultId));

        // Liquidate
        vm.prank(liquidator);
        liquidationEngine.liquidate(vaultId);

        // Vault should be closed
        vm.expectRevert(VaultManager.VaultNotFound.selector);
        vaultManager.getVault(vaultId);

        // Bob should have received collateral gains
        vm.prank(bob);
        (uint256 depositAmount, uint256 collateralGain) = stabilityPool.getDepositorInfo(bob);

        // Bob's deposit tracking (note: individual deposits don't auto-decrease in current impl)
        assertEq(depositAmount, 15_000e18);

        // Total pool deposits should have decreased
        assertTrue(stabilityPool.getTotalDeposits() < 15_000e18);

        // Bob should have collateral gains (about 9.5 wCTC after 5% penalty)
        assertTrue(collateralGain > 9 ether && collateralGain < 10 ether);
    }

    function testCannotLiquidateHealthyVault() public {
        uint256 vaultId = _openVaultForAlice(10 ether, 10_000e18);

        assertFalse(vaultManager.canLiquidate(vaultId));

        vm.prank(liquidator);
        vm.expectRevert(LiquidationEngine.VaultNotLiquidatable.selector);
        liquidationEngine.liquidate(vaultId);
    }

    function testBatchLiquidation() public {
        // Open multiple vaults
        uint256 vaultId1 = _openVaultForAlice(10 ether, 10_000e18);
        uint256 vaultId2 = _openVaultForBob(10 ether, 10_000e18);

        // Charlie deposits into stability pool (needs to cover both debts + fees)
        vm.startPrank(charlie);
        wctc.wrap{value: 30 ether}();
        wctc.approve(address(vaultManager), 30 ether);
        uint256 vaultId3 = vaultManager.openVault(30 ether, 30_000e18);

        rusd.approve(address(stabilityPool), 30_000e18);
        stabilityPool.deposit(30_000e18);
        vm.stopPrank();

        // Drop price to liquidate vaults
        oracle.setPrice(1200e18, block.timestamp);

        // Batch liquidate
        uint256[] memory vaultIds = new uint256[](2);
        vaultIds[0] = vaultId1;
        vaultIds[1] = vaultId2;

        vm.prank(liquidator);
        liquidationEngine.batchLiquidate(vaultIds);

        // Both vaults should be closed
        vm.expectRevert(VaultManager.VaultNotFound.selector);
        vaultManager.getVault(vaultId1);

        vm.expectRevert(VaultManager.VaultNotFound.selector);
        vaultManager.getVault(vaultId2);
    }

    // =============================================================
    //                    REDEMPTION TESTS
    // =============================================================

    function testRedemptionSingleVault() public {
        // Alice opens a vault with low collateral ratio (healthy but close to MCR)
        // 10 wCTC * $2000 = $20,000, borrowing $14,000 gives ~140% CR
        uint256 vaultId = _openVaultForAlice(10 ether, 14_000e18);

        // Bob gets crdUSD to redeem
        _openVaultForBob(20 ether, 20_000e18);

        vm.startPrank(bob);

        uint256 bobRUSDBalanceBefore = rusd.balanceOf(bob);
        uint256 bobWCTCBalanceBefore = wctc.balanceOf(bob);

        // Bob redeems 5000 crdUSD
        uint256 redemptionAmount = 5000e18;
        rusd.approve(address(vaultManager), redemptionAmount);

        uint256 collateralReceived = vaultManager.redeem(redemptionAmount, bob);

        uint256 bobRUSDBalanceAfter = rusd.balanceOf(bob);
        uint256 bobWCTCBalanceAfter = wctc.balanceOf(bob);

        // Bob should have burned crdUSD
        assertEq(bobRUSDBalanceBefore - bobRUSDBalanceAfter, redemptionAmount);

        // Bob should have received wCTC (amount depends on price and fee)
        // At $2000/wCTC: 5000 crdUSD = 2.5 wCTC before fee
        // With 0.5% fee: ~2.4875 wCTC
        assertTrue(collateralReceived > 2.4 ether && collateralReceived < 2.5 ether);
        assertEq(bobWCTCBalanceAfter - bobWCTCBalanceBefore, collateralReceived);

        // Alice's vault debt should have decreased
        VaultManager.Vault memory vault = vaultManager.getVault(vaultId);
        assertTrue(vault.debt < 14_070e18); // Original debt plus fee
        assertTrue(vault.collateral < 10 ether);

        vm.stopPrank();
    }

    function testRedemptionMultipleVaults() public {
        // Alice opens vault with 140% CR (riskier)
        uint256 vaultId1 = _openVaultForAlice(10 ether, 14_000e18);

        // Bob opens vault with 160% CR (safer)
        uint256 vaultId2 = _openVaultForBob(10 ether, 12_000e18);

        // Charlie gets crdUSD to redeem
        vm.startPrank(charlie);
        wctc.wrap{value: 30 ether}();
        wctc.approve(address(vaultManager), 30 ether);
        vaultManager.openVault(30 ether, 30_000e18);

        // Charlie redeems a large amount that requires hitting both vaults
        uint256 redemptionAmount = 20_000e18;
        rusd.approve(address(vaultManager), redemptionAmount);

        uint256 collateralReceived = vaultManager.redeem(redemptionAmount, charlie);

        // Should have received collateral
        assertTrue(collateralReceived > 9.9 ether && collateralReceived < 10.1 ether);

        // Alice's vault (riskier) should be hit first and possibly fully redeemed
        VaultManager.Vault memory vault1 = vaultManager.getVault(vaultId1);
        assertTrue(vault1.debt < 14_070e18); // Should be reduced or closed

        // Bob's vault should also be affected
        VaultManager.Vault memory vault2 = vaultManager.getVault(vaultId2);
        assertTrue(vault2.debt < 12_060e18); // Should be reduced

        vm.stopPrank();
    }

    function testRedemptionTargetsLowestCR() public {
        // Create vaults with different collateral ratios
        // Alice: 140% CR (riskiest)
        uint256 vaultId1 = _openVaultForAlice(10 ether, 14_000e18);

        // Bob: 180% CR (safer)
        uint256 vaultId2 = _openVaultForBob(15 ether, 16_000e18);

        // Record initial debts
        uint256 aliceDebtBefore = vaultManager.getVault(vaultId1).debt;
        uint256 bobDebtBefore = vaultManager.getVault(vaultId2).debt;

        // Charlie redeems small amount
        vm.startPrank(charlie);
        wctc.wrap{value: 20 ether}();
        wctc.approve(address(vaultManager), 20 ether);
        vaultManager.openVault(20 ether, 20_000e18);

        rusd.approve(address(vaultManager), 5000e18);
        vaultManager.redeem(5000e18, charlie);
        vm.stopPrank();

        // Alice's vault should be hit (lower CR)
        uint256 aliceDebtAfter = vaultManager.getVault(vaultId1).debt;
        assertTrue(aliceDebtAfter < aliceDebtBefore);

        // Bob's vault should be unchanged (higher CR, not targeted)
        uint256 bobDebtAfter = vaultManager.getVault(vaultId2).debt;
        assertEq(bobDebtAfter, bobDebtBefore);
    }

    function testRedemptionFeeCalculation() public {
        // Alice opens vault
        _openVaultForAlice(10 ether, 10_000e18);

        // Bob gets crdUSD
        _openVaultForBob(20 ether, 10_000e18);

        vm.startPrank(bob);

        // Check fee calculation
        uint256 redemptionAmount = 5000e18;
        uint256 price = oracle.getPrice();

        // Expected collateral before fee
        uint256 expectedGrossCollateral = (redemptionAmount * PRECISION) / price;

        // Expected fee (0.5% of collateral)
        uint256 expectedFee = vaultManager.getRedemptionFee(expectedGrossCollateral);
        assertEq(expectedFee, (expectedGrossCollateral * 5e15) / PRECISION);

        // Estimated net collateral
        uint256 estimatedCollateral = vaultManager.getRedeemableAmount(redemptionAmount);
        assertEq(estimatedCollateral, expectedGrossCollateral - expectedFee);

        vm.stopPrank();
    }

    function testRedemptionSkipsLiquidatableVaults() public {
        // Alice opens healthy vault (140% CR)
        uint256 vaultId1 = _openVaultForAlice(10 ether, 14_000e18);

        // Bob opens vault that will become liquidatable
        uint256 vaultId2 = _openVaultForBob(10 ether, 15_000e18);

        // Charlie opens vault to get crdUSD for redemption
        vm.startPrank(charlie);
        wctc.wrap{value: 30 ether}();
        wctc.approve(address(vaultManager), 30 ether);
        vaultManager.openVault(30 ether, 10_000e18);
        vm.stopPrank();

        // Price drop makes Bob's vault liquidatable
        // 10 wCTC * $1200 = $12,000, debt ~$15,075 -> CR = 79% < 130%
        oracle.setPrice(1200e18, block.timestamp);

        // Verify Bob's vault is liquidatable
        assertTrue(vaultManager.canLiquidate(vaultId2));

        // Charlie redeems - should skip Bob's vault and hit Alice's
        vm.startPrank(charlie);
        rusd.approve(address(vaultManager), 5000e18);
        uint256 collateralReceived = vaultManager.redeem(5000e18, charlie);

        // Should still receive collateral from Alice's vault
        assertTrue(collateralReceived > 0);

        vm.stopPrank();
    }

    function testRedemptionRevertsOnZeroAmount() public {
        _openVaultForAlice(10 ether, 10_000e18);

        vm.prank(alice);
        vm.expectRevert(VaultManager.ZeroAmount.selector);
        vaultManager.redeem(0, alice);
    }

    function testRedemptionRevertsOnZeroAddress() public {
        _openVaultForAlice(10 ether, 10_000e18);

        vm.prank(alice);
        vm.expectRevert(VaultManager.ZeroAddress.selector);
        vaultManager.redeem(1000e18, address(0));
    }

    function testRedemptionClosesVaultBelowMinDebt() public {
        // Alice opens vault with lower CR ~142% (will be targeted first in redemption)
        // 10 wCTC * $2000 = $20,000, borrowing $14,000 gives ~142% CR
        uint256 vaultId = _openVaultForAlice(10 ether, 14_000e18);

        // Bob opens much safer vault with higher CR ~400% (won't be targeted)
        // 100 wCTC * $2000 = $200,000, borrowing $50,000 gives ~400% CR
        vm.startPrank(bob);
        wctc.wrap{value: 100 ether}();
        wctc.approve(address(vaultManager), 100 ether);
        vaultManager.openVault(100 ether, 50_000e18);

        // Bob redeems almost all of Alice's debt, leaving it below MIN_DEBT (100 crdUSD)
        // Alice's debt is ~$14,070 (including fee), redeeming $14,050 leaves ~$20 which is below MIN_DEBT
        rusd.approve(address(vaultManager), 14_050e18);
        vaultManager.redeem(14_050e18, bob);

        vm.stopPrank();

        // Alice's vault should be closed (debt went below MIN_DEBT threshold)
        vm.expectRevert(VaultManager.VaultNotFound.selector);
        vaultManager.getVault(vaultId);
    }

    function testSetRedemptionFee() public {
        // Owner can update redemption fee
        uint256 newFee = 10e15; // 1%
        vaultManager.setRedemptionFee(newFee);
        assertEq(vaultManager.redemptionFee(), newFee);

        // Non-owner cannot update
        vm.prank(alice);
        vm.expectRevert(VaultManager.Unauthorized.selector);
        vaultManager.setRedemptionFee(5e15);

        // Cannot set fee too high (> 10%)
        vm.expectRevert(VaultManager.InvalidParameters.selector);
        vaultManager.setRedemptionFee(0.11e18);
    }

    function testRedemptionEstimateAccuracy() public {
        // Open vault
        _openVaultForAlice(10 ether, 10_000e18);

        // Bob gets crdUSD
        _openVaultForBob(20 ether, 10_000e18);

        vm.startPrank(bob);

        uint256 redemptionAmount = 5000e18;

        // Get estimate
        uint256 estimatedCollateral = vaultManager.getRedeemableAmount(redemptionAmount);

        // Perform actual redemption
        rusd.approve(address(vaultManager), redemptionAmount);
        uint256 actualCollateral = vaultManager.redeem(redemptionAmount, bob);

        // Estimate should match actual (within small rounding error)
        assertTrue(actualCollateral >= estimatedCollateral);
        assertTrue(actualCollateral - estimatedCollateral < 0.01 ether); // < 1% difference

        vm.stopPrank();
    }

    // =============================================================
    //                        HELPER FUNCTIONS
    // =============================================================

    function _openVaultForAlice(uint256 collateralAmount, uint256 debtAmount)
        internal
        returns (uint256 vaultId)
    {
        vm.startPrank(alice);
        wctc.wrap{value: collateralAmount}();
        wctc.approve(address(vaultManager), collateralAmount);
        vaultId = vaultManager.openVault(collateralAmount, debtAmount);
        vm.stopPrank();
    }

    function _openVaultForBob(uint256 collateralAmount, uint256 debtAmount)
        internal
        returns (uint256 vaultId)
    {
        vm.startPrank(bob);
        wctc.wrap{value: collateralAmount}();
        wctc.approve(address(vaultManager), collateralAmount);
        vaultId = vaultManager.openVault(collateralAmount, debtAmount);
        vm.stopPrank();
    }
}
