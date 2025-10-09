// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IStablecoin {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IPushOracle {
    function getPrice() external view returns (uint256);
    function isFresh() external view returns (bool);
}

interface ITreasury {
    function collectFee(address token, uint256 amount) external;
}

interface IVaultManager {
    function liquidateVault(uint256 vaultId) external returns (uint256 collateralAmount, uint256 debtAmount);
    function canLiquidate(uint256 vaultId) external view returns (bool);
    function getVaultBasic(uint256 vaultId) external view returns (address owner, uint256 collateral, uint256 debt, uint256 timestamp);
    function getVaultInterest(uint256 vaultId) external view returns (uint256 interest);
}

interface IStabilityPool {
    function absorbDebt(uint256 debtAmount, uint256 collateralAmount) external;
    function canAbsorbDebt(uint256 debtAmount) external view returns (bool);
}
