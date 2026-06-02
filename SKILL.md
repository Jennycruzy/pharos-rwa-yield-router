---
name: pharos-rwa-yield-router
description: >-
  Discover and route capital into the best risk-adjusted RWA (real-world-asset)
  yield on the Pharos Network via the OpenFi lending protocol. Use this skill
  whenever the user wants to find, compare, or earn yield on tokenized
  real-world assets or stablecoins on Pharos — e.g. "what's the best RWA yield
  on Pharos?", "put my idle USDC to work", "supply into the highest-yielding
  reserve", "where can I earn on Pharos?", "show me OpenFi rates", "withdraw my
  USDC", or "how much am I earning?". The skill reads live per-reserve rates and
  on-chain risk config, ranks reserves on a risk-adjusted basis (not just raw
  APY), and supplies into the best ALLOCATABLE reserve. It also surfaces the
  gated pAlpha institutional vault as a read-only benchmark. Trigger this for
  any "earn / yield / supply / lend / where to put my money on Pharos" request.
---

# Pharos RWA Yield Router

A risk-aware yield router for Pharos. It does three things one-shot lending
front-ends don't: it **compares every reserve**, it **ranks risk-adjusted**
(using on-chain liquidation config, not just APY), and it shows the **gated
institutional benchmark** so the user knows what they *can't* reach versus what
they can.

## Commands

All actions go through `scripts/router-cli.ts` (`npx ts-node`).

**Discover — the ranked landscape (read-only, no funds):**
```
npx ts-node scripts/router-cli.ts discover
```
Prints every OpenFi reserve with APY, LTV, liquidation threshold, status
(allocatable / frozen / inactive), and a risk-adjusted score, plus the pAlpha
14% benchmark row marked gated / not allocatable.

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

## Translating natural language

- "best RWA yield on Pharos" / "show me rates" -> `discover`
- "put my idle USDC to work" / "earn the best yield, $50" -> `allocate --amount 50`
- "supply 50 USDC specifically" -> `allocate --asset USDC --amount 50`
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

## Safety

- `allocate` re-reads the reserve at execution time and aborts if it's no
  longer allocatable.
- Balance is checked before supplying; the fill aborts rather than failing mid-way.
- Approvals go to the OpenFi pool only. Private key is read from env, never logged.

## Setup

1. `npm install`
2. `cp .env.example .env`, set `PRIVATE_KEY`. Mainnet is the default
   (`PHAROS_NETWORK=mainnet`); set `testnet` for chain 688688.
3. Confirm the ABI with one read before trusting writes:
   `npx ts-node scripts/router-cli.ts discover` — if USDC shows a sane APY and
   status, the pool address, ABI, and rate math are all correct.
4. Widen the router by adding more reserve token addresses in `scripts/config.ts`.

Mainnet OpenFi pool (`0x30b2e141…`) and USDC (`0xC879…`) are pre-filled and
were confirmed from a real supply transaction. The `get*Data` reads try the
pool first and fall back to a provider address if you set one.
