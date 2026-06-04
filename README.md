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
npx ts-node scripts/router-cli.ts drag --address 0x...
npx ts-node scripts/router-cli.ts risk --address 0x...
npx ts-node scripts/router-cli.ts allocate --amount 50
npx ts-node scripts/router-cli.ts position
npx ts-node scripts/router-cli.ts withdraw --asset USDC --max
```

## What's confirmed vs. what to verify

**Confirmed from a real mainnet supply transaction:**
- OpenFi pool / spender: `0x30b2e1411fd2ed9f1f46f59497e2186ce5be3b26`
- USDC token: `0xC879C018dB60520F4355C26eD1a6D572cdAC1815`

**Confirmed live read path (June 4, 2026):**
- `discover` on mainnet returns USDC at `1.65%` APY, `75%` LTV, `78%`
  liquidation threshold, `allocatable`.
- Pool `ADDRESSES_PROVIDER()` returns `0x3078361290234F1269034e6f9aF90A7512159fb1`.
- Addresses provider `getPoolDataProvider()` returns
  `0x3EF4724f0f2fabfA0ba96AfC711D64e6BE3367Fb`.
- Addresses provider `getPriceOracle()` returns
  `0x878aF9E17C0168bBCdB4f33890Bf8CDE7592a6d1`; `getAssetPrice(USDC)` returned
  `99957102` (8 decimals, about `$0.99957102`).

**Confirmed live write path (June 4, 2026):**
- Wallet used: `0x0Ac6bf160e208e67AF06d7F00c92AEfBbf089f95`.
- `allocate --asset USDC --amount 0.01` succeeded:
  `0x4caa4fdb21b9dbb1979da72eea63c8dc820fed1a38a97711a82cb914eb282773`.
- `withdraw --asset USDC --max` succeeded:
  `0xa2f0710dbe30dd44ca6a5b2c386f2608cd70c888aa0a0214fab9f470a7d91164`.
- Final `position` read returned no supplied balances across configured reserves.

**TODO to make it stronger (see below):**
- Add more reserve token addresses in `scripts/config.ts` so the router
  actually compares across assets (USDC alone isn't much of a "router").
- Add more reserve token addresses before demoing multi-asset comparisons; the
  current verified mainnet reserve list contains only USDC.
- Optional RPC override in `.env` if the default mainnet RPC isn't reachable.

## Widening the router (the single highest-impact edit)

OpenFi is multi-asset (USDC, USDT, GOLD, TSLA, NVDA, WETH, WBTC...). The
comparison only matters if several reserves are listed. To add one: find its
token address on the explorer (look at any OpenFi supply tx for that asset),
then add `{ symbol, address, decimals }` to `RESERVES` in `config.ts`. The
discovery, ranking, and allocation all pick it up automatically.

## Network

Mainnet (chain 1672) by default. `PHAROS_NETWORK=testnet` switches to 688688
and uses the testnet pool/provider/USDC from the original OpenFi doc.

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
estimated `0.004633 USDC/year` yield drag; `risk` found no borrowed positions.

## Suggested demo (≈90s)

1. `discover` — show the ranked table with multiple reserves and the pAlpha
   14% benchmark flagged "gated / not allocatable." This is the money shot:
   the agent comparing and choosing.
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
