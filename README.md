# Pharos Yield Compass

**Compares Pharos lending yields and routes into the best, while mapping them
honestly against real-world-asset (RWA) vault yields.**

This skill does two clearly-separated things and is honest about the difference:

1. **Routes across lending markets.** It compares every reserve on the
   permissionless, Aave-style lending venues (OpenFi, ZonaLend), ranks them
   *risk-adjusted* on on-chain base APY, and supplies into the best allocatable
   one — with a real on-chain transaction.
2. **Benchmarks and (where confirmed) allocates RWA vaults.** It surfaces
   real-world-income vaults — the **Tulipa** multi-RWA credit vault (a confirmed
   allocatable deposit) and the gated **pAlpha** treasuries vault (a read-only
   benchmark) — in their own section, never blending them with lending.

## The distinction that matters (read this first)

There are two different sources of yield on Pharos. Treating them as the same is
wrong, and the whole identity of this skill is keeping them apart:

| | Lending yield | RWA-vault yield |
|---|---|---|
| **Source** | A crypto borrower pays interest | Real-world-asset payouts |
| **Shape** | Aave-style market (LTV, oracle, health factor) | ERC-4626 / ERC-7540 vault |
| **Liquidity** | Permissionless, instant in **and** out | Deposit may be open while **redemption is gated/term-locked** |
| **In this skill** | OpenFi, ZonaLend — ranked & allocatable | Tulipa (allocatable deposit), pAlpha (gated benchmark) |
| **Action** | `supply` / `withdraw` | a vault `deposit` (a *different* action) |

`discover` renders these as two labeled sections. Ranking and "best allocatable"
apply **within the lending section only**.

## Quick start

```bash
npm install
cp .env.example .env          # set PRIVATE_KEY before any write command
npx ts-node scripts/router-cli.ts discover                      # read-only; two sections
npx ts-node scripts/router-cli.ts position --address 0xYourWallet
npx ts-node scripts/router-cli.ts allocate --amount 50          # best lending market
npx ts-node scripts/router-cli.ts withdraw --asset USDC --max
```

`discover` needs no private key. `position`, `drag`, and `risk` run read-only
with `--address`; without it they derive the wallet from `PRIVATE_KEY`.
`allocate` and `withdraw` always require `PRIVATE_KEY`.

## Commands

| Command | What it does |
|---|---|
| `discover` | Two-category landscape: LENDING (ranked) + RWA-VAULT. |
| `allocate --amount N` | Supply into the best allocatable lending market. |
| `allocate --asset USDC --amount N` | Best lending venue for that asset. |
| `allocate --venue zonalend --asset USDC --amount N` | Supply a named lending venue. |
| `allocate --venue tulipa --amount N` | **Deposit** into the Tulipa RWA vault (explicit; prints an RWA notice). |
| `withdraw --asset USDC --max` | Withdraw from a lending venue (default OpenFi). |
| `withdraw --venue zonalend --asset USDC --amount N` | Withdraw from a named lending venue. |
| `position [--address 0x..]` | Supplied lending balances + RWA-vault holdings (with value). |
| `drag [--address 0x..]` | Idle / lower-yield capital (OpenFi). |
| `risk [--address 0x..]` | Borrow distance to liquidation HF=1 (OpenFi oracle). |

There is **no** `withdraw --venue tulipa`: Tulipa redemption is term-locked, and
the CLI says so instead of implying liquidity the vault does not grant.

## Confirmed addresses (mainnet, chain 1672)

| Venue | Kind | Address | What it is |
|---|---|---|---|
| OpenFi | lending | `0x30b2e1411fd2ed9f1f46f59497e2186ce5be3b26` | Pool / spender (supply/withdraw). |
| OpenFi USDC | token | `0xC879C018dB60520F4355C26eD1a6D572cdAC1815` | USDC, 6 decimals. |
| OpenFi oracle | oracle | `0x878aF9E17C0168bBCdB4f33890Bf8CDE7592a6d1` | 8-decimal price oracle (via `ADDRESSES_PROVIDER().getPriceOracle()`). |
| ZonaLend | lending | `0xda464e68208a3083eb65fe5c522a72aed1c1372a` | Aave-style pool (`getReservesList()` = USDC, WETH, WPROS). |
| ZonaLend data provider | reads | `0xA91424C666193C2b2fb684E25dEadf03B333f49A` | Holds `getReserveConfigurationData` (pool reverts on it). |
| ZonaLend oracle | oracle | `0x6bEDfCa244f29dD916fe7c50e1469C6188B873f9` | 8-decimal price oracle. |
| ZonaLend WPROS | token | `0x52C48d4213107b20bC583832b0d951FB9CA8F0B0` | WPROS reserve, 18 decimals. |
| Tulipa vault | rwa-vault | `0xbae9272f71db2dc9d053e3c6c4840df65ae6aec5` | ERC-4626 vault + `tulPRWA` share token; `asset()` = USDC. |

