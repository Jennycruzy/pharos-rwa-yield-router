// ---------------------------------------------------------------------------
// Router logic — turns reserve snapshots into a ranked, risk-aware view.
// "Best" is not just the highest APY: frozen/inactive reserves are excluded,
// and a simple risk-adjusted score keeps a high rate from winning if the
// reserve's risk config is weak. The gated pAlpha benchmark is shown for
// context but never selected.
// ---------------------------------------------------------------------------

import { RESERVES, BENCHMARK } from "./config";
import { snapshotReserve, ReserveSnapshot } from "./reader";

export interface RankedRow extends ReserveSnapshot {
  riskAdjustedScore: number;
}

/**
 * Risk-adjusted score: APY weighted by how conservative the reserve's
 * liquidation threshold is. A reserve with a higher liquidation threshold is
 * treated as safer collateral configuration. Non-allocatable reserves score 0.
 */
function score(s: ReserveSnapshot): number {
  if (!s.allocatable) return 0;
  const safety = s.liquidationThresholdPct > 0 ? s.liquidationThresholdPct / 100 : 0.5;
  return s.apyPct * safety;
}

export async function rankReserves(): Promise<RankedRow[]> {
  const snaps = await Promise.all(RESERVES.map(snapshotReserve));
  return snaps
    .map((s) => ({ ...s, riskAdjustedScore: score(s) }))
    .sort((a, b) => b.riskAdjustedScore - a.riskAdjustedScore);
}

export function bestAllocatable(rows: RankedRow[]): RankedRow | undefined {
  return rows.find((r) => r.allocatable);
}

/** Pretty discovery table, including the gated benchmark row. */
export function renderDiscovery(rows: RankedRow[]): string {
  const lines: string[] = [];
  lines.push("RWA yield on Pharos (ranked, risk-adjusted):");
  lines.push("");
  lines.push("  asset   APY%     LTV%   liqThr%  status        score");
  lines.push("  ------  -------  -----  -------  ------------  -------");
  for (const r of rows) {
    const status = r.error
      ? "read-error"
      : !r.isActive
      ? "inactive"
      : r.isFrozen
      ? "frozen"
      : "allocatable";
    lines.push(
      `  ${r.reserve.symbol.padEnd(6)}  ${r.apyPct.toFixed(2).padStart(6)}  ` +
        `${r.ltvPct.toFixed(0).padStart(4)}  ${r.liquidationThresholdPct
          .toFixed(0)
          .padStart(6)}  ${status.padEnd(12)}  ${r.riskAdjustedScore.toFixed(2).padStart(6)}`
    );
  }
  // benchmark row
  lines.push(
    `  ${BENCHMARK.name}\n    ~${BENCHMARK.apyPct.toFixed(1)}% APY — ${BENCHMARK.access} (shown for context, router will not deposit)`
  );
  return lines.join("\n");
}
