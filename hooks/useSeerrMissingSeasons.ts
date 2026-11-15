import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useMemo } from "react";
import { useSeerrRequestOffer } from "@/hooks/useSeerrRequestOffer";
import { useSeerrTitle } from "@/hooks/useSeerrTitle";
import {
  missingSeasons,
  seasonsHeldInFull,
} from "@/utils/seerr/missingSeasons";
import { MediaType, type TvDetails } from "@/utils/seerr/types";

/**
 * The seasons of a library series that Seerr does not report as available,
 * with where each stands, and whether the user may ask for them by the Seerr
 * page's own rule (useSeerrRequestOffer). `details` stays undefined, and the
 * page shows nothing, when Seerr is not set up, has no match for the series,
 * or every season is there. The request sheets take `held`, so that they
 * offer no season the list leaves out.
 */
export const useSeerrMissingSeasons = (
  series: BaseItemDto | null | undefined,
  /**
   * The series' episodes in the library, undefined until they are known:
   * until then nothing is listed, or a season the library holds would show.
   */
  episodes: BaseItemDto[] | undefined,
) => {
  const { mediaType, details } = useSeerrTitle(series);
  const tv =
    mediaType === MediaType.TV ? (details as TvDetails | undefined) : undefined;
  const offer = useSeerrRequestOffer(tv, MediaType.TV);
  const { specials } = offer;

  const held = useMemo(
    () => (tv && episodes ? seasonsHeldInFull(tv, episodes) : undefined),
    [tv, episodes],
  );
  const seasons = useMemo(
    () => (tv && held ? missingSeasons(tv, { specials, held }) : []),
    [tv, specials, held],
  );

  return {
    details: seasons.length > 0 ? tv : undefined,
    held,
    seasons,
    // The page's rule, but only for what the list leaves: Seerr's details
    // alone would offer a season the library holds and Seerr has not seen.
    offersRequest:
      offer.offersRequest && seasons.some((season) => season.requestable),
    hasAdvancedRequestPermission: offer.hasAdvancedRequestPermission,
  };
};
