// ---------------------------------------------------------------------------
// Reader — pulls live rates + risk config per reserve. Handles the one unknown
// on mainnet: whether the get*Data reads live on the Pool or a separate
// Provider. It tries the Pool first; on revert it retries the Provider (if
// set). Once we know which works, we cache it for the rest of the run.
// ---------------------------------------------------------------------------

import { Contract, JsonRpcProvider } from "ethers";
import { CHAIN_ID, RPC_URL, POOL, PROVIDER, RAY, Reserve } from "./config";
import { ADDRESSES_PROVIDER_ABI, OPENFI_ABI } from "./abi";
import { ZeroAddress } from "ethers";

const provider = new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });

export function rpcProvider(): JsonRpcProvider {
  return provider;
}

let readAddrCache: string | null = null;

async function readContract(probeAsset: string): Promise<Contract> {
  if (readAddrCache) return new Contract(readAddrCache, OPENFI_ABI, provider);

  // Try the Pool first against the actual reserve being read. ZeroAddress may
  // legitimately revert even when the Pool and ABI are correct.
  const pool = new Contract(POOL, OPENFI_ABI, provider);
  try {
    await Promise.all([
      pool.getReserveData.staticCall(probeAsset),
      pool.getReserveConfigurationData.staticCall(probeAsset),
    ]);
    readAddrCache = POOL;
    return pool;
  } catch {
    if (PROVIDER && PROVIDER !== ZeroAddress) {
      readAddrCache = PROVIDER;
      return new Contract(PROVIDER, OPENFI_ABI, provider);
    }
    try {
      const addressesProvider = await pool.ADDRESSES_PROVIDER.staticCall();
      const ap = new Contract(addressesProvider, ADDRESSES_PROVIDER_ABI, provider);
      const dataProvider = (await ap.getPoolDataProvider.staticCall()) as string;
      if (dataProvider && dataProvider !== ZeroAddress) {
        readAddrCache = dataProvider;
        return new Contract(dataProvider, OPENFI_ABI, provider);
      }
    } catch {
      // No data provider discovered; let the pool call below surface the error.
    }
    // No provider set — assume Pool and let the real call surface the error.
    readAddrCache = POOL;
    return pool;
  }
}

export interface ReserveSnapshot {
  reserve: Reserve;
  apyPct: number;
  isActive: boolean;
  isFrozen: boolean;
  ltvPct: number;
  liquidationThresholdPct: number;
  allocatable: boolean; // active && !frozen && apy > 0
  error?: string;
}

export async function snapshotReserve(reserve: Reserve): Promise<ReserveSnapshot> {
  const c = await readContract(reserve.address);
  try {
    const [data, cfg] = await Promise.all([
      c.getReserveData(reserve.address),
      c.getReserveConfigurationData(reserve.address),
    ]);
    const liquidityRate: bigint = data.liquidityRate ?? data[5];
    const apyPct = Number((liquidityRate * 10000n) / RAY) / 100; // rate/1e27*100
    const isActive: boolean = cfg.isActive ?? cfg[8];
    const isFrozen: boolean = cfg.isFrozen ?? cfg[9];
    const ltvPct = Number(cfg.ltv ?? cfg[1]) / 100;
    const liqThreshPct = Number(cfg.liquidationThreshold ?? cfg[2]) / 100;
    return {
      reserve,
      apyPct,
      isActive,
      isFrozen,
      ltvPct,
      liquidationThresholdPct: liqThreshPct,
      allocatable: isActive && !isFrozen && apyPct > 0,
    };
  } catch (e: any) {
    return {
      reserve,
      apyPct: 0,
      isActive: false,
      isFrozen: true,
      ltvPct: 0,
      liquidationThresholdPct: 0,
      allocatable: false,
      error: e?.shortMessage ?? e?.message ?? String(e),
    };
  }
}

export async function getUserPosition(reserve: Reserve, user: string) {
  const c = await readContract(reserve.address);
  const d = await c.getUserReserveData(reserve.address, user);
  return {
    suppliedRaw: (d.currentBTokenBalance ?? d[0]) as bigint,
    stableDebtRaw: (d.currentStableDebt ?? d[1]) as bigint,
    variableDebtRaw: (d.currentVariableDebt ?? d[2]) as bigint,
    totalDebtRaw: ((d.currentStableDebt ?? d[1]) as bigint) + ((d.currentVariableDebt ?? d[2]) as bigint),
    usageAsCollateralEnabled: (d.usageAsCollateralEnabled ?? d[8]) as boolean,
    decimals: reserve.decimals,
  };
}
