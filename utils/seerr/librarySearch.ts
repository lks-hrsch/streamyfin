import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import {
  type QueryClient,
  queryOptions,
  skipToken,
} from "@tanstack/react-query";
import { orderBy } from "lodash";
import {
  SEERR_OWNED_TITLES_LIMIT,
  SEERR_SEARCH_REUSE_MS,
} from "@/constants/SeerrLibrarySearch";
import type { SeerrApi } from "@/hooks/useSeerr";
import { seerrTitleOf } from "./jellyfinBridge";
import { isMovieOrTvResult, mediaTypeOf, titleOf } from "./media";
import { searchSeerr } from "./search";
import {
  MediaStatus,
  type MediaType,
  type MovieResult,
  type Results,
  type TvResult,
} from "./types";

/** A Seerr client as far as searching goes: its search, and its address. */
export type SeerrSearchApi = Pick<SeerrApi, "search"> & {
  axios: { defaults: { baseURL?: string } };
};

/**
 * Discover's search: Seerr's first pages for a text (searchSeerr), on one
 * server. The address is in the key because a server the plugin points the
 * app at instead keeps the session and the cache: nothing clears them, and
 * the old server's results would answer for the new one.
 */
export const seerrSearchKey = (
  api: SeerrSearchApi | undefined,
  query: string,
) =>
  ["search", "seerr", "results", api?.axios.defaults.baseURL, query] as const;

/**
 * The first of those pages on its own, cached under its own key: it is all
 * the library search asks for, since that one runs for every text typed, where
 * Discover's runs only once the user switches to it.
 */
export const seerrFirstPageKey = (
  api: SeerrSearchApi | undefined,
  query: string,
) => [...seerrSearchKey(api, query), "first page"] as const;

export const seerrFirstPageQuery = (
  api: SeerrSearchApi | undefined,
  query: string,
) =>
  queryOptions({
    queryKey: seerrFirstPageKey(api, query),
    queryFn: api ? () => api.search({ query, page: 1 }) : skipToken,
    staleTime: SEERR_SEARCH_REUSE_MS,
  });

/**
 * Discover's search, started from the first page the library search already
 * holds rather than asking Seerr for it again. When Discover asks first, the
 * page it fetched is left in the cache for the library search the same way.
 *
 * The page is read and written rather than fetched through the cache: such a
 * fetch would run its own retries inside this query's, sixteen tries before
 * Discover gave up on a Seerr that is down, where this query alone makes four.
 */
export const seerrSearchQuery = (
  queryClient: QueryClient,
  api: SeerrSearchApi | undefined,
  query: string,
) =>
  queryOptions({
    queryKey: seerrSearchKey(api, query),
    queryFn: () =>
      searchSeerr(
        api && {
          search: async (params) => {
            if (params.page !== 1) return api.search(params);
            const { queryKey } = seerrFirstPageQuery(api, params.query);
            const cached = queryClient.getQueryState(queryKey);
            if (
              cached?.data &&
              !cached.isInvalidated &&
              Date.now() - cached.dataUpdatedAt < SEERR_SEARCH_REUSE_MS
            ) {
              return cached.data;
            }
            const page = await api.search(params);
            queryClient.setQueryData(queryKey, page);
            return page;
          },
        },
        query,
      ),
  });

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
  const { data } = await getItemsApi(api).getItems(
    {
      searchTerm: query,
      includeItemTypes: ["Movie", "Series"],
      recursive: true,
      userId,
      fields: ["ProviderIds"],
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
