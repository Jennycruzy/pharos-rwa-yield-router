// ---------------------------------------------------------------------------
// ZonaLend venue — second LENDING venue. Aave-style market verified on mainnet:
// see config.ts ZONA for the confirmed pool/data-provider/oracle and the
// base-vs-advertised APY policy. baseApy (~4% USDC) is on-chain and ranked; the
// advertised ~210% headline is incentive-inclusive, not on-chain, never ranked.
// ---------------------------------------------------------------------------

import { ZONA } from "../config";
import { makeAaveVenue } from "./aave";

export const zonalendVenue = makeAaveVenue({
  id: "zonalend",
  title: "ZonaLend",
  pool: ZONA.pool,
  dataProvider: ZONA.dataProvider,
  reserves: ZONA.reserves,
  note: ZONA.advertisedTotalApyNote,
});
