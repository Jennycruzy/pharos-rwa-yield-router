---
name: pharos-yield-compass
description: >-
  Compares Pharos lending yields and routes into the best, while mapping them
  honestly against real-world-asset (RWA) vault yields. Use this skill whenever
  the user wants to find, compare, or earn yield on Pharos — e.g. "what's the
  best yield on Pharos?", "put my idle USDC to work", "compare Pharos lending
  rates", "supply into the highest-yielding market", "show me OpenFi / ZonaLend
  rates", "what RWA vaults pay on Pharos?", "deposit into the Tulipa RWA vault",
  "where am I losing yield?", "how close am I to liquidation?", "withdraw my
  USDC", or "how much am I earning?". It splits yield into two HONEST categories:
  (1) LENDING yield — permissionless Aave-style markets (OpenFi, ZonaLend) it can
  supply into and withdraw anytime, ranked risk-adjusted on on-chain base APY;
  and (2) RWA-VAULT yield — real-world-income vaults (Tulipa, the gated pAlpha
  benchmark) where a deposit is a different action and redemption may be
  term-locked. It reads live rates and risk config, ranks lending on verified
  base APY (never on unverified incentive headlines), allocates into the best
  allocatable lending market, and can deposit into the confirmed-allocatable
  Tulipa RWA vault on explicit request. Trigger this for any "earn / yield /
  supply / lend / compare rates / RWA vault on Pharos" request.
---

# Pharos Yield Compass

A lending router + RWA-vault intelligence tool for Pharos. It does what one-shot
lending front-ends don't, and it is HONEST about a distinction most tools blur:

There are **two different sources of yield** on Pharos, and they are not the same
thing:

1. **Lending yield** — supply USDC to an Aave-style market (OpenFi, ZonaLend); a
   borrower pays interest; you earn it. Permissionless, instant in/out. This is
   what the router **ranks and allocates into**.
2. **RWA-vault yield** — deposit into a vault holding a real-world income stream
   (Tulipa multi-RWA credit, the gated pAlpha treasuries vault). Yield is
   real-world-asset payouts. Often an ERC-4626 vault, sometimes gated and
   frequently **term-locked on redemption** even when deposits are open.

`discover` shows these in **two separate labeled sections** so the user always
knows which kind of position an action creates.

## Commands

All actions go through `scripts/router-cli.ts` (`npx ts-node`). Every CLI
command reads Pharos RPC, so in a sandboxed or restricted-network agent
environment, request network access before running the command instead of trying
a sandboxed run first. Before the first CLI execution in a fresh install, check
for `node_modules/`; if it is missing, run `npm install` once so `npx` uses the
local `ts-node` instead of stalling on package resolution.

**Discover — the two-category landscape (read-only, no funds):**
```
npx ts-node scripts/router-cli.ts discover
```
Prints a **LENDING YIELD** section (OpenFi + ZonaLend reserves with on-chain base
APY, LTV, liquidation threshold, status, and a risk-adjusted score) ranked on
base APY, and an **RWA-VAULT YIELD** section (Tulipa as an allocatable vault
deposit; pAlpha as a gated benchmark). If every live reserve read returns
`read-error`, treat that as an RPC/network failure — do not answer from the
benchmark alone.

**Allocate — supply into the best (or a named) market:**
```
npx ts-node scripts/router-cli.ts allocate --amount 50
npx ts-node scripts/router-cli.ts allocate --asset USDC --amount 50
npx ts-node scripts/router-cli.ts allocate --venue zonalend --asset USDC --amount 50
```
With no `--venue`/`--asset`, the router picks the best allocatable **lending**
market itself (ranked on on-chain base APY, risk-adjusted).

**Allocate into the Tulipa RWA vault (a DIFFERENT action — explicit only):**
```
npx ts-node scripts/router-cli.ts allocate --venue tulipa --amount 50
```
This is an RWA-vault deposit, not a lending supply. It is wired only on explicit
request and prints a clear notice. **Tulipa redemption is term-locked**, so there
is no instant withdraw for it.

**Withdraw (lending venues only — instant):**
```
npx ts-node scripts/router-cli.ts withdraw --asset USDC --max
npx ts-node scripts/router-cli.ts withdraw --venue zonalend --asset USDC --amount 50
```
Defaults to OpenFi. Tulipa has no withdraw command because its redemption is
term-locked; the CLI says so rather than implying liquidity it lacks.

