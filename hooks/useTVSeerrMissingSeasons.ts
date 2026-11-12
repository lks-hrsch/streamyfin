import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import type { ViewInstance } from "react-native";
import { useSeerrMissingSeasons } from "@/hooks/useSeerrMissingSeasons";
import { useTVFocusRestore } from "@/hooks/useTVFocusRestore";
import { useTVSeasonSelectModal } from "@/hooks/useTVSeasonSelectModal";
import { tvRequestModalAtom } from "@/utils/atoms/tvRequestModal";
import { tvSeasonSelectModalAtom } from "@/utils/atoms/tvSeasonSelectModal";

/**
 * The Seerr side of a series' TV page: the seasons Seerr does not report as
 * available, and the TV's season request sheet to ask for them, opened as the
 * Seerr page opens it (TVSeerrPage).
 */
export const useTVSeerrMissingSeasons = (
  item: BaseItemDto | undefined,
  episodes: BaseItemDto[] | undefined,
  /** Where the focus goes back to when the request button is gone. */
  fallbackFocus: ViewInstance | null,
) => {
  const {
    details,
    held,
    seasons,
    offersRequest,
    hasAdvancedRequestPermission,
  } = useSeerrMissingSeasons(item, episodes);
  const { showSeasonSelectModal } = useTVSeasonSelectModal();

  // A closed sheet leaves Android TV with nothing focused, and the next Back
  // then leaves the page: the page hands the focus back itself, to the button
  // that opened the sheet, or to the fallback once a request has left nothing
  // to ask for. The advanced sheet takes the season sheet's place before that
  // one is gone, so the two read as one.
  const seasonSheet = useAtomValue(tvSeasonSelectModalAtom);
  const requestSheet = useAtomValue(tvRequestModalAtom);
  const sheetOpen = seasonSheet !== null || requestSheet !== null;
  const opened = useRef(false);
  const buttonRef = useRef<ViewInstance | null>(null);
  const fallbackRef = useRef(fallbackFocus);
  fallbackRef.current = fallbackFocus;
  const restoreFocus = useTVFocusRestore();

  useEffect(() => {
    if (sheetOpen || !opened.current) return;
    opened.current = false;
    return restoreFocus(() => buttonRef.current ?? fallbackRef.current);
  }, [sheetOpen, restoreFocus]);

  const setButtonRef = useCallback((ref: ViewInstance | null) => {
    buttonRef.current = ref;
  }, []);

  const requestSeasons = useCallback(() => {
    if (!details) return;
    opened.current = true;
    showSeasonSelectModal({
      series: details,
      heldSeasons: held,
      title: item?.Name ?? details.name,
      mediaId: details.id,
      tvdbId: details.externalIds?.tvdbId ?? undefined,
      hasAdvancedRequestPermission,
      // The request refreshes the details itself (requestMedia), and the
      // list with them.
      onRequested: () => {},
    });
  }, [
    details,
    held,
    item?.Name,
    hasAdvancedRequestPermission,
    showSeasonSelectModal,
  ]);

  return {
    seasons,
    offersRequest,
    requestSeasons,
    setButtonRef,
  };
};
