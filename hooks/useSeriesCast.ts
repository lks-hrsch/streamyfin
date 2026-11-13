import {
  type BaseItemDto,
  type BaseItemPerson,
  ImageType,
  PersonKind,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getPersonApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { PEOPLE_STALE_TIME_MS } from "@/constants/People";
import { useServerVersion } from "@/hooks/useServerVersion";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { seriesCast } from "@/utils/jellyfin/people";
import { supportsPersonsUnderParent } from "@/utils/jellyfin/serverVersion";

const NO_ONE: BaseItemPerson[] = [];

/**
 * The cast of a series for its page: the actors the series credits, then the
 * actors of its episodes, see `seriesCast`. The episodes' are one request to
 * `/Persons`, asked only of Jellyfin 12 and newer: an older server ignores the
 * parent and would answer every person it knows. There, and until the server
 * has answered, the cast is the series' own.
 *
 * No one offline, where there is no person page to open: a disabled query
 * still hands back what it cached while online.
 */
export const useSeriesCast = (
  series: BaseItemDto | null | undefined,
): BaseItemPerson[] => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const isOffline = useOfflineMode();
  const serverVersion = useServerVersion({ enabled: !isOffline });
  const seriesId = series?.Id;
  const userId = user?.Id;

  const { data: episodeActors } = useQuery({
    // Not under ["item", id]: the favorite and played toggles rewrite what is
    // cached there as if it were the item itself. Nor under ["series", id],
    // the page's own item. The user is part of it: which episodes are counted
    // depends on what that user may see.
    queryKey: ["seriesCast", seriesId, userId],
    queryFn: async ({ signal }) => {
      if (!api || !userId || !seriesId) return [];
      const response = await getPersonApi(api).getPersons(
        {
          parentId: seriesId,
          // Not excludePersonTypes, which 10.11 ignores; and the guest stars
          // stay on their episode, see seriesCast.
          personTypes: [PersonKind.Actor],
          userId,
          // A card needs the face and nothing the user did with the person.
          enableUserData: false,
          enableImageTypes: [ImageType.Primary],
          imageTypeLimit: 1,
        },
        { signal },
      );
      return response.data.Items ?? [];
    },
    enabled:
      !isOffline &&
      !!api &&
      !!userId &&
      !!seriesId &&
      supportsPersonsUnderParent(serverVersion),
    staleTime: PEOPLE_STALE_TIME_MS,
  });

  const seriesPeople = series?.People;
  // One array per answer, so the row only renders again when the cast does.
  return useMemo(
    () => (isOffline ? NO_ONE : seriesCast(seriesPeople, episodeActors)),
    [isOffline, seriesPeople, episodeActors],
  );
};