**Position — supplied lending + RWA-vault holdings (read-only):**
```
npx ts-node scripts/router-cli.ts position --address 0xYourWallet
```

**Yield drag — idle or lower-yield capital (read-only, OpenFi):**
```
npx ts-node scripts/router-cli.ts drag --address 0xYourWallet
```

**Liquidation risk — borrow distance to HF=1 (read-only, OpenFi):**
```
npx ts-node scripts/router-cli.ts risk --address 0xYourWallet
```

## Translating natural language

- "best yield on Pharos" / "compare rates" / "show me OpenFi or ZonaLend" -> `discover`
- "put my idle USDC to work" / "earn the best yield, $50" -> `allocate --amount 50`
- "supply 50 USDC on ZonaLend" -> `allocate --venue zonalend --asset USDC --amount 50`
- "deposit into the Tulipa RWA vault" -> `allocate --venue tulipa --amount 50` (explain it's an RWA-vault position, term-locked redemption)
- "what RWA vaults pay on Pharos?" -> `discover` (read the RWA-VAULT section)
- "where am I losing yield?" -> `drag`; if `PRIVATE_KEY` is missing, let the CLI create `.env`, tell the user to fill it, then retry
- "how close am I to liquidation?" -> `risk`; same `.env` flow if `PRIVATE_KEY` is missing
- "pull my USDC out" -> `withdraw --asset USDC --max`
- "how much am I earning?" -> `position`

Lead with `discover` when the user is exploring; only `allocate`/deposit when
they've asked to actually move funds.

## Base vs incentivized APY (why we don't trust the headline)

ZonaLend advertises a ~210% "total net APY" for USDC. That is almost certainly
base lending rate **plus** points/token incentives, and it decays. The skill
ranks on **baseApy** — the protocol's on-chain `liquidityRate` (ray→APY),
sustainable and verifiable (USDC ≈ 4% on ZonaLend, ≈ 6% on OpenFi at build
time). The ~210% headline is shown only as a clearly-labeled, **not on-chain
verified** note and is **never** used to rank or route. Never present an
incentive headline as earned yield.

## How "risk-aware" works (not a vibe)

Lending ranking uses live on-chain config: reserves that are `isFrozen` or not
`isActive`, or that pay a zero rate, are excluded from allocation. Among the
rest, the score weights base APY by the reserve's liquidation threshold, so a
high rate on weakly-configured collateral doesn't automatically win. The router
never deposits into the gated pAlpha benchmark.

## Tulipa (confirmed allocatable RWA vault)

Tulipa ("Ember TulipaPRWA", `tulPRWA`) is an ERC-4626 vault whose asset is USDC.
Its deposit interface was decoded from a real settled deposit tx and the skill
wires that EXACT method: `depositWithPermit(assets,receiver,deadline,v,r,s)`
(selector `0x50921b23`) — an EIP-2612 USDC permit bundled with the ERC-4626
deposit in one tx, no separate approve. **Redemption is term-locked**:
`redeem`/`withdraw`
revert on-chain even though `maxRedeem` reports the balance, so the skill wires
deposit + position-read only and never offers instant withdraw. See README for
the decoded selector and addresses.

## Safety

- `allocate` re-reads the market at execution time and aborts if it's no longer
  allocatable; balance and (for Tulipa) deposit cap are checked first.
- Approvals go only to the specific market/vault being used. Private key is read
  from env, never logged.
- Tulipa is reached only via an explicit `--venue tulipa`, with a notice that it
  is an RWA-vault position with term-locked redemption.

## Setup

Skill installation is file-only (`SKILL.md` + `scripts/`). Runtime setup is
needed only when executing or verifying the CLI locally.

1. `npm install` if `node_modules/` is missing
2. `cp .env.example .env`, set `PRIVATE_KEY`. Mainnet is the default
   (`PHAROS_NETWORK=mainnet`, chain 1672); set `testnet` for 688688.
3. Confirm wiring with one network-enabled read: `discover`. If OpenFi USDC
   shows a sane base APY and `allocatable`, the core wiring is correct.

Venue toggles: `ENABLE_ZONA=false` and/or `ENABLE_TULIPA=false` disable those
venues instantly and revert `discover`/`position` to OpenFi-only behavior. Both
default on for mainnet and are force-off on testnet.

Do not answer from historical documentation values. For current APY, status,
prices, tx hashes, position state, yield drag, or liquidation risk, run the
matching CLI command and report only what the live command returns. Historical
verification details and tx hashes are kept in `README.md` for audit context.
