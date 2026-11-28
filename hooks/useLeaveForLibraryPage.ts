import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useSegments } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import useRouter from "@/hooks/useAppRouter";
import type { SeerrTitleRef } from "@/hooks/useOpenSeerrTitle";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { libraryItemOf } from "@/utils/seerr/libraryLinks";

/**
 * Seerr's page gives way to the library's once Seerr's details say the title
 * is in the library: a title has one page, the library's, where it plays
 * (useOpenSeerrTitle). The cards open the library's page themselves; this is
 * for a card that knew nothing of the library, or a title that arrived while
 * its Seerr page was open.
 *
 * Only for an item the user can open: Seerr reads Jellyfin with its own
 * account, and an item in a library this user cannot see stays a Seerr page,
 * which can still take a request or an issue. `toLibrary` holds while the
 * item is asked for and once it is found, for the page to show nothing it
 * is about to leave.
 */
export const useLeaveForLibraryPage = (
  title: SeerrTitleRef | null | undefined,
) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const router = useRouter();
  const segments = useSegments();
  const from = (segments as string[])[2] || "(home)";
  const target = libraryItemOf(title);

  // Without a session there is nothing to ask, and nothing to wait for.
  const enabled = !!api && !!user?.Id && !!target;
  const {
    data: item,
    isError,
    isFetchedAfterMount,
  } = useQuery({
    queryKey: ["seerr", "library-item", target?.Id, user?.Id],
    queryFn: () =>
      getUserItemData({ api, itemId: target?.Id, userId: user?.Id }),
    enabled,
    // A 404 is an answer: the user cannot open the item, and asking again
    // would only hold the page back.
    retry: false,
  });

  // On focus only: a replace from a page under another one would replace
  // that one. And on this visit's answer: a cached one can name an item
  // deleted since, whose page would only fail.
  useFocusEffect(
    useCallback(() => {
      // A failed answer keeps the cached item as its data.
      if (!isFetchedAfterMount || isError || !item?.Id) return;
      router.replace(getItemNavigation(item, from) as never);
    }, [isFetchedAfterMount, isError, item, from, router]),
  );

  return { toLibrary: enabled && !isError && item !== null };
};