USDC (`0xC879…`) is the same token on OpenFi, ZonaLend, and Tulipa.

## APY policy: base vs incentivized

ZonaLend advertises a **~210% "total net APY"** for USDC. That is base lending
rate **plus** points/token incentives, and it decays. This skill distinguishes:

- **baseApy** — the protocol's on-chain `liquidityRate` (ray → APY). Sustainable,
  verifiable. **This is the ranked/routed number.** At build time: OpenFi USDC
  ≈ 6%, ZonaLend USDC ≈ 4%, ZonaLend WPROS ≈ 3%.
- **incentive / total APY** — only shown if a verifiable on-chain source exists.
  ZonaLend's incentive APY is **not** readable on-chain, so the ~210% headline is
  surfaced **only** as a labeled note: *"advertised total ~210% incl. incentives
  (NOT on-chain verified)."* It is never ranked on and never routed on.

## Tulipa: the decoded deposit interface

Tulipa is a **confirmed allocatable** RWA vault. The interface was decoded from a
real, settled user deposit (not assumed):

- **Deposit tx** `0x0a6cfec5171f068ff113d8b03f265a74270e64dc91226fef3a8a4ec3a2f9b19d`
  called the vault directly with selector **`0x50921b23`** =
  `depositWithPermit(uint256 assets, address receiver, uint256 deadline, uint8 v, bytes32 r, bytes32 s)`
  (it deposited `100000` = 0.1 USDC; the `v/r/s` is an EIP-2612 USDC permit, so
  approval + deposit happened in one tx — confirmed by the USDC `Approval` +
  `Transfer` logs and the share-mint log).
- **The adapter wires this EXACT method.** It builds an EIP-2612 USDC permit
  (owner = wallet, spender = vault, value = assets; the EIP-712 domain is
  self-checked against the token's `DOMAIN_SEPARATOR` — USDC `name` "USDC",
  `version` "2"), pre-flights the call with `staticCall`, then sends
  `depositWithPermit(assets, receiver, deadline, v, r, s)` — no separate approve.
  Re-confirmed live: a 0.01 USDC deposit through the adapter used selector
  `0x50921b23` →
  `0x056966127e677d23f699f8695e947058b3ef70f909d6818e19b97d796573ad42`. (The
  plain ERC-4626 `deposit(assets,receiver)` `0x6e553f65` also exists and is kept
  in the ABI, but the permit method is the one used.)
- **Read side (verified):** `asset()` = USDC, `symbol()` = `tulPRWA`,
  `decimals()` = 6, `convertToAssets(shares)` and `previewRedeem(shares)` resolve
  (1:1 at build time), `balanceOf(user)` reports shares. `position` reports the
  user's Tulipa shares and current USDC value from `convertToAssets`.

### Redemption: term-locked

`maxRedeem(user)` reports the **full** share balance, **yet** both
`redeem(shares, receiver, owner)` and `withdraw(assets, receiver, owner)` revert
on-chain with custom error **`0xa339e0ec`**. That is a term-lock/gate, not a
balance problem. So the skill wires **deposit + position-read only** and does
**not** offer instant withdraw for Tulipa. Funds remain in the vault until its
redemption window opens.

## Status: tested on-chain vs not

Verified **live on mainnet (chain 1672) on 2026-06-07** with `npx ts-node
scripts/router-cli.ts ...` against `https://rpc.pharos.xyz`:

