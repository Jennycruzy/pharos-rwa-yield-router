#!/usr/bin/env ts-node
// ---------------------------------------------------------------------------
// CLI entry — the single surface the agent calls. Maps a natural-language
// request to one command (see SKILL.md).
//
//   discover                               two categories: LENDING + RWA-VAULT
//   allocate --amount 50                   supply into the best lending venue
//   allocate --asset USDC --amount 50      supply a specific asset (best venue)
//   allocate --venue zonalend --asset USDC --amount 50   supply a named venue
//   allocate --venue tulipa --amount 50    DEPOSIT into the Tulipa RWA vault
//   withdraw --asset USDC --amount 50 | --max   [--venue openfi|zonalend]
//   position                               supplied lending + RWA-vault holdings
//   drag [--address 0xYourWallet]          idle/lower-yield capital (OpenFi)
//   risk [--address 0xYourWallet]          borrow liquidation distance (OpenFi)
// ---------------------------------------------------------------------------

import { JsonRpcProvider, Wallet } from "ethers";
import { copyFileSync, existsSync } from "fs";
import { assertConfigured, RPC_URL } from "./config";
import {
  detectYieldDrag,
  liquidationRisk,
  renderLiquidationRisk,
  renderYieldDrag,
} from "./analytics";
import { VENUES, venueById } from "./venues";
import { discover, renderDiscovery, RankedLending } from "./venues/discovery";

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
      const d = await discover();
      console.log(renderDiscovery(d));

      const errored = d.lending.filter((r) => r.status === "read-error");
      if (d.lending.length > 0 && errored.length === d.lending.length) {
        console.error("\nerror: live reserve reads failed for every lending reserve.");
        console.error("This usually means the Pharos RPC is unreachable from the current sandbox; retry with network access.");
        for (const r of errored) console.error(`  ${r.venueId}/${r.symbol}: ${r.error}`);
        process.exit(1);
      }
      if (errored.length > 0) {
        console.error("\nwarning: some reserve reads failed; ranking excludes read-error reserves.");
        for (const r of errored) console.error(`  ${r.venueId}/${r.symbol}: ${r.error}`);
      }
      if (d.best) {
        console.log(`\nbest allocatable lending: ${d.best.venueId} ${d.best.symbol} @ ${d.best.baseApy.toFixed(2)}% baseAPY`);
      }
      break;
    }

    case "allocate": {
      const amount = Number(arg("amount"));
      if (!amount || amount <= 0) throw new Error("--amount required and must be > 0");
      const venueArg = arg("venue");
      const symbolArg = arg("asset");

      // Explicit venue (the only way to reach the Tulipa RWA vault).
      if (venueArg) {
        const v = venueById(venueArg);
        if (!v) throw new Error(`unknown venue ${venueArg} (enabled: ${VENUES.map((x) => x.id).join(", ")})`);
        if (!v.supply) throw new Error(`${v.title} is not allocatable`);
        const symbol = symbolArg ?? (v.kind === "rwa-vault" ? "USDC" : undefined);
        if (!symbol) throw new Error("--asset required for this venue");
        if (v.kind === "rwa-vault") {
          console.log(
            `NOTE: depositing into the ${v.title} — this is an RWA-VAULT position (real-world-asset exposure), NOT a lending supply. Redemption may be term-locked.`
          );
        }
        const res = await v.supply(symbol, amount);
        if (!res.ok) {
          console.error(`allocate aborted: ${res.reason}`);
          process.exit(1);
        }
        if (res.approveTx) console.log(`approved: ${res.approveTx}`);
        console.log(`${v.kind === "rwa-vault" ? "deposited" : "supplied"} ${amount} ${symbol} into ${v.id} — tx: ${res.txHash}`);
        break;
      }

      // No venue -> route into the best allocatable LENDING venue.
      const d = await discover();
      let target: RankedLending | undefined;
      if (symbolArg) {
        target = d.lending.find(
          (r) => r.allocatable && r.symbol.toUpperCase() === symbolArg.toUpperCase()
        );
        if (!target) throw new Error(`no allocatable lending venue for ${symbolArg}`);
      } else {
        target = d.best;
        if (!target) throw new Error("no allocatable lending venue right now");
      }
      const venue = venueById(target.venueId)!;
      console.log(`routing into best lending venue: ${venue.id} ${target.symbol} @ ${target.baseApy.toFixed(2)}% baseAPY`);
      const res = await venue.supply!(target.symbol, amount);
      if (!res.ok) {
        console.error(`allocate aborted: ${res.reason}`);
        process.exit(1);
      }
      if (res.approveTx) console.log(`approved: ${res.approveTx}`);
      console.log(`supplied ${amount} ${target.symbol} into ${venue.id} — tx: ${res.txHash}`);
      break;
    }

    case "withdraw": {
      const symbol = arg("asset");
      if (!symbol) throw new Error("--asset required");
      const venueArg = arg("venue") ?? "openfi"; // default OpenFi (back-compat)
      const v = venueById(venueArg);
      if (!v) throw new Error(`unknown venue ${venueArg} (enabled: ${VENUES.map((x) => x.id).join(", ")})`);
      if (!v.withdraw) {
        const extra =
          v.id === "tulipa"
            ? " Tulipa redemption is term-locked (redeem()/withdraw() revert on-chain); funds stay in the vault until its redemption window opens."
            : "";
        throw new Error(`${v.title} does not support instant withdraw.${extra}`);
      }
      const amount = flag("max") ? "max" : Number(arg("amount"));
      if (amount !== "max" && (!amount || amount <= 0))
        throw new Error("--amount required (or use --max)");
      const res = await v.withdraw(symbol, amount as number | "max");
      if (!res.ok) {
        console.error(`withdraw aborted: ${res.reason}`);
        process.exit(1);
      }
      console.log(`withdrew ${amount} ${symbol} from ${v.id} — tx: ${res.txHash}`);
      break;
    }

    case "position": {
      const user = userAddress();
      console.log(`positions for ${user}:`);
      let any = false;
      for (const v of VENUES) {
        if (!v.position) continue;
        try {
          const ps = await v.position(user);
          for (const p of ps) {
            any = true;
            const val = p.valueUsd != null ? ` (~$${p.valueUsd.toFixed(2)})` : "";
            console.log(`  [${p.kind}] ${v.id}: ${p.amount} ${p.symbol}${val}${p.note ? ` — ${p.note}` : ""}`);
          }
        } catch {
          /* skip venues that error */
        }
      }
      if (!any) console.log("  no positions across enabled venues");
      break;
    }

    case "drag": {
      // OpenFi-based intelligence (unchanged).
      const user = userAddress();
      const items = await detectYieldDrag(user);
      console.log(renderYieldDrag(user, items));
      break;
    }

    case "risk":
    case "liq": {
      // OpenFi-based liquidation analysis (unchanged).
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
