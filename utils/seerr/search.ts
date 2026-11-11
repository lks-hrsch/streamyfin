import { queryOptions } from "@tanstack/react-query";
import { uniqBy } from "lodash";
import { SEERR_SEARCH_PAGES } from "@/constants/Seerr";
import type { SeerrApi } from "@/hooks/useSeerr";

type SearchResult = Awaited<ReturnType<SeerrApi["search"]>>["results"][number];

// What Seerr's own site encodes on top of encodeURIComponent
// (encodeURIExtraParams, in its useDiscover hook).
const EXTRA_ENCODES: [RegExp, string][] = [
  [/\(/g, "%28"],
  [/\)/g, "%29"],
  [/!/g, "%21"],
  [/\*/g, "%2A"],
];

/**
 * A query string written the way Seerr's own site writes it.
 *
 * Seerr's API refuses a query that still holds a reserved character, and
 * axios writes a space as "+", which is one: "castlevania noct" came back
 * 400. A space goes out as %20 here, and the apostrophe as it is, as on
 * Seerr's site.
 */
export const seerrQueryString = (
  params: Record<string, string | number>,
): string =>
  Object.entries(params)
    .map(
      ([key, value]) =>
        `${key}=${EXTRA_ENCODES.reduce(
          (encoded, [reserved, code]) => encoded.replace(reserved, code),
          encodeURIComponent(String(value)),
        )}`,
    )
    .join("&");

/**
 * Seerr's first pages of results for what the user typed, each result once. A
 * result is told apart by its type and its number: a film, a series and a
 * person each have numbers of their own on TMDB, so one number can be all
 * three.
 *
 * The text goes out as typed. It used to go through URLSearchParams, which
 * reads its argument as a query string: "dune" went out as "dune=", which
 * moved results around, and a word still being typed found nothing
 * ("noctur": no result, where Seerr's own search finds 488). The pages after
 * the first are only asked for when there are any, as Seerr's site does.
 */
export const searchSeerr = async (
  api: Pick<SeerrApi, "search"> | undefined,
  text: string,
): Promise<SearchResult[]> => {
  if (!api) return [];

  const first = await api.search({ query: text, page: 1 });
  const last = Math.min(SEERR_SEARCH_PAGES, first?.totalPages ?? 1);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, last - 1) }, (_, index) =>
      api.search({ query: text, page: index + 2 }),
    ),
  );

  return uniqBy(
    [first, ...rest].flatMap((page) => page?.results ?? []),
    (result) => `${result.mediaType}:${result.id}`,
  );
};

/** A Seerr client as far as searching goes: its search, and its address. */
export type SeerrSearchApi = Pick<SeerrApi, "search"> & {
  axios: { defaults: { baseURL?: string } };
};

/**
 * Seerr's first pages for a text (searchSeerr), on one server. The address is
 * in the key because a server the plugin points the app at instead keeps the
 * session and the cache: nothing clears them, and the old server's results
 * would answer for the new one.
 */
export const seerrSearchKey = (
  api: SeerrSearchApi | undefined,
  query: string,
) =>
  ["search", "seerr", "results", api?.axios.defaults.baseURL, query] as const;

/**
 * Discover's search, one query for it on the phone (SeerrIndexPage) and on
 * the TV (the search page) alike.
 */
export const seerrSearchQuery = (
  api: SeerrSearchApi | undefined,
  query: string,
) =>
  queryOptions({
    queryKey: seerrSearchKey(api, query),
    queryFn: () => searchSeerr(api, query),
  });

/**
 * The page to ask for after `last` in a list Seerr gives a page at a time,
 * none past its last page.
 */
export const nextResultsPage = (
  last: { page: number; totalPages: number } | undefined,
): number | undefined =>
  last && last.page < last.totalPages ? last.page + 1 : undefined;