- ✅ `npx tsc --noEmit` clean.
- ✅ **OpenFi unchanged (regression):** with `ENABLE_ZONA=false
  ENABLE_TULIPA=false`, `discover` returns USDC `6.00%` base APY, LTV `75`, liq
  threshold `78`, `allocatable`, score `4.68`; WETH `zero-rate`; best allocatable
  = OpenFi USDC. Identical to the pre-change skill.
- ✅ **ZonaLend (reads):** `discover` shows USDC `4.00%` (LTV 60 / liqThr 70) and
  WPROS `3.00%` (LTV 50 / liqThr 65), both `allocatable`, with the 210%
  advertised note on USDC. Config resolved from the Zona data provider; oracle
  `getAssetPrice(USDC)` ≈ `99971071`.
- ✅ **Tulipa (reads):** appears in the RWA-VAULT section as ALLOCATABLE;
  `position` reports the wallet's `tulPRWA` shares and current USDC value via
  `convertToAssets`; redemption confirmed term-locked (custom error
  `0xa339e0ec`).
- ✅ **Guards:** `withdraw --venue tulipa` is refused with a term-locked message;
  `allocate --venue tulipa` prints the RWA notice before any state change;
  default `allocate` routes to OpenFi USDC @ 6%.
- ✅ **All write paths executed live** (wallet
  `0x0Ac6bf160e208e67AF06d7F00c92AEfBbf089f95`, tiny amounts):
  - Tulipa `depositWithPermit` 0.01 USDC (selector `0x50921b23`) →
    `0x056966127e677d23f699f8695e947058b3ef70f909d6818e19b97d796573ad42`
  - OpenFi `allocate` 0.01 USDC →
    `0xec4690ac76ac1f297c814f13c86b033486ab3bec6bc7e369549bc96137ecf9e2`;
    `withdraw --max` →
    `0x1b399eb120de97a674b148d02421c8c6e5799ef1c11c24e61f903e5bea1f9fb1`
  - ZonaLend `allocate` 0.01 USDC →
    `0x171ab974be8f400ffcae98598e65709cc66d60db2e2aeff87e99a5f552065f0f`;
    `withdraw --max` →
    `0xf7d6ad719cd989195ad11aa261d4a649b5ba651428b9da0379e66ebaaab85354`

### Historical OpenFi verification (audit context, not current data)

These prove the OpenFi wiring was verified previously; run the CLI for current
state.

- Confirmed from a real mainnet supply tx: OpenFi pool `0x30b2e141…`, USDC
  `0xC879…`.
- Read path (June 4, 2026): OpenFi USDC `6.00%` / LTV 75 / liqThr 78
  allocatable; WETH active but zero-rate. `ADDRESSES_PROVIDER()` =
  `0x3078361290234F1269034e6f9aF90A7512159fb1`; `getPoolDataProvider()` =
  `0x3EF4724f0f2fabfA0ba96AfC711D64e6BE3367Fb`; `getPriceOracle()` =
  `0x878aF9E17C0168bBCdB4f33890Bf8CDE7592a6d1`; `getAssetPrice(USDC)` =
  `99957102`.
- Write path (June 4, 2026), wallet `0x0Ac6bf160e208e67AF06d7F00c92AEfBbf089f95`:
  `allocate --asset USDC --amount 0.01` →
  `0x13ddf2dd42a0b7fe8534aec8e0e413f425785173d0a47d79bba5ae904eb04c78`;
  `withdraw --asset USDC --max` →
  `0x3d7a9966c3c955153e60d28bff2cd01b546afd3540cdbbd2345fe48aa73fcb23`.

## Network & setup

- Mainnet (chain 1672) by default; RPC `https://rpc.pharos.xyz`.
  `PHAROS_NETWORK=testnet` switches to 688688 and the testnet OpenFi config.
- `.env`:
  ```bash
  PRIVATE_KEY=your_wallet_private_key_here
  PHAROS_NETWORK=mainnet
  RPC_URL=https://rpc.pharos.xyz
  ```
- **Venue toggles:** `ENABLE_ZONA=false` and/or `ENABLE_TULIPA=false` disable
  those venues instantly (discovery/position revert to OpenFi-only). Both default
  on for mainnet; both are force-off on testnet (no testnet deployments wired).
