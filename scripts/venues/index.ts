// ---------------------------------------------------------------------------
// Venue registry. OpenFi is always present (the verified core). ZonaLend and
// Tulipa are gated behind ENABLE_ZONA / ENABLE_TULIPA so any can be disabled
// instantly; with both off, the skill behaves exactly like the OpenFi-only
// original.
// ---------------------------------------------------------------------------

import { ENABLE_TULIPA, ENABLE_ZONA } from "../config";
import { Venue } from "./types";
import { openfiVenue } from "./openfi";
import { zonalendVenue } from "./zonalend";
import { tulipaVenue } from "./tulipa";

export const VENUES: Venue[] = [
  openfiVenue,
  ...(ENABLE_ZONA ? [zonalendVenue] : []),
  ...(ENABLE_TULIPA ? [tulipaVenue] : []),
];

export const lendingVenues = (): Venue[] => VENUES.filter((v) => v.kind === "lending");
export const rwaVenues = (): Venue[] => VENUES.filter((v) => v.kind === "rwa-vault");

export function venueById(id: string): Venue | undefined {
  return VENUES.find((v) => v.id.toLowerCase() === id.toLowerCase());
}

export * from "./types";
