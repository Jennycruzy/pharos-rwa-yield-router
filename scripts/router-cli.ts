#!/usr/bin/env ts-node
// ---------------------------------------------------------------------------
// CLI entry — the single surface the agent calls. Maps a natural-language
// request to one command (see SKILL.md).
//
//   discover                      show the ranked, risk-adjusted RWA table
//   allocate --amount 50          supply into the best allocatable reserve
//   allocate --asset USDC --amount 50   supply into a specific reserve
//   withdraw --asset USDC --amount 50 | --max
//   position                      show what you're supplied into + APY
//   drag [--address 0xYourWallet] show idle/lower-yield capital
//   risk [--address 0xYourWallet] show borrow liquidation distance
// ---------------------------------------------------------------------------

import { JsonRpcProvider, Wallet } from "ethers";
import { copyFileSync, existsSync } from "fs";
import { assertConfigured, RPC_URL, RESERVES } from "./config";
import { rankReserves, bestAllocatable, renderDiscovery } from "./router";
import { supply, withdraw } from "./execute";
import { getUserPosition } from "./reader";
import { formatUnits } from "ethers";
import {
  detectYieldDrag,
  liquidationRisk,
  renderLiquidationRisk,
  renderYieldDrag,
} from "./analytics";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function ensureEnvTemplate(): boolean {
  if (existsSync(".env")) return false;
  if (existsSync(".env.example")) {
    copyFileSync(".env.example", ".env");
  }
  return existsSync(".env");
}

function userAddress(): string {
  const address = arg("address");
  if (address) return address;
  const pk = process.env.PRIVATE_KEY;
  if (!pk || pk === "your_wallet_private_key_here") {
    const created = ensureEnvTemplate();
    const hint = created
      ? "Created .env from .env.example. Fill PRIVATE_KEY in .env, then retry."
      : "Create .env from .env.example and set PRIVATE_KEY, then retry.";
    throw new Error(`${hint} Or pass --address for read-only checks.`);
  }
  return new Wallet(pk, new JsonRpcProvider(RPC_URL)).address;
}

async function main(): Promise<void> {
  assertConfigured();
  const cmd = process.argv[2];

  switch (cmd) {
    case "discover": {
      const rows = await rankReserves();
      console.log(renderDiscovery(rows));
      const failures = rows.filter((r) => r.error);
      if (failures.length === rows.length) {
        console.error("\nerror: live reserve reads failed for every configured OpenFi reserve.");
        console.error("This usually means the Pharos RPC is unreachable from the current sandbox; retry with network access.");
        for (const r of failures) {
          console.error(`  ${r.reserve.symbol}: ${r.error}`);
        }
        process.exit(1);
      }
      if (failures.length > 0) {
        console.error("\nwarning: some reserve reads failed; ranking excludes read-error reserves.");
        for (const r of failures) console.error(`  ${r.reserve.symbol}: ${r.error}`);
      }
      const best = bestAllocatable(rows);
      if (best) console.log(`\nbest allocatable: ${best.reserve.symbol} @ ${best.apyPct.toFixed(2)}% APY`);
      break;
    }

    case "allocate": {
      const amount = Number(arg("amount"));
      if (!amount || amount <= 0) throw new Error("--amount required and must be > 0");

      let symbol = arg("asset");
      if (!symbol) {
        // route into the best allocatable reserve
        const rows = await rankReserves();
        const best = bestAllocatable(rows);
        if (!best) throw new Error("no allocatable reserve right now");
        symbol = best.reserve.symbol;
        console.log(`routing into best reserve: ${symbol} @ ${best.apyPct.toFixed(2)}% APY`);
      }

      const res = await supply(symbol, amount);
      if (!res.ok) {
        console.error(`allocate aborted: ${res.reason}`);
        process.exit(1);
      }
      if (res.approveTx) console.log(`approved: ${res.approveTx}`);
      console.log(`supplied ${amount} ${symbol} — tx: ${res.txHash}`);
      break;
    }

    case "withdraw": {
      const symbol = arg("asset");
      if (!symbol) throw new Error("--asset required");
      const amount = flag("max") ? "max" : Number(arg("amount"));
      if (amount !== "max" && (!amount || amount <= 0))
        throw new Error("--amount required (or use --max)");
      const res = await withdraw(symbol, amount as number | "max");
      if (!res.ok) {
        console.error(`withdraw aborted: ${res.reason}`);
        process.exit(1);
      }
      console.log(`withdrew ${amount} ${symbol} — tx: ${res.txHash}`);
      break;
    }

    case "position": {
      const user = userAddress();
      console.log(`positions for ${user}:`);
      for (const r of RESERVES) {
        try {
          const p = await getUserPosition(r, user);
          if (p.suppliedRaw > 0n) {
            console.log(`  ${r.symbol}: ${formatUnits(p.suppliedRaw, p.decimals)} supplied`);
          }
        } catch {
          /* skip reserves that error */
        }
      }
      break;
    }

    case "drag": {
      const user = userAddress();
      const items = await detectYieldDrag(user);
      console.log(renderYieldDrag(user, items));
      break;
    }

    case "risk":
    case "liq": {
      const user = userAddress();
      const result = await liquidationRisk(user);
      console.log(renderLiquidationRisk(user, result));
      break;
    }

    default:
      console.log("commands: discover | allocate | withdraw | position | drag | risk  (see SKILL.md)");
  }
}

main().catch((e) => {
  console.error("error:", e?.message ?? e);
  process.exit(1);
});
