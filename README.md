# Pharos RWA Yield Router

Discovers live RWA yields on Pharos (OpenFi lending), ranks them **risk-adjusted**
using on-chain liquidation config, and supplies into the best *accessible*
reserve. Surfaces the gated pAlpha institutional vault as a read-only benchmark
so the user sees what they can't reach versus what they can.

This is a router, not a depositor: the agent compares every reserve and shows
its work, rather than dumping funds into one hardcoded market.

## Quick start

```bash
npm install
cp .env.example .env          # set PRIVATE_KEY; mainnet is default
npx ts-node scripts/router-cli.ts discover     # read-only; confirms wiring
npx ts-node scripts/router-cli.ts drag --address 0xYourWallet
npx ts-node scripts/router-cli.ts risk --address 0xYourWallet
npx ts-node scripts/router-cli.ts allocate --amount 50
npx ts-node scripts/router-cli.ts position
npx ts-node scripts/router-cli.ts withdraw --asset USDC --max
```

## Skill Installation

Installation is **minimal and file-only**. The skill is ~60 KB and needs only
`SKILL.md` and `scripts/` placed in the agent's skills directory
(`~/.claude/skills/pharos-rwa-yield-router/`). It does **not** need the git
history, `README.md`/`AGENTS.md`, `package-lock.json`, `node_modules/`, or an
`npm install`.

Use this natural-language prompt with Codex or Claude:

> Install the Pharos RWA Yield Router skill from
> `https://github.com/Jennycruzy/pharos-rwa-yield-router`.

Agents should interpret that as: place only `SKILL.md` and `scripts/` into the
skill location so `SKILL.md` is readable — **not** a full `git clone` of the
repository. A shallow, sparse fetch keeps it lean:

```bash
DEST=~/.claude/skills/pharos-rwa-yield-router
git clone --depth 1 --filter=blob:none --no-checkout \
  https://github.com/Jennycruzy/pharos-rwa-yield-router "$DEST"
git -C "$DEST" sparse-checkout set --no-cone /SKILL.md '/scripts/**'
git -C "$DEST" checkout
rm -rf "$DEST/.git"
```

Runtime dependency installation is separate from skill installation. The CLI
uses `ethers`, `ts-node`, and `typescript`; install those only in a working copy
when executing `scripts/router-cli.ts`. Before the first CLI run, check for
`node_modules/` and run `npm install` if it is missing so `npx` uses the local
`ts-node` instead of stalling on package resolution.

## Historical Verification

These entries prove the wiring was verified previously; they are not current yield data. Run `discover`, `drag`, `risk`, `position`, `allocate`, or `withdraw` for the present state.


**Confirmed from a real mainnet supply transaction:**
- OpenFi pool / spender: `0x30b2e1411fd2ed9f1f46f59497e2186ce5be3b26`
- USDC token: `0xC879C018dB60520F4355C26eD1a6D572cdAC1815`

**Historical live read path verification (June 4, 2026):**
- `discover` on mainnet returns USDC at `6.00%` APY, `75%` LTV, `78%`
  liquidation threshold, `allocatable`; WETH is active/unfrozen but `zero-rate`.
- Pool `ADDRESSES_PROVIDER()` returns `0x3078361290234F1269034e6f9aF90A7512159fb1`.
- Addresses provider `getPoolDataProvider()` returns
  `0x3EF4724f0f2fabfA0ba96AfC711D64e6BE3367Fb`.
- Addresses provider `getPriceOracle()` returns
  `0x878aF9E17C0168bBCdB4f33890Bf8CDE7592a6d1`; `getAssetPrice(USDC)` returned
  `99957102` (8 decimals, about `$0.99957102`).

**Historical live write path verification (June 4, 2026):**
- Wallet used: `0x0Ac6bf160e208e67AF06d7F00c92AEfBbf089f95`.
- `allocate --asset USDC --amount 0.01` succeeded:
  `0x13ddf2dd42a0b7fe8534aec8e0e413f425785173d0a47d79bba5ae904eb04c78`.
