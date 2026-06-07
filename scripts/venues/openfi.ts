// ---------------------------------------------------------------------------
// OpenFi venue adapter — a thin wrapper over the ALREADY-VERIFIED OpenFi path.
// It calls the existing reader/router/execute functions unchanged so OpenFi's
// numbers and decisions are produced by the same code as before. Do not add
// OpenFi-specific logic here; if OpenFi behavior must change, it is a bug.
// ---------------------------------------------------------------------------

import { formatUnits } from "ethers";
import { RESERVES, Reserve } from "../config";
import { snapshotReserve, getUserPosition } from "../reader";
import { supply as openfiSupply, withdraw as openfiWithdraw } from "../execute";
import { Venue, VReserveSnapshot, VPosition } from "./types";

function statusOf(s: { error?: string; isActive: boolean; isFrozen: boolean; allocatable: boolean }): string {
  if (s.error) return "read-error";
  if (!s.isActive) return "inactive";
  if (s.isFrozen) return "frozen";
  if (!s.allocatable) return "zero-rate";
  return "allocatable";
}

export const openfiVenue: Venue = {
  id: "openfi",
  title: "OpenFi",
  kind: "lending",
  allocatable: true,

  reserves: () => RESERVES,

  async snapshot(r: Reserve): Promise<VReserveSnapshot> {
    const s = await snapshotReserve(r); // existing, unchanged reader
    return {
      venueId: "openfi",
      venueTitle: "OpenFi",
      kind: "lending",
      symbol: r.symbol,
      baseApy: s.apyPct,
      apySource: "on-chain",
      ltvPct: s.ltvPct,
      liqThresholdPct: s.liquidationThresholdPct,
      allocatable: s.allocatable,
      status: statusOf(s),
      error: s.error,
    };
  },

  supply: (symbol, amt) => openfiSupply(symbol, amt),
  withdraw: (symbol, amt) => openfiWithdraw(symbol, amt),

  async position(user: string): Promise<VPosition[]> {
    const out: VPosition[] = [];
    for (const r of RESERVES) {
      try {
        const p = await getUserPosition(r, user);
        if (p.suppliedRaw > 0n) {
          out.push({
            venueId: "openfi",
            venueTitle: "OpenFi",
            kind: "lending",
            symbol: r.symbol,
            amount: Number(formatUnits(p.suppliedRaw, p.decimals)),
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
