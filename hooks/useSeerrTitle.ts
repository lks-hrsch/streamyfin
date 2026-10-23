import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrTitleDetails } from "@/hooks/useSeerrDiscoverData";
import { seerrTitleOf } from "@/utils/seerr/jellyfinBridge";

/**
 * What Seerr knows about a Jellyfin movie or series: its type and TMDB number,
 * and its details (availability, seasons, requests) under the same query the
 * Seerr pages use, so the two share their cache. `details` stays undefined
 * when Seerr is not set up, for an item Seerr has no number for, and for
 * anything that is not a movie or a series.
 */
export const useSeerrTitle = (
  item: Pick<BaseItemDto, "Type" | "ProviderIds"> | null | undefined,
) => {
  const { seerrApi } = useSeerr();
  const title = seerrApi ? seerrTitleOf(item) : undefined;
  const query = useSeerrTitleDetails(title?.mediaType, title?.tmdbId);
  return {
    mediaType: title?.mediaType,
    tmdbId: title?.tmdbId,
    details: title ? query.data : undefined,
    isLoading: !!title && query.isLoading,
  };
};
