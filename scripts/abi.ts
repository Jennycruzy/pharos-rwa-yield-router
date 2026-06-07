// ---------------------------------------------------------------------------
// OpenFi ABI — Aave-style interface taken from the working testnet bot doc.
// OpenFi is an Aave fork, so the same interface applies to the mainnet
// deployment; only the address changes. Confirm with one read (getReserveData
// on USDC) before trusting the write functions — see README.
// ---------------------------------------------------------------------------

export const OPENFI_ABI = [
  // --- reads ---
  "function ADDRESSES_PROVIDER() view returns (address)",
  "function getReserveData(address asset) view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalBToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)",
  "function getReserveConfigurationData(address asset) view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)",
  "function getUserReserveData(address asset, address user) view returns (uint256 currentBTokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)",
  // --- writes ---
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
  "function withdraw(address asset, uint256 amount, address to) returns (uint256)",
];

export const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

export const ADDRESSES_PROVIDER_ABI = [
  "function getPoolDataProvider() view returns (address)",
  "function getPriceOracle() view returns (address)",
];

export const PRICE_ORACLE_ABI = [
  "function getAssetPrice(address asset) view returns (uint256)",
];

// Tulipa RWA-vault interface. The deposit path is the EXACT method the user's
// settled tx used: depositWithPermit(...) (selector 0x50921b23) — an EIP-2612
// USDC permit bundled with the ERC-4626 deposit in one tx (no separate approve).
// redeem/withdraw are NOT wired because Tulipa redemption is term-locked (see
// config.ts TULIPA). The read functions report the user's share position and its
// current asset value.
export const ERC4626_ABI = [
  "function asset() view returns (address)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function deposit(uint256 assets, address receiver) returns (uint256)",
  "function depositWithPermit(uint256 assets, address receiver, uint256 deadline, uint8 v, bytes32 r, bytes32 s) returns (uint256)",
  "function maxDeposit(address receiver) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function previewRedeem(uint256 shares) view returns (uint256)",
  "function maxRedeem(address owner) view returns (uint256)",
];

// EIP-2612 permit machinery on the USDC token, needed to build the signature
// that depositWithPermit consumes. DOMAIN_SEPARATOR lets us self-check the
// EIP-712 domain (name/version/chainId) before signing.
export const ERC2612_ABI = [
  "function nonces(address owner) view returns (uint256)",
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
];
