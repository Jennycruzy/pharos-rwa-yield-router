// ---------------------------------------------------------------------------
// Venue adapter contract.
//
// The skill routes across two CATEGORIES of yield, and the type system keeps
// them honestly separate:
//   - "lending"   — supply/withdraw anytime into an Aave-style market; yield is
//                   crypto borrower demand. Ranked + allocatable.
//   - "rwa-vault" — a deposit into a vault holding a real-world income stream;
//                   yield is real-world asset payouts. A vault deposit is a
//                   DIFFERENT action from a lending supply, and redemption may
//                   be gated/term-locked even when deposits are open.
//
// Every venue lives behind this interface so the original OpenFi path stays
// untouched while new venues are added (and can be toggled off instantly).
// ---------------------------------------------------------------------------

import { Reserve } from "../config";

export type YieldKind = "lending" | "rwa-vault";

/** APY provenance — ranking only ever trusts "on-chain". */
export type ApySource = "on-chain" | "advertised" | "none";

export interface VReserveSnapshot {
  venueId: string;
  venueTitle: string;
  kind: YieldKind;
  symbol: string;
  /** On-chain liquidityRate-derived APY (the ranking number). 0 when not a rate-bearing market. */
  baseApy: number;
  apySource: ApySource;
  /** Off-chain advertised APY (e.g. incentive headline, RWA yield); never ranked. */
  advertisedApy?: number;
  ltvPct: number;
  liqThresholdPct: number;
  /** Can this skill deposit here permissionlessly right now? */
  allocatable: boolean;
  /** allocatable | zero-rate | frozen | inactive | read-error | gated | term-locked */
  status: string;
  /** Free-text honesty note shown next to the row (e.g. the 210% caveat, term-lock). */
  note?: string;
  error?: string;
}

export interface ExecResult {
  ok: boolean;
  reason?: string;
  approveTx?: string;
  txHash?: string;
}

export interface VPosition {
  venueId: string;
  venueTitle: string;
  kind: YieldKind;
  symbol: string;
  amount: number;
  valueUsd?: number;
  note?: string;
}

export interface Venue {
  id: string;
  title: string;
  kind: YieldKind;
  /** True if the skill can deposit here; rwa-vault venues may still be allocatable (Tulipa) or not (pAlpha). */
  allocatable: boolean;
  reserves(): Reserve[];
  snapshot(r: Reserve): Promise<VReserveSnapshot>;
  /** Present only when the venue is allocatable. */
  supply?(symbol: string, amt: number): Promise<ExecResult>;
  /** Present only when withdrawal is permissionless+instant (omitted for term-locked vaults). */
  withdraw?(symbol: string, amt: number | "max"): Promise<ExecResult>;
  position?(user: string): Promise<VPosition[]>;
}

/**
 * Risk-adjusted lending score: on-chain baseApy weighted by how conservative
 * the reserve's liquidation threshold is. Identical formula to the original
 * router (apy * liqThr/100), so OpenFi rows score exactly as before.
 */
export function lendingScore(s: VReserveSnapshot): number {
  if (!s.allocatable) return 0;
  const safety = s.liqThresholdPct > 0 ? s.liqThresholdPct / 100 : 0.5;
  return s.baseApy * safety;
}
