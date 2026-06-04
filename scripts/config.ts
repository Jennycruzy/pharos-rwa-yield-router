// ---------------------------------------------------------------------------
// Pharos RWA Yield Router — configuration
//
// Addresses below were confirmed from a real mainnet supply transaction:
//   POOL  = the "Interacted With" contract on the supply tx
//   USDC  = the token transferred / approved
// Anything marked `TODO: VERIFY` still needs a one-time check (see README).
// ---------------------------------------------------------------------------

import { ZeroAddress } from "ethers";

// --- Network ----------------------------------------------------------------
// Mainnet by default (chain 1672). Set PHAROS_NETWORK=testnet for 688688.
const NETWORK = process.env.PHAROS_NETWORK ?? "mainnet";
export const IS_TESTNET = NETWORK === "testnet";

export const CHAIN_ID = IS_TESTNET ? 688688 : 1672;
export const RPC_URL =
  process.env.RPC_URL ??
  (IS_TESTNET
    ? "https://testnet.dplabs-internal.com" // TODO: VERIFY testnet rpc
    : "https://rpc.pharos.xyz");             // TODO: VERIFY mainnet rpc

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
// The router ranks across these reserves. USDC is confirmed; add the other
// OpenFi reserve token addresses (USDT, GOLD, TSLA, NVDA, WETH, WBTC...) once
// you read them off the explorer to widen the comparison.
export interface Reserve {
  symbol: string;
  address: string;
  decimals: number;
}

export const RESERVES: Reserve[] = IS_TESTNET
  ? [
      { symbol: "USDC", address: "0x72df0bcd7276f2dFbAc900D1CE63c272C4BCcCED", decimals: 6 }, // testnet doc
      // TODO: add testnet reserves
    ]
  : [
      { symbol: "USDC", address: "0xC879C018dB60520F4355C26eD1a6D572cdAC1815", decimals: 6 }, // confirmed mainnet USDC
      // TODO: VERIFY and add more mainnet reserves to make the router multi-asset:
      // { symbol: "USDT", address: "0x...", decimals: 6 },
      // { symbol: "GOLD", address: "0x...", decimals: 18 },
      // { symbol: "TSLA", address: "0x...", decimals: 18 },
    ];

export function reserveBySymbol(sym: string): Reserve | undefined {
  return RESERVES.find((r) => r.symbol.toUpperCase() === sym.toUpperCase());
}

// --- Read-only benchmark (not allocatable) ----------------------------------
// pAlpha is the gated institutional RWA vault surfaced via AquaFlux. Shown in
// discovery for context; the router never tries to deposit into it.
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
