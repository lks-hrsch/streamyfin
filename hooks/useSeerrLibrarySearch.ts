import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  notInLibrary,
  type SeerrSearchApi,
  searchOwnedTitles,
  seerrFirstPageQuery,
} from "@/utils/seerr/librarySearch";
import type { MovieResult, TvResult } from "@/utils/seerr/types";

const NOTHING: (MovieResult | TvResult)[] = [];

/**
 * What the library search lists under "Not in your library", on the phone and
 * the TV alike: Seerr's first page for the text, less what the library has.
 * Nothing is asked of Seerr or Jellyfin while it is off (Discover lists Seerr's
 * results itself), while the text is empty, or without a Seerr to ask.
 *
 * `found` is what the library search's own rows hold, which a search engine
 * other than Jellyfin's may have found where Jellyfin's text search does not.
 */
export const useSeerrLibrarySearch = ({
  seerrApi,
  query,
  enabled,
  found,
}: {
  seerrApi: SeerrSearchApi | undefined;
  query: string;
  enabled: boolean;
  found: readonly BaseItemDto[];
}) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const active = enabled && !!seerrApi && query.length > 0;

  const firstPage = useQuery({
    ...seerrFirstPageQuery(seerrApi, query),
    enabled: active,
  });

  const owned = useQuery({
    queryKey: ["search", "owned titles", query],
    queryFn: ({ signal }) =>
      searchOwnedTitles({ api, userId: user?.Id, query, signal }),
    enabled: active && !!api,
  });

  // Held back until the library has answered, or failed to: listed earlier, a
  // title it has would show and then go.
  const settled = owned.isSuccess || owned.isError;

  return useMemo(
    () =>
      active && settled
        ? notInLibrary(firstPage.data?.results, {
            query,
            library: [...found, ...(owned.data ?? [])],
          })
        : NOTHING,
    [active, settled, firstPage.data, owned.data, found, query],
  );
};
