import { STATE_METRO_ZIPS, metroZipsForState } from "@/lib/geo/metro-zips";
import type { BuyerScope } from "./buyer-scope";
import { scopeDemandStates } from "./curated-rotation";

/** Query centers only: never use these to assign a listing's actual location. */
export function buyerSearchCenters(scope?: BuyerScope): string[] {
  return Array.from(
    new Set(
      scopeDemandStates(scope).flatMap((state) =>
        metroZipsForState(state, STATE_METRO_ZIPS[state]?.length || 1),
      ),
    ),
  );
}
