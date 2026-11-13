import { useCallback, useEffect, useRef } from "react";
import type { ViewInstance } from "react-native";
import { TVSheetTiming } from "@/constants/TVSheet";
import { requestTVFocus } from "@/utils/requestTVFocus";

/**
 * Hands the TV focus back to a page once a sheet it opened has closed. Android
 * TV leaves nothing focused when a modal route goes, and the next Back then
 * leaves the page (android-tv-modal-close-loses-focus): the page asks for the
 * focus itself, once the route has left the screen.
 *
 * `restoreFocus(target)` reads `target` when the wait is over, so a button
 * that went in the meantime reads as null and its fallback can take over. A
 * new call replaces one still waiting, the function it returns cancels it,
 * for an effect's cleanup, and so does unmounting.
 */
export const useTVFocusRestore = () => {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  return useCallback((target: () => ViewInstance | null | undefined) => {
    clearTimeout(timer.current);
    const pending = setTimeout(
      () => requestTVFocus(target()),
      TVSheetTiming.focusRestoreMs,
    );
    timer.current = pending;
    return () => clearTimeout(pending);
  }, []);
};
