import {
  type BaseItemDto,
  ItemFields,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrTitle } from "@/hooks/useSeerrTitle";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import {
  canCreateIssues,
  issueTitleSource,
  libraryIssueTarget,
} from "@/utils/seerr/libraryIssue";

/**
 * Where a library movie or episode can report an issue in Seerr, or undefined
 * when it cannot: Seerr is not set up or unreachable offline, the user may not
 * create issues, or Seerr has no record of the title.
 */
export const useLibraryIssue = (item: BaseItemDto | null | undefined) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { seerrApi, seerrUser } = useSeerr();
  const isOffline = useOfflineMode();
  // Asked before anything is fetched: without it, every episode page would
  // load its series and every movie page would ask Seerr about its title for a
  // button that is never shown.
  const source =
    !isOffline && seerrApi && canCreateIssues(seerrUser?.permissions)
      ? issueTitleSource(item)
      : undefined;
  const seriesId = source === "series" ? item?.SeriesId : undefined;

  // Only the series' provider ids, which do not change while the page is open:
  // asked once, rather than polled with the page's own item.
  const { data: series } = useQuery({
    queryKey: ["library-issue-series", seriesId],
    queryFn: async () => {
      const response = await getItemsApi(api!).getItems({
        ids: [seriesId!],
        userId: user?.Id,
        fields: [ItemFields.ProviderIds],
      });
      // null, never undefined: React Query treats undefined as an error.
      return response.data.Items?.[0] ?? null;
    },
    enabled: !!api && !!user?.Id && !!seriesId,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const { details } = useSeerrTitle(
    source === "self" ? item : source === "series" ? series : undefined,
  );

  const mediaId = details?.mediaInfo?.id;
  return useMemo(
    () => (source ? libraryIssueTarget(item, mediaId) : undefined),
    [source, item, mediaId],
  );
};
