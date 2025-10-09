// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "forge-std/Script.sol";
import "../src/WCTC.sol";
import "../src/Stablecoin.sol";
import "../src/MockOracle.sol";
import "../src/Treasury.sol";
import "../src/VaultManager.sol";
import "../src/StabilityPool.sol";
import "../src/LiquidationEngine.sol";

/**
 * @title Deploy Script for Credit CDP Protocol
 * @notice Deploys all contracts in correct order and configures permissions
 * @dev Compatible with London EVM (CreditCoin Testnet)
 */
contract DeployScript is Script {
    // Deployment parameters
    uint256 constant INITIAL_PRICE = 10e18; // $2000 per wCTC
    uint256 constant STALENESS_THRESHOLD = 1 hours;
    uint256 constant MCR = 1.3e18; // 130% minimum collateral ratio
    uint256 constant BORROWING_FEE = 5e15; // 0.5%
    uint256 constant LIQUIDATION_PENALTY = 5e16; // 5%

    // Deployed contracts
    WCTC public wctc;
    Stablecoin public stablecoin;
    MockOracle public oracle;
    Treasury public treasury;
    VaultManager public vaultManager;
    StabilityPool public stabilityPool;
    LiquidationEngine public liquidationEngine;

    function run() external {
        // Get deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("==============================================");
        console.log("Deploying Credit CDP Protocol");
        console.log("==============================================");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Deploy base contracts
        console.log("Step 1: Deploying base contracts...");
        wctc = new WCTC();
        console.log("  WCTC deployed at:", address(wctc));

        stablecoin = new Stablecoin();
        console.log("  Stablecoin (crdUSD) deployed at:", address(stablecoin));

        oracle = new MockOracle();
        console.log("  Oracle (Mock) deployed at:", address(oracle));

        treasury = new Treasury();
        console.log("  Treasury deployed at:", address(treasury));
        console.log("");

        // Step 2: Deploy core protocol contracts
        console.log("Step 2: Deploying core protocol contracts...");
        vaultManager = new VaultManager(
            address(wctc),
            address(stablecoin),
            address(oracle),
            address(treasury),
            MCR,
            BORROWING_FEE
        );
        console.log("  VaultManager deployed at:", address(vaultManager));

        stabilityPool = new StabilityPool(address(stablecoin), address(wctc));
        console.log("  StabilityPool deployed at:", address(stabilityPool));

        liquidationEngine = new LiquidationEngine(
            address(vaultManager),
            address(stabilityPool),
            address(treasury),
            address(wctc),
            LIQUIDATION_PENALTY
        );
        console.log("  LiquidationEngine deployed at:", address(liquidationEngine));
        console.log("");

        // Step 3: Configure permissions
        console.log("Step 3: Configuring permissions...");

        // Grant minter/burner roles to VaultManager
        stablecoin.addMinter(address(vaultManager));
        console.log("  VaultManager granted minter role");

        stablecoin.addBurner(address(vaultManager));
        console.log("  VaultManager granted burner role");

        // Grant burner role to StabilityPool
        stablecoin.addBurner(address(stabilityPool));
        console.log("  StabilityPool granted burner role");

        // Set liquidation engine in VaultManager and StabilityPool
        vaultManager.setLiquidationEngine(address(liquidationEngine));
        console.log("  LiquidationEngine set in VaultManager");

        stabilityPool.setLiquidationEngine(address(liquidationEngine));
        console.log("  LiquidationEngine set in StabilityPool");
        console.log("");

        vm.stopBroadcast();

        // Step 4: Print deployment summary
        console.log("==============================================");
        console.log("Deployment Summary");
        console.log("==============================================");
        console.log("WCTC:", address(wctc));
        console.log("Stablecoin (crdUSD):", address(stablecoin));
        console.log("Oracle (Mock):", address(oracle));
        console.log("Treasury:", address(treasury));
        console.log("VaultManager:", address(vaultManager));
        console.log("StabilityPool:", address(stabilityPool));
        console.log("LiquidationEngine:", address(liquidationEngine));
        console.log("==============================================");
        console.log("");
        console.log("Protocol Parameters:");
        console.log("  Initial Price: $%s per wCTC", INITIAL_PRICE / 1e18);
        console.log("  MCR: %s%%", (MCR * 100) / 1e18);
        console.log("  Borrowing Fee: %s%%", (BORROWING_FEE * 100) / 1e18);
        console.log("  Liquidation Penalty: %s%%", (LIQUIDATION_PENALTY * 100) / 1e18);
        // MockOracle has no staleness; values vary deterministically in [$0.52,$0.58]
        console.log("==============================================");
        console.log("");
        console.log("Next Steps:");
        console.log("1. Update oracle price regularly");
        console.log("2. Save addresses to frontend configuration");
        console.log("3. Verify contracts on block explorer");
        console.log("==============================================");
    }
}
