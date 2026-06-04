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

**Still untested on-chain:** `allocate` and `withdraw` need a funded wallet and
a tiny real transaction before they should be described as proven.

**TODO to make it stronger (see below):**
- Add more reserve token addresses in `scripts/config.ts` so the router
  actually compares across assets (USDC alone isn't much of a "router").
- Add a real-wallet `drag` / `risk` run once `PRIVATE_KEY` or `--address` for
  the user's wallet is available. The commands are live-read tested, but not
  yet validated against the user's actual balances/borrows in this environment.
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
