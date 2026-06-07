// ---------------------------------------------------------------------------
// Pharos RWA Yield Router — configuration
//
// Addresses below were confirmed from a real mainnet supply transaction:
//   POOL  = the "Interacted With" contract on the supply tx
//   USDC  = the token transferred / approved
// Mainnet USDC, RPC, data provider discovery, oracle reads, supply, and withdraw
// have been verified live; see README for tx hashes and dates.
// ---------------------------------------------------------------------------

import { ZeroAddress } from "ethers";
import { existsSync, readFileSync } from "fs";

function loadDotEnv(): void {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

// --- Network ----------------------------------------------------------------
// Mainnet by default (chain 1672). Set PHAROS_NETWORK=testnet for 688688.
const NETWORK = process.env.PHAROS_NETWORK ?? "mainnet";
export const IS_TESTNET = NETWORK === "testnet";

export const CHAIN_ID = IS_TESTNET ? 688688 : 1672;
export const RPC_URL =
  process.env.RPC_URL ??
  (IS_TESTNET
    ? "https://testnet.dplabs-internal.com" // testnet default from OpenFi docs
    : "https://rpc.pharos.xyz");             // verified mainnet RPC

// --- OpenFi contracts -------------------------------------------------------
// Pool = where supply/withdraw/borrow go AND the spender you approve to.
// Provider = optional separate contract for the get*Data reads. On testnet
// these were split (Pool 0x11d1ca…, Provider 0x54cb4f6C…). On mainnet we try
// the Pool first and fall back to PROVIDER if reads revert — fill PROVIDER
// only if needed. Mainnet also attempts ADDRESSES_PROVIDER().getPoolDataProvider()
// automatically when Pool config/user reads are not exposed directly.
export const OPENFI = {
  mainnet: {
    pool: "0x30b2e1411fd2ed9f1f46f59497e2186ce5be3b26", // confirmed (supply tx "Interacted With")
    provider: ZeroAddress, // optional override; auto-discovered on mainnet if left unset
  },
  testnet: {
    pool: "0x11d1ca4012d94846962bca2FBD58e5A27ddcBfC5",     // from testnet doc
    provider: "0x54cb4f6C4c12105B48b11e21d78becC32Ef694EC", // from testnet doc
  },
};

export const POOL = IS_TESTNET ? OPENFI.testnet.pool : OPENFI.mainnet.pool;
export const PROVIDER = IS_TESTNET ? OPENFI.testnet.provider : OPENFI.mainnet.provider;

// --- Tokens / reserves ------------------------------------------------------
// The router ranks across the live reserve list exposed by OpenFi Pool
// getReservesList() on mainnet as of June 4, 2026.
export interface Reserve {
  symbol: string;
  address: string;
  decimals: number;
}

export const RESERVES: Reserve[] = IS_TESTNET
  ? [
      { symbol: "USDC", address: "0x72df0bcd7276f2dFbAc900D1CE63c272C4BCcCED", decimals: 6 }, // testnet doc
    ]
  : [
      { symbol: "USDC", address: "0xC879C018dB60520F4355C26eD1a6D572cdAC1815", decimals: 6 }, // confirmed mainnet USDC
      { symbol: "WETH", address: "0x1f4b7011Ee3d53969bb67F59428a9ec0477856E9", decimals: 18 }, // discovered via getReservesList()
    ];

export function reserveBySymbol(sym: string): Reserve | undefined {
  return RESERVES.find((r) => r.symbol.toUpperCase() === sym.toUpperCase());
}

// --- ZonaLend (second LENDING venue — Aave-style, allocatable) --------------
// Verified live on mainnet (chain 1672) during the Yield Compass build:
//   pool 0xda464e… exposes getReservesList() = [USDC, WETH, WPROS] and
//   ADDRESSES_PROVIDER() = 0x923f…; getReserveData(USDC).liquidityRate => ~4%
//   base APY. Reserve CONFIG lives on the data provider (0xA914…), not the pool
//   (pool getReserveConfigurationData reverts). Oracle = 0x6bED…, 8-decimals,
//   getAssetPrice(USDC) ≈ 99971071 ($0.9997).
// ZonaLend advertises a ~210% "total net APY" for USDC; that is base rate PLUS
// points/token incentives and is NOT readable on-chain. We rank on baseApy and
// only surface the headline as an unverified note. See README "APY policy".
export const ZONA = {
  pool: "0xda464e68208a3083eb65fe5c522a72aed1c1372a",        // confirmed Aave-style pool
  dataProvider: "0xA91424C666193C2b2fb684E25dEadf03B333f49A", // confirmed (getReserveConfigurationData lives here)
  oracle: "0x6bEDfCa244f29dD916fe7c50e1469C6188B873f9",       // confirmed via ADDRESSES_PROVIDER().getPriceOracle()
  reserves: [
    { symbol: "USDC", address: "0xC879C018dB60520F4355C26eD1a6D572cdAC1815", decimals: 6 },  // same USDC as OpenFi
    { symbol: "WPROS", address: "0x52C48d4213107b20bC583832b0d951FB9CA8F0B0", decimals: 18 }, // confirmed reserve, ~3% base
  ] as Reserve[],
  // Only USDC carries the advertised headline; do not attach it elsewhere.
  advertisedTotalApyNote: (symbol: string): string | undefined =>
    symbol.toUpperCase() === "USDC"
      ? "advertised total ~210% incl. incentives (NOT on-chain verified)"
      : undefined,
};

// --- Tulipa (RWA-VAULT venue — allocatable deposit, confirmed on-chain) ------
// Ember "TulipaPRWA" multi-RWA credit vault. It is an ERC-4626-shaped vault:
//   asset() = USDC (0xC879…), shares symbol tulPRWA, 6 decimals.
// CONFIRMED ALLOCATABLE: the user's settled deposit tx
//   0x0a6cfec5171f068ff113d8b03f265a74270e64dc91226fef3a8a4ec3a2f9b19d
// called selector 0x50921b23 =
//   depositWithPermit(uint256 assets,address receiver,uint256 deadline,uint8 v,bytes32 r,bytes32 s)
// (permit + deposit bundled). The adapter wires this EXACT method: it builds an
// EIP-2612 USDC permit (owner=wallet, spender=vault, value=assets) and calls
// depositWithPermit(assets,receiver,deadline,v,r,s) — no separate approve. This
// was re-confirmed live: a 0.01 USDC deposit through the adapter used selector
// 0x50921b23 (tx 0x056966127e677d23f699f8695e947058b3ef70f909d6818e19b97d796573ad42).
// (The vault also exposes the plain ERC-4626 deposit(assets,receiver), kept in
// the ABI, but the permit method is the one actually used.)
// REDEMPTION IS TERM-LOCKED / GATED: maxRedeem(user) reports the full share
// balance, yet redeem()/withdraw() both revert with custom error 0xa339e0ec.
// We therefore wire deposit + position-read ONLY and never offer instant
// withdraw. Do not imply liquidity the vault does not currently grant.
export const TULIPA = {
  vault: "0xbae9272f71db2dc9d053e3c6c4840df65ae6aec5", // ERC-4626 vault + share token (proxy)
  asset: "0xC879C018dB60520F4355C26eD1a6D572cdAC1815", // USDC
  shareSymbol: "tulPRWA",
  decimals: 6,
  advertisedApyPct: 14,             // off-chain advertised (Ember/AquaFlux); NOT an on-chain rate
  redemption: "term-locked" as const, // redeem()/withdraw() revert with 0xa339e0ec
};

// --- Venue toggles ----------------------------------------------------------
// Any new venue can be disabled instantly. Both default ON for mainnet (their
// read paths are on-chain verified). Setting ENABLE_ZONA=false / ENABLE_TULIPA=
// false reverts discovery/position to the original OpenFi-only behavior. They
// are force-disabled on testnet (no testnet deployments configured).
export const ENABLE_ZONA = (process.env.ENABLE_ZONA ?? "true") !== "false" && !IS_TESTNET;
export const ENABLE_TULIPA = (process.env.ENABLE_TULIPA ?? "true") !== "false" && !IS_TESTNET;

// --- Read-only benchmark (not allocatable) ----------------------------------
// pAlpha is the gated institutional RWA vault surfaced via AquaFlux. Shown in
// the RWA-vault section for context; the router never tries to deposit into it.
export const BENCHMARK = {
  name: "pAlpha (Pharos RealFi Ecosystem Vault)",
  apyPct: 14.0,        // from AquaFlux structure page
  access: "gated / not allocatable",
};

// --- Safety -----------------------------------------------------------------
export const SAFETY = {
  MIN_LIQUIDITY_RATE_RAY: 0n, // skip reserves paying 0
  REFERRAL_CODE: 0,
};

// rate math: liquidityRate is a "ray" (1e27). APY% = rate / 1e27 * 100.
export const RAY = 10n ** 27n;

export function assertConfigured(): void {
  if (POOL === ZeroAddress) {
    throw new Error("OpenFi pool address is not set for this network — see config.ts");
  }
  if (RESERVES.length === 0) {
    throw new Error("No reserves configured to route across — add at least USDC in config.ts");
  }
}
