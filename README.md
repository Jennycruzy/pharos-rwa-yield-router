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
npx ts-node scripts/router-cli.ts allocate --amount 50
npx ts-node scripts/router-cli.ts position
npx ts-node scripts/router-cli.ts withdraw --asset USDC --max
```

## What's confirmed vs. what to verify

**Confirmed from a real mainnet supply transaction:**
- OpenFi pool / spender: `0x30b2e1411fd2ed9f1f46f59497e2186ce5be3b26`
- USDC token: `0xC879C018dB60520F4355C26eD1a6D572cdAC1815`

**Verify with one read before trusting writes:** run `discover`. If USDC shows
a believable APY and an `allocatable` status, then the pool address, the
Aave-style ABI (reused from the OpenFi testnet interface), and the ray->APY
math are all correct — including for `supply`/`withdraw`.

**TODO to make it stronger (see below):**
- Add more reserve token addresses in `scripts/config.ts` so the router
  actually compares across assets (USDC alone isn't much of a "router").
- If the `get*Data` reads revert on the pool, set `OPENFI.mainnet.provider`
  to the separate data contract (testnet split these; mainnet may not).
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
