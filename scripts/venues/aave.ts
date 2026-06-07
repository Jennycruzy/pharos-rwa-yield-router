// ---------------------------------------------------------------------------
// Generic Aave-style lending venue factory.
//
// OpenFi and ZonaLend are both Aave forks, but OpenFi is wrapped by openfi.ts
// (the verified path). This factory powers ANY OTHER Aave-style market by
// taking its own pool / data-provider / oracle addresses. ZonaLend uses it.
//
// Verified shape (mainnet): reserve RATE comes from pool.getReserveData(asset)
// .liquidityRate (ray -> APY); reserve CONFIG (ltv/liqThr/active/frozen) comes
// from the protocol data provider, which can differ from the pool. We accept an
// explicit dataProvider and fall back to ADDRESSES_PROVIDER().getPoolDataProvider().
// ---------------------------------------------------------------------------

import {
  Contract,
  JsonRpcProvider,
  MaxUint256,
  Wallet,
  ZeroAddress,
  formatUnits,
  parseUnits,
} from "ethers";
import { RAY, RPC_URL, Reserve, SAFETY } from "../config";
import { ADDRESSES_PROVIDER_ABI, ERC20_ABI, OPENFI_ABI } from "../abi";
import { rpcProvider } from "../reader";
import { Venue, VReserveSnapshot, ExecResult, VPosition } from "./types";

export interface AaveVenueConfig {
  id: string;
  title: string;
  pool: string;
  dataProvider?: string; // optional; auto-discovered from the pool if omitted
  reserves: Reserve[];
  /** Per-symbol honesty note (e.g. ZonaLend's advertised 210% headline). */
  note?: (symbol: string) => string | undefined;
}

