import { Contract, formatUnits } from "ethers";
import { ADDRESSES_PROVIDER_ABI, OPENFI_ABI, PRICE_ORACLE_ABI } from "./abi";
import { POOL, Reserve } from "./config";
import { rpcProvider } from "./reader";

export const OPENFI_ORACLE_PRICE_DECIMALS = 8;

let oracleCache: string | null = null;

export async function openFiPriceOracle(): Promise<string> {
  if (oracleCache) return oracleCache;

  const pool = new Contract(POOL, OPENFI_ABI, rpcProvider());
  const addressesProvider = (await pool.ADDRESSES_PROVIDER.staticCall()) as string;
  const provider = new Contract(addressesProvider, ADDRESSES_PROVIDER_ABI, rpcProvider());
  const oracle = (await provider.getPriceOracle.staticCall()) as string;
  oracleCache = oracle;
  return oracle;
}

export async function assetPriceUsd(reserve: Reserve): Promise<{ raw: bigint; usd: number }> {
  const oracle = await openFiPriceOracle();
  const c = new Contract(oracle, PRICE_ORACLE_ABI, rpcProvider());
  const raw = (await c.getAssetPrice.staticCall(reserve.address)) as bigint;
  if (raw <= 0n) throw new Error(`oracle returned zero price for ${reserve.symbol}`);
  return {
    raw,
    usd: Number(formatUnits(raw, OPENFI_ORACLE_PRICE_DECIMALS)),
  };
}
