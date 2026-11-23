import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  skipToken,
  type UseQueryResult,
  useQueries,
  useQuery,
} from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  fetchLibraryItem,
  libraryTitlesFoundBySeerr,
} from "@/utils/seerr/librarySearch";
import { type SeerrSearchApi, seerrFirstPageQuery } from "@/utils/seerr/search";

type Matches = { items: BaseItemDto[]; pending: boolean };

const NO_TITLES: ReturnType<typeof libraryTitlesFoundBySeerr> = [];
const NOTHING: Matches = { items: [], pending: false };

// At module level, so React Query hands back the same result while no lookup
// changed, and the rows built from it keep their memo.
const combineLookups = (lookups: UseQueryResult<BaseItemDto | null>[]) => ({
  items: lookups.flatMap((lookup) => (lookup.data ? [lookup.data] : [])),
  pending: lookups.some((lookup) => lookup.isPending),
});

/**
 * The library's films and series Seerr found for the text where Jellyfin's
 * own search did not: what a search in another language than the library's
 * metadata finds (libraryTitlesFoundBySeerr), on the phone and the TV alike.
 * Seerr's answer is the one "Not in your library" already asked for, from
 * the same cache; each title it adds is one lookup, as the user
 * (fetchLibraryItem), so nothing from a library they may not open shows.
 *
 * `found` is what the library search's movie and series rows hold, and
 * `settled` whether both have answered: asked before, a title they are about
 * to list would be looked up too. `pending` holds while any of it is still
 * out, so the search can wait before it says it found nothing.
 */
export const useSeerrLibraryMatches = ({
  seerrApi,
  query,
  found,
  settled,
}: {
  seerrApi: SeerrSearchApi | undefined;
  query: string;
  found: readonly BaseItemDto[];
  settled: boolean;
}): Matches => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const active = !!seerrApi && !!api && query.length > 0;

  const firstPage = useQuery({
    ...seerrFirstPageQuery(seerrApi, query),
    enabled: active,
  });

  const titles = useMemo(
    () =>
      active && settled
        ? libraryTitlesFoundBySeerr(firstPage.data?.results, found)
        : NO_TITLES,
    [active, settled, firstPage.data, found],
  );

  const lookups = useQueries({
    queries: titles.map((title) => ({
      queryKey: ["search", "library item", title.Id, user?.Id],
      queryFn: api
        ? ({ signal }: { signal: AbortSignal }) =>
            fetchLibraryItem({
              api,
              userId: user?.Id,
              itemId: title.Id,
              signal,
            })
        : skipToken,
    })),
    combine: combineLookups,
  });

  const pending =
    active && (firstPage.isPending || !settled || lookups.pending);

  return useMemo(
    () => (active ? { items: lookups.items, pending } : NOTHING),
    [active, lookups.items, pending],
  );
};
