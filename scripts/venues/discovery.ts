// ---------------------------------------------------------------------------
// Two-category discovery — the heart of the skill's honesty.
//
//   LENDING YIELD    : allocatable Aave-style markets (OpenFi, ZonaLend). Ranked
//                      on ON-CHAIN baseApy, risk-adjusted by liquidation
//                      threshold. supply/withdraw anytime.
//   RWA-VAULT YIELD  : real-world-income vaults. Tulipa is an ALLOCATABLE vault
//                      DEPOSIT (a different action from lending supply);
//                      pAlpha is a gated benchmark. APYs here are off-chain
//                      advertised, never ranked, never routed on.
//
// Ranking + best-allocatable apply WITHIN the lending section only.
// ---------------------------------------------------------------------------

import { BENCHMARK, Reserve } from "../config";
import { lendingVenues, rwaVenues } from "./index";
import { Venue, VReserveSnapshot, lendingScore } from "./types";

export interface RankedLending extends VReserveSnapshot {
  score: number;
}

export interface DiscoverResult {
  lending: RankedLending[];
  rwa: VReserveSnapshot[];
  /** Best allocatable lending row by risk-adjusted score (the allocate default). */
  best?: RankedLending;
}

async function snapshotVenue(v: Venue): Promise<VReserveSnapshot[]> {
  return Promise.all(v.reserves().map((r: Reserve) => v.snapshot(r)));
}

export async function discover(): Promise<DiscoverResult> {
  const [lendSnapsNested, rwaSnapsNested] = await Promise.all([
    Promise.all(lendingVenues().map(snapshotVenue)),
    Promise.all(rwaVenues().map(snapshotVenue)),
  ]);

  const lending: RankedLending[] = lendSnapsNested
    .flat()
    .map((s) => ({ ...s, score: lendingScore(s) }))
    .sort((a, b) => b.score - a.score);

  const rwa = rwaSnapsNested.flat();
  const best = lending.find((r) => r.allocatable);

  return { lending, rwa, best };
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function padL(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

export function renderDiscovery(d: DiscoverResult): string {
  const lines: string[] = [];

  lines.push("LENDING YIELD (allocatable — supply / withdraw anytime; ranked on on-chain baseAPY)");
  lines.push("");
  lines.push("  venue     asset   baseAPY%  LTV%  liqThr%  status        score");
  lines.push("  --------  ------  --------  ----  -------  ------------  -------");
  for (const r of d.lending) {
    lines.push(
      `  ${pad(r.venueId, 8)}  ${pad(r.symbol, 6)}  ${padL(r.baseApy.toFixed(2), 8)}  ` +
        `${padL(r.ltvPct.toFixed(0), 4)}  ${padL(r.liqThresholdPct.toFixed(0), 7)}  ` +
        `${pad(r.status, 12)}  ${padL(r.score.toFixed(2), 6)}` +
        (r.note ? `   (${r.note})` : "")
    );
  }

  lines.push("");
  lines.push("RWA-VAULT YIELD (real-world income — a vault deposit, NOT a lending supply)");
  lines.push("");
  for (const r of d.rwa) {
    const apy = r.advertisedApy != null ? `~${r.advertisedApy.toFixed(0)}%` : "—";
    const tag = r.allocatable ? "ALLOCATABLE" : "not allocatable";
    lines.push(`  ${pad(r.venueId, 8)}  ${pad(r.symbol, 6)}  ${pad(apy, 6)}  ${tag}`);
    if (r.note) lines.push(`      ${r.note}`);
  }
  // Gated benchmark (read-only, never allocatable).
  lines.push(`  ${pad("pAlpha", 8)}  ${pad("—", 6)}  ${pad(`~${BENCHMARK.apyPct.toFixed(0)}%`, 6)}  not allocatable`);
  lines.push(`      ${BENCHMARK.name} — ${BENCHMARK.access} (benchmark; router will not deposit)`);

  return lines.join("\n");
}
