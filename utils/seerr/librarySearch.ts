import type { Api } from "@jellyfin/sdk";
import {
  type BaseItemDto,
  type BaseItemKind,
  ItemFields,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { isAxiosError } from "axios";
import { orderBy } from "lodash";
import {
  SEERR_LIBRARY_MATCHES_LIMIT,
  SEERR_OWNED_TITLES_LIMIT,
} from "@/constants/SeerrLibrarySearch";
import { seerrTitleOf } from "./jellyfinBridge";
import { libraryItemOf } from "./libraryLinks";
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

/** An item id as Jellyfin writes it, whichever way Seerr kept it. */
const itemKey = (id: string | null | undefined) =>
  id?.replaceAll("-", "").toLowerCase();

/**
 * The library's films and series Seerr found for a text, that the library's
 * own search did not: a title typed in another language than the library's
 * ("Tribute von Panem" for The Hunger Games, in a library with English
 * metadata). Jellyfin matches a text against an item's name and original
 * title only; TMDB, which Seerr asks, against every translation and
 * alternative title, and Seerr names the Jellyfin item of each title its
 * library scan found (libraryItemOf).
 *
 * In Seerr's order, each item once, and at most SEERR_LIBRARY_MATCHES_LIMIT:
 * each one costs a request (fetchLibraryItem).
 */
export const libraryTitlesFoundBySeerr = (
  results: readonly Results[] | undefined,
  found: readonly Pick<BaseItemDto, "Id">[],
): (Pick<BaseItemDto, "Type"> & { Id: string })[] => {
  const seen = new Set(found.map((item) => itemKey(item.Id)));
  const titles: (Pick<BaseItemDto, "Type"> & { Id: string })[] = [];
  for (const result of results ?? []) {
    if (titles.length === SEERR_LIBRARY_MATCHES_LIMIT) break;
    const item = libraryItemOf(result);
    const id = item?.Id;
    if (!item || !id || seen.has(itemKey(id))) continue;
    seen.add(itemKey(id));
    titles.push({ ...item, Id: id });
  }
  return titles;
};

/**
 * A library item as the signed-in user sees it, or null when they may not
 * open it. Seerr's ids name items in every library, and GET /Items?ids= lists
 * an item of a library the user has no access to (Jellyfin 12.2 leaves the
 * user's libraries out of an id query); this lookup answers 404 for it.
 */
export const fetchLibraryItem = async ({
  api,
  userId,
  itemId,
  signal,
}: {
  api: Api;
  userId?: string;
  itemId: string;
  signal?: AbortSignal;
}): Promise<BaseItemDto | null> => {
  try {
    const { data } = await getLibraryApi(api).getItem(
      { itemId, userId },
      { signal },
    );
    return data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) return null;
    throw error;
  }
};

/**
 * A row of the library search, with what Seerr found in the library of the
 * row's type after what Jellyfin's search found, none twice. The row itself
 * when Seerr adds nothing to it, so its sort and render are not redone.
 */
export const withSeerrMatches = (
  found: BaseItemDto[] | undefined,
  matches: readonly BaseItemDto[],
  type: BaseItemKind,
): BaseItemDto[] | undefined => {
  const held = new Set(found?.map((item) => itemKey(item.Id)));
  const added = matches.filter(
    (item) => item.Type === type && !held.has(itemKey(item.Id)),
  );
  return added.length > 0 ? [...(found ?? []), ...added] : found;
};