- `withdraw --asset USDC --max` succeeded:
  `0x3d7a9966c3c955153e60d28bff2cd01b546afd3540cdbbd2345fe48aa73fcb23`.
- Final `position` read returned no supplied balances across configured reserves.

**Historical reserve verification (June 4, 2026):**
- USDC: `0xC879C018dB60520F4355C26eD1a6D572cdAC1815`, 6 decimals,
  active/unfrozen, allocatable.
- WETH: `0x1f4b7011Ee3d53969bb67F59428a9ec0477856E9`, 18 decimals,
  active/unfrozen, currently excluded from allocation because supply APY is `0%`.

## Reserve Coverage

The mainnet reserve list was read directly from OpenFi Pool `getReservesList()`
and currently contains USDC and WETH. Discovery, yield drag, liquidation risk,
and allocation all use the configured live reserve list.

## Agent Usage

Agents should install runtime dependencies with `npm install` if
`node_modules/` is missing, then call
`npx ts-node scripts/router-cli.ts discover` with network access first for any
exploratory yield request. All router CLI commands require live Pharos/OpenFi
RPC, so sandboxed agents should request network access before running them. If
`discover` returns `read-error` for every configured reserve, treat that as an
RPC/network failure and do not answer from pAlpha or historical docs alone. Use
write commands only after the user clearly asks to deposit or withdraw funds.

Natural-language requests map to CLI actions like this:

- "What's the best RWA yield on Pharos?" -> `discover`
- "Show me OpenFi rates" -> `discover`
- "Where am I losing yield?" -> `drag`
- "Find my idle USDC" -> `drag`
- "How close am I to liquidation?" -> `risk`
- "Put 50 USDC to work" -> `allocate --asset USDC --amount 50`
- "Earn the best available yield with 50 USDC" -> `allocate --amount 50`
- "Withdraw my USDC" -> `withdraw --asset USDC --max`
- "How much am I earning?" -> `position`

Read-only checks accept `--address 0xYourWallet`; without `--address`, the CLI
uses the wallet derived from `PRIVATE_KEY` in `.env`. If `.env` is missing, the
CLI creates it from `.env.example` and asks you to fill `PRIVATE_KEY`, then retry.

## Network

Mainnet (chain 1672) by default. `PHAROS_NETWORK=testnet` switches to 688688
and uses the testnet pool/provider/USDC from the original OpenFi doc. The CLI
must be allowed to reach the configured RPC URL; in restricted agent sandboxes,
run CLI commands with network access up front.

## Read-only intelligence

```bash
npx ts-node scripts/router-cli.ts drag --address 0xYourWallet
npx ts-node scripts/router-cli.ts risk --address 0xYourWallet
```

`drag` reports idle configured reserve tokens that could earn in OpenFi, plus
supplied capital that could move to a higher-APY reserve with equal-or-better
risk-adjusted profile. `risk` uses the OpenFi price oracle and the protocol's
own liquidation thresholds to report the aggregate collateral price drop buffer
for borrowed positions. With no `--address`, both commands derive the wallet
from `PRIVATE_KEY`.

Live wallet check on June 4, 2026: `drag` found `0.280771 USDC` idle with an
estimated `0.016846 USDC/year` yield drag; `risk` found no borrowed positions.

## Suggested demo (≈90s)

1. `discover` — show the ranked table with verified USDC/WETH reserves and the
   pAlpha 14% benchmark flagged "gated / not allocatable."
2. `allocate --amount <small>` — show it route into the best reserve, print the
   approve + supply tx hashes, and open the supply tx on the explorer.
3. `position` — show the supplied balance now exists.
4. `withdraw --max` — close the loop with a real exit tx.

The point to land: the agent **compared** real on-chain yields, **excluded** the
risky/gated ones, and **acted** — with a real txhash. The read-only analytics
submissions can't act; the swap submissions don't compare RWA yield.

## Safety

`allocate` re-reads the reserve and aborts if it's frozen/inactive; balance is
checked first; approvals go only to the OpenFi pool; the private key is read
from env and never logged. The router never deposits into the pAlpha benchmark.
