import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useSeerr } from "@/hooks/useSeerr";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  missingCollectionParts,
  seerrCollectionIdOf,
  tmdbIdsOf,
} from "@/utils/seerr/libraryLinks";
import type { MovieResult } from "@/utils/seerr/types";

const NONE: MovieResult[] = [];

/**
 * The films of a Jellyfin collection's TMDB collection that the library does
 * not have, for the phone's collection page and the TV's alike.
 *
 * None when Seerr is not set up and for a collection without a TMDB number,
 * and none until Seerr and the collection's own films have both answered: a
 * film the collection holds must not flash up as missing while its number is
 * on its way.
 */
export const useSeerrCollectionMissing = (
  collection:
    | Pick<BaseItemDto, "Id" | "Type" | "ProviderIds">
    | null
    | undefined,
): MovieResult[] => {
  const { seerrApi } = useSeerr();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const collectionId = seerrApi ? seerrCollectionIdOf(collection) : undefined;
  const itemId = collection?.Id;

  const { data: details } = useQuery({
    queryKey: ["seerr", "collection", collectionId],
    queryFn: async () => seerrApi?.collectionDetails(collectionId!),
    enabled: !!seerrApi && collectionId !== undefined,
  });

  // Every film of the collection, apart from the page's grid, which is
  // filtered and loaded a page at a time. Matched to Seerr's parts by TMDB
  // number, so a film Jellyfin holds without one cannot be matched, and shows
  // as missing unless Seerr itself has it available. A list rather than a
  // Set: the query cache is written to disk as JSON.
  const { data: owned } = useQuery({
    queryKey: ["collection", itemId, "tmdb_ids"],
    queryFn: async () => {
      const response = await getItemsApi(api!).getItems({
        userId: user?.Id,
        parentId: itemId,
        includeItemTypes: ["Movie"],
        fields: ["ProviderIds"],
        enableImages: false,
        enableUserData: false,
      });
      return tmdbIdsOf(response.data.Items);
    },
    enabled: collectionId !== undefined && !!api && !!user?.Id && !!itemId,
    // Asked again each time the page opens, as the client does by default:
    // a film added to the collection since must stop showing as missing.
    staleTime: 0,
    refetchOnMount: true,
  });

  return useMemo(
    () =>
      details && owned ? missingCollectionParts(details.parts, owned) : NONE,
    [details, owned],
  );
};
