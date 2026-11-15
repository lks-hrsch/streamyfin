import { type Href, useSegments } from "expo-router";
import { useCallback } from "react";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import useRouter from "@/hooks/useAppRouter";
import { libraryItemOf } from "@/utils/seerr/libraryLinks";
import type { MediaInfo, MediaType } from "@/utils/seerr/types";

/** What a Seerr card knows of its title: enough to tell where it is. */
export interface SeerrTitleRef {
  mediaType?: MediaType | string;
  mediaInfo?: Partial<Pick<MediaInfo, "jellyfinMediaId" | "status">>;
}

/**
 * Opens a Seerr title the one way the app shows it. A title Seerr has found
 * in the library opens the library's page (libraryItemOf), in the tab the
 * card sits in: that page plays it, lists the episodes, downloads them, and
 * carries Seerr's part as well (the missing seasons, a request, an issue).
 * Seerr's own page is left for a title the library does not have, where a
 * request is all there is to do.
 */
export const useOpenSeerrTitle = () => {
  const router = useRouter();
  const segments = useSegments();
  const from = (segments as string[])[2] || "(home)";

  return useCallback(
    (title: SeerrTitleRef | null | undefined, seerrPage: Href) => {
      const inLibrary = libraryItemOf(title);
      router.push(
        inLibrary ? (getItemNavigation(inLibrary, from) as Href) : seerrPage,
      );
    },
    [router, from],
  );
};
