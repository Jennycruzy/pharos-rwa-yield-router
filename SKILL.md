---
name: pharos-rwa-yield-router
description: >-
  Discover and route capital into the best risk-adjusted RWA (real-world-asset)
  yield on the Pharos Network via the OpenFi lending protocol. Use this skill
  whenever the user wants to find, compare, or earn yield on tokenized
  real-world assets or stablecoins on Pharos — e.g. "what's the best RWA yield
  on Pharos?", "put my idle USDC to work", "supply into the highest-yielding
  reserve", "where can I earn on Pharos?", "show me OpenFi rates", "where am I
  losing yield?", "how close am I to liquidation?", "withdraw my USDC", or "how
  much am I earning?". The skill reads live per-reserve rates and on-chain risk
  config, ranks reserves on a risk-adjusted basis (not just raw APY), detects
  idle/lower-yield capital, monitors liquidation distance for borrows, and
  supplies into the best ALLOCATABLE reserve. It also surfaces the gated pAlpha
  institutional vault as a read-only benchmark. Trigger this for any "earn /
  yield / supply / lend / where to put my money on Pharos" request.
---

# Pharos RWA Yield Router

A risk-aware yield router for Pharos. It does three things one-shot lending
front-ends don't: it **compares every reserve**, it **ranks risk-adjusted**
(using on-chain liquidation config, not just APY), and it shows the **gated
institutional benchmark** so the user knows what they *can't* reach versus what
they can.

## Commands

All actions go through `scripts/router-cli.ts` (`npx ts-node`). Before the
first CLI execution in a fresh install, check for `node_modules/`; if it is
missing, run `npm install` once so `npx` uses the local `ts-node` instead of
stalling on package resolution.

**Discover — the ranked landscape (read-only, no funds):**
```
npx ts-node scripts/router-cli.ts discover
```
Prints every OpenFi reserve with APY, LTV, liquidation threshold, status
(allocatable / zero-rate / frozen / inactive), and a risk-adjusted score, plus
the pAlpha 14% benchmark row marked gated / not allocatable. If every live
reserve read returns `read-error`, treat that as an RPC/network failure, rerun
with network access, and do not answer from the pAlpha benchmark alone.

**Allocate — supply into the best (or a named) reserve:**
```
npx ts-node scripts/router-cli.ts allocate --amount 50
npx ts-node scripts/router-cli.ts allocate --asset USDC --amount 50
```
With no `--asset`, the router picks the best allocatable reserve itself.

**Withdraw:**
```
npx ts-node scripts/router-cli.ts withdraw --asset USDC --amount 50
npx ts-node scripts/router-cli.ts withdraw --asset USDC --max
```

**Position — what you're earning (read-only):**
```
npx ts-node scripts/router-cli.ts position
```

**Yield drag — idle or lower-yield capital (read-only):**
```
npx ts-node scripts/router-cli.ts drag --address 0xYourWallet
```
With no `--address`, the command derives the wallet from `PRIVATE_KEY`. If
`PRIVATE_KEY` is missing, the CLI creates `.env` from `.env.example` when
possible, then asks the user to fill `PRIVATE_KEY` and retry.

**Liquidation risk — borrow distance to HF=1 (read-only):**
```
npx ts-node scripts/router-cli.ts risk --address 0xYourWallet
npx ts-node scripts/router-cli.ts liq --address 0xYourWallet
```
Uses OpenFi's own price oracle discovered through `ADDRESSES_PROVIDER()`. If
`PRIVATE_KEY` is missing and no `--address` is supplied, the CLI creates `.env`
from `.env.example` when possible, then asks the user to fill `PRIVATE_KEY` and
retry.

## Translating natural language

- "best RWA yield on Pharos" / "show me rates" -> `discover`
- "put my idle USDC to work" / "earn the best yield, $50" -> `allocate --amount 50`
- "supply 50 USDC specifically" -> `allocate --asset USDC --amount 50`
- "where am I losing yield?" / "find idle capital" -> `drag`; if `PRIVATE_KEY` is missing, let the CLI create `.env`, tell the user to fill it, then retry after they confirm
- "how close am I to liquidation?" / "borrow risk" -> `risk`; same `.env` flow if `PRIVATE_KEY` is missing
- "pull my USDC out" -> `withdraw --asset USDC --max`
- "how much am I earning?" -> `position`

Lead with `discover` when the user is exploring; only `allocate` when they've
asked to actually deposit.

## How "risk-aware" works (not a vibe)

Ranking uses live on-chain config from `getReserveConfigurationData`:
reserves that are `isFrozen` or not `isActive`, or that pay a zero rate, are
**excluded from allocation entirely**. Among the rest, the score weights APY by
the reserve's liquidation threshold, so a high rate on weakly-configured
collateral doesn't automatically win. The router will never deposit into the
pAlpha benchmark — it's gated and shown for context only.

## Intelligence Features

`drag` reads ERC20 wallet balances and OpenFi supplied positions for configured
reserves. It flags idle balances in allocatable markets and supplied capital
that could move to a higher-APY reserve with equal-or-better risk-adjusted
profile. Output is ranked by estimated annualized yield lost.

`risk` reads each configured reserve's collateral, stable debt, variable debt,
liquidation threshold, and OpenFi oracle price. It reports aggregate health
factor and the collateral price drop buffer before HF reaches 1. If there are no
borrows, it prints `no borrowed positions`; it does not invent prices.

## Safety

- `allocate` re-reads the reserve at execution time and aborts if it's no
  longer allocatable.
- Balance is checked before supplying; the fill aborts rather than failing mid-way.
- Approvals go to the OpenFi pool only. Private key is read from env, never logged.

## Setup

Skill installation is file-only. Runtime setup is needed only when executing or
verifying the CLI locally.

1. `npm install` if `node_modules/` is missing
2. `cp .env.example .env`, set `PRIVATE_KEY`. Mainnet is the default
   (`PHAROS_NETWORK=mainnet`); set `testnet` for chain 688688.
3. Confirm the ABI with one read before trusting writes:
   `npx ts-node scripts/router-cli.ts discover` — if USDC shows a sane APY and
   status, the pool address, ABI, and rate math are all correct.

Mainnet OpenFi pool (`0x30b2e141…`) and USDC (`0xC879…`) are pre-filled and
were confirmed from a real supply transaction. The `get*Data` reads try the
pool first and fall back to the data provider discovered from the pool's
addresses provider.

Do not answer from historical documentation values. For current APY, reserve
status, oracle prices, tx hashes, position state, yield drag, or liquidation
risk, run the matching CLI command and report only what the live command returns.
Historical verification details and tx hashes are kept in `README.md` for audit
context only.
