import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity } from "react-native";
import {
  SeerrIssueSheet,
  type SeerrIssueSheetRef,
} from "@/components/seerr/SeerrIssueSheet";
import { SeerrIssueColors } from "@/constants/Colors";
import { useLibraryIssue } from "@/hooks/useLibraryIssue";
import { issueSubject } from "@/utils/seerr/libraryIssue";

// The round buttons beside Play are 48 points across.
const BUTTON_SIZE = 48;

interface Props {
  item: BaseItemDto;
  /** Space to the control before it, the gap the row keeps between its own. */
  leadingGap?: number;
}

/**
 * Reports an issue in Seerr from a library movie or episode, with the Seerr
 * page's sheet: round like the buttons beside Play, in Seerr's issue yellow.
 * Draws nothing where Seerr would take no issue (see useLibraryIssue).
 */
export function LibraryIssueButton({ item, leadingGap = 0 }: Props) {
  const { t } = useTranslation();
  const target = useLibraryIssue(item);
  const sheetRef = useRef<SeerrIssueSheetRef>(null);

  if (!target) return null;
  return (
    <>
      <TouchableOpacity
        accessibilityRole='button'
        accessibilityLabel={t("seerr.report_issue_button")}
        onPress={() => sheetRef.current?.present()}
        style={{
          marginLeft: leadingGap,
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          borderRadius: BUTTON_SIZE / 2,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: SeerrIssueColors.border,
          backgroundColor: SeerrIssueColors.background,
        }}
      >
        <Ionicons name='warning-outline' size={24} color='white' />
      </TouchableOpacity>
      <SeerrIssueSheet
        ref={sheetRef}
        mediaId={target.mediaId}
        subject={issueSubject(target.title, target.episode)}
        episode={target.episode}
      />
    </>
  );
}
