import type { Api } from "@jellyfin/sdk";
import {
  type BaseItemDto,
  ItemFields,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { orderBy } from "lodash";
import { SEERR_OWNED_TITLES_LIMIT } from "@/constants/SeerrLibrarySearch";
import { seerrTitleOf } from "./jellyfinBridge";
import { isMovieOrTvResult, mediaTypeOf, titleOf } from "./media";
import {
  MediaStatus,
  type MediaType,
  type MovieResult,
  type Results,
  type TvResult,
} from "./types";

/**
 * The library's films and series for a text, with their TMDB numbers and
 * little else: what notInLibrary holds Seerr's titles against. The search's
 * own rows stop at SEARCH_RESULT_LIMIT a type, and a title Seerr has not seen
 * arrive yet can rank below them. Jellyfin cannot look items up by a provider
 * id (12.2 has no such filter on /Items), so the text is asked again, wider.
 * Jellyfin's own search whatever the engine: what the library holds is its
 * answer to give.
 */
export const searchOwnedTitles = async ({
  api,
  userId,
  query,
  signal,
}: {
  api?: Api | null;
  userId?: string;
  query: string;
  signal?: AbortSignal;
}): Promise<BaseItemDto[]> => {
  if (!api || !query) return [];
  const { data } = await getLibraryApi(api).getItems(
    {
      searchTerm: query,
      includeItemTypes: ["Movie", "Series"],
      recursive: true,
      userId,
      fields: [ItemFields.ProviderIds],
      enableImages: false,
      enableUserData: false,
      enableTotalRecordCount: false,
      limit: SEERR_OWNED_TITLES_LIMIT,
    },
    { signal },
  );
  return data.Items ?? [];
};

const IN_LIBRARY = new Set<MediaStatus | undefined>([
  MediaStatus.AVAILABLE,
  MediaStatus.PARTIALLY_AVAILABLE,
]);

const titleKey = (mediaType: MediaType | undefined, tmdbId: number) =>
  `${mediaType}:${tmdbId}`;

/**
 * What a library search lists under "Not in your library", from Seerr's
 * answer for the same text: films and series, which can be requested, never a
 * person, nothing Seerr has blocklisted, which cannot be, and nothing the
 * library has. That is what Seerr reports as available, in full or in part
 * and in either quality, and what the library search itself found, matched by
 * TMDB number: Seerr only learns of a new arrival at its next library scan,
 * and only of the libraries it is set to scan.
 *
 * A title named exactly as typed comes first, as in Discover's rows; the rest
 * keep Seerr's order.
 */
export const notInLibrary = (
  results: readonly Results[] | undefined,
  {
    query,
    library = [],
  }: {
    query: string;
    library?: readonly Pick<BaseItemDto, "Type" | "ProviderIds">[];
  },
): (MovieResult | TvResult)[] => {
  const owned = new Set(
    library.flatMap((item) => {
      const title = seerrTitleOf(item);
      return title ? [titleKey(title.mediaType, title.tmdbId)] : [];
    }),
  );
  const typed = query.trim().toLowerCase();

  const titles = (results ?? [])
    .filter(isMovieOrTvResult)
    .filter(
      (result) =>
        result.mediaInfo?.status !== MediaStatus.BLOCKLISTED &&
        !IN_LIBRARY.has(result.mediaInfo?.status) &&
        !IN_LIBRARY.has(result.mediaInfo?.status4k) &&
        !owned.has(titleKey(mediaTypeOf(result), result.id)),
    );

  return orderBy(
    titles,
    [(result) => titleOf(result)?.toLowerCase() === typed],
    "desc",
  );
};
