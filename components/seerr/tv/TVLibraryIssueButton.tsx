import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useCallback, useEffect, useRef } from "react";
import type { View } from "react-native";
import { TVButton } from "@/components/tv/TVButton";
import { useLibraryIssue } from "@/hooks/useLibraryIssue";
import { useTVIssueModal } from "@/hooks/useTVIssueModal";
import { scaleSize } from "@/utils/scaleSize";

// Long enough for the sheet's route to have left the screen.
const FOCUS_RESTORE_DELAY_MS = 300;

interface Props {
  item: BaseItemDto;
}

/**
 * The TV's report issue entry on a library movie or episode: the Seerr page's
 * sheet, in Seerr's issue yellow and sized as its neighbours in the row. Draws
 * nothing where Seerr would take no issue (see useLibraryIssue).
 */
export function TVLibraryIssueButton({ item }: Props) {
  const target = useLibraryIssue(item);
  const { showIssueModal } = useTVIssueModal();
  const button = useRef<View | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(focusTimer.current), []);

  const setButton = useCallback((ref: View | null) => {
    button.current = ref;
  }, []);

  // A closed sheet leaves Android TV with nothing focused, and the next Back
  // would leave the page: the button that opened it takes the focus back.
  const restoreFocus = useCallback(() => {
    clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(
      () =>
        (
          button.current as (View & { requestTVFocus?: () => void }) | null
        )?.requestTVFocus?.(),
      FOCUS_RESTORE_DELAY_MS,
    );
  }, []);

  if (!target) return null;
  return (
    <TVButton
      variant='warning'
      square
      refSetter={setButton}
      onPress={() => showIssueModal({ ...target, onClose: restoreFocus })}
    >
      <Ionicons name='warning-outline' size={scaleSize(28)} color='#FFFFFF' />
    </TVButton>
  );
}