export function makeAaveVenue(cfg: AaveVenueConfig): Venue {
  const provider = rpcProvider();
  let dataProviderCache: string | null = cfg.dataProvider ?? null;

  async function dataContract(probeAsset: string): Promise<Contract> {
    if (dataProviderCache && dataProviderCache !== ZeroAddress) {
      return new Contract(dataProviderCache, OPENFI_ABI, provider);
    }
    const pool = new Contract(cfg.pool, OPENFI_ABI, provider);
    try {
      await pool.getReserveConfigurationData.staticCall(probeAsset);
      dataProviderCache = cfg.pool;
      return pool;
    } catch {
      try {
        const ap = new Contract(
          (await pool.ADDRESSES_PROVIDER.staticCall()) as string,
          ADDRESSES_PROVIDER_ABI,
          provider
        );
        const dp = (await ap.getPoolDataProvider.staticCall()) as string;
        if (dp && dp !== ZeroAddress) {
          dataProviderCache = dp;
          return new Contract(dp, OPENFI_ABI, provider);
        }
      } catch {
        /* fall through */
      }
      dataProviderCache = cfg.pool;
      return pool;
    }
  }

  function wallet(): Wallet {
    const pk = process.env.PRIVATE_KEY;
    if (!pk) throw new Error("PRIVATE_KEY not set");
    return new Wallet(pk, new JsonRpcProvider(RPC_URL));
  }

  function reserveBySymbol(symbol: string): Reserve | undefined {
    return cfg.reserves.find((r) => r.symbol.toUpperCase() === symbol.toUpperCase());
  }

  return {
    id: cfg.id,
    title: cfg.title,
    kind: "lending",
    allocatable: true,

    reserves: () => cfg.reserves,

    async snapshot(r: Reserve): Promise<VReserveSnapshot> {
      const base: VReserveSnapshot = {
        venueId: cfg.id,
        venueTitle: cfg.title,
        kind: "lending",
        symbol: r.symbol,
        baseApy: 0,
        apySource: "on-chain",
        ltvPct: 0,
        liqThresholdPct: 0,
        allocatable: false,
        status: "read-error",
        note: cfg.note?.(r.symbol),
      };
      try {
        const pool = new Contract(cfg.pool, OPENFI_ABI, provider);
        const data = await dataContract(r.address);
        const [reserveData, conf] = await Promise.all([
          pool.getReserveData(r.address),
          data.getReserveConfigurationData(r.address),
        ]);
        const liquidityRate: bigint = reserveData.liquidityRate ?? reserveData[5];
        const baseApy = Number((liquidityRate * 10000n) / RAY) / 100;
        const isActive: boolean = conf.isActive ?? conf[8];
        const isFrozen: boolean = conf.isFrozen ?? conf[9];
        const ltvPct = Number(conf.ltv ?? conf[1]) / 100;
        const liqThresholdPct = Number(conf.liquidationThreshold ?? conf[2]) / 100;
        const allocatable = isActive && !isFrozen && baseApy > 0;
        const status = !isActive
          ? "inactive"
          : isFrozen
          ? "frozen"
          : !allocatable
          ? "zero-rate"
          : "allocatable";
        return { ...base, baseApy, ltvPct, liqThresholdPct, allocatable, status };
      } catch (e: any) {
        return { ...base, error: e?.shortMessage ?? e?.message ?? String(e) };
      }
    },

    async supply(symbol: string, amountHuman: number): Promise<ExecResult> {
      const reserve = reserveBySymbol(symbol);
      if (!reserve) return { ok: false, reason: `unknown ${cfg.id} reserve ${symbol}` };

      const w = wallet();
      const amount = parseUnits(amountHuman.toString(), reserve.decimals);

      // Guard 1: re-read the reserve; abort if no longer allocatable.
      const snap = await this.snapshot(reserve);
      if (!snap.allocatable) {
        return { ok: false, reason: `${cfg.id} ${symbol} not allocatable (${snap.status})` };
      }

      // Guard 2: balance.
      const token = new Contract(reserve.address, ERC20_ABI, w);
      const bal: bigint = await token.balanceOf(w.address);
      if (bal < amount) {
        return { ok: false, reason: `insufficient ${symbol}: have ${bal}, need ${amount}` };
      }

      // Approve the pool to spend if needed.
      let approveTx: string | undefined;
      const allowance: bigint = await token.allowance(w.address, cfg.pool);
      if (allowance < amount) {
        const tx = await token.approve(cfg.pool, MaxUint256);
        approveTx = (await tx.wait())?.hash;
      }

      const pool = new Contract(cfg.pool, OPENFI_ABI, w);
      try {
        const tx = await pool.supply(reserve.address, amount, w.address, SAFETY.REFERRAL_CODE);
        const r = await tx.wait();
        return { ok: true, approveTx, txHash: r?.hash };
      } catch (e: any) {
        return { ok: false, approveTx, reason: `supply reverted: ${e?.shortMessage ?? e?.message ?? e}` };
      }
    },

    async withdraw(symbol: string, amountHuman: number | "max"): Promise<ExecResult> {
      const reserve = reserveBySymbol(symbol);
      if (!reserve) return { ok: false, reason: `unknown ${cfg.id} reserve ${symbol}` };
      const w = wallet();
      const amount =
        amountHuman === "max" ? MaxUint256 : parseUnits(amountHuman.toString(), reserve.decimals);
      const pool = new Contract(cfg.pool, OPENFI_ABI, w);
      try {
        const tx = await pool.withdraw(reserve.address, amount, w.address);
        const r = await tx.wait();
        return { ok: true, txHash: r?.hash };
      } catch (e: any) {
        return { ok: false, reason: `withdraw reverted: ${e?.shortMessage ?? e?.message ?? e}` };
      }
    },

    async position(user: string): Promise<VPosition[]> {
      const out: VPosition[] = [];
      for (const r of cfg.reserves) {
        try {
          const data = await dataContract(r.address);
          const d = await data.getUserReserveData(r.address, user);
          const supplied = (d.currentBTokenBalance ?? d[0]) as bigint;
          if (supplied > 0n) {
            out.push({
              venueId: cfg.id,
              venueTitle: cfg.title,
              kind: "lending",
              symbol: r.symbol,
              amount: Number(formatUnits(supplied, r.decimals)),
              note: "lending supply",
            });
          }
        } catch {
          /* skip reserves that error */
        }
      }
      return out;
    },
  };
}