- All CLI commands need live RPC; in restricted sandboxes, run with network
  access up front. If every lending reserve read returns `read-error`, treat it
  as an RPC failure — do not answer from a benchmark or historical docs.

## Repository layout

- `SKILL.md` — agent-facing skill instructions and command mapping.
- `scripts/router-cli.ts` — CLI entry point (venue-aware).
- `scripts/config.ts` — network, OpenFi/Zona/Tulipa addresses, toggles, benchmark.
- `scripts/abi.ts` — Aave-style, ERC-20, oracle, and ERC-4626 ABIs.
- `scripts/reader.ts` / `scripts/router.ts` — OpenFi reserve reads + ranking (unchanged core).
- `scripts/execute.ts` — OpenFi approve/supply/withdraw (unchanged core).
- `scripts/analytics.ts` / `scripts/prices.ts` — yield-drag, liquidation risk, oracle.
- `scripts/venues/` — the adapter layer:
  - `types.ts` — `Venue` interface, `YieldKind`, risk score.
  - `openfi.ts` — wraps the verified OpenFi path unchanged.
  - `aave.ts` — generic Aave-style venue factory (used by ZonaLend).
  - `zonalend.ts`, `tulipa.ts` — the new venues.
  - `index.ts` — registry + `ENABLE_*` toggles.
  - `discovery.ts` — two-category ranking + rendering.

## Roadmap / benchmarks (tracked, not allocatable)

- **pAlpha** — gated institutional RWA vault (~14% APY via AquaFlux/Ember). Shown
  in the RWA-VAULT section as a benchmark; the router never deposits into it.
- **Morpho on Pharos** — official lending provider but institutional-vault-first,
  phased, isolated-market shape. Benchmark/roadmap only.
- **Top Nod rcPC** — term-locked credit vault (8% weekly / 15% 6-month).
  Benchmark; lockup/gating to be verified before any allocation.
- **LendAI** — no mainnet evidence (stale testnet). Out.
- **Pharos.money / PUSD** — CDP/stablecoin, a different primitive. Not a router
  venue.

(Tulipa is *allocatable*, so it lives in the main RWA-VAULT section, not here.)

## Suggested demo (~90s)

1. `discover` — show **both** categories: OpenFi 6% vs ZonaLend 4% base (with the
   210% headline shown as advertised-only), and the RWA-VAULT section with Tulipa
   ALLOCATABLE + pAlpha gated.
2. `allocate --amount <small>` — route into the best lending venue (OpenFi USDC),
   print the approve + supply tx hashes, open the supply tx on the explorer.
3. `position` — show the supplied balance now exists (and any Tulipa holding).
4. `withdraw --max` — close the lending loop with a real exit tx.

The point to land: the agent **compared** real on-chain yields across venues,
**ranked on verified base APY** (not a 210% headline), **kept lending and
RWA-vault yield honestly separate**, and **acted** with a real txhash — while
correctly refusing to imply instant liquidity for the term-locked Tulipa vault.

## Skill installation

Installation is **minimal and file-only** (~60 KB): place only `SKILL.md` and
`scripts/` into the agent's skills directory
(`~/.claude/skills/pharos-yield-compass/`). It does **not** need git history,
`README.md`/`AGENTS.md`, `package-lock.json`, `node_modules/`, or an
`npm install`. A shallow, sparse fetch keeps it lean:

```bash
DEST=~/.claude/skills/pharos-yield-compass
git clone --depth 1 --filter=blob:none --no-checkout \
  https://github.com/Jennycruzy/pharos-rwa-yield-router "$DEST"
git -C "$DEST" sparse-checkout set --no-cone /SKILL.md '/scripts/**'
git -C "$DEST" checkout
rm -rf "$DEST/.git"
```

Runtime dependencies (`ethers`, `ts-node`, `typescript`) are installed only in a
working copy when executing the CLI, not as part of skill installation.

## Safety

`allocate` re-reads the market and aborts if it's no longer allocatable; balance
(and Tulipa deposit cap) is checked first; approvals go only to the specific
market/vault used; the private key is read from env and never logged. The router
never deposits into the pAlpha benchmark, reaches Tulipa only on explicit
`--venue tulipa` with an RWA notice, and never offers an instant withdraw for the
term-locked Tulipa vault.
