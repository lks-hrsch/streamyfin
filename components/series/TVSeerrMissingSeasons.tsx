import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useAtomValue } from "jotai";
import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { SeerrRequestIcon } from "@/components/seerr/SeerrRequestIcon";
import { TVButton } from "@/components/tv/TVButton";
import { SeerrBadgeColors, SeerrStatusBadgeColors } from "@/constants/Colors";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useSeerrMissingSeasons } from "@/hooks/useSeerrMissingSeasons";
import { useTVSeasonSelectModal } from "@/hooks/useTVSeasonSelectModal";
import { tvRequestModalAtom } from "@/utils/atoms/tvRequestModal";
import { tvSeasonSelectModalAtom } from "@/utils/atoms/tvSeasonSelectModal";
import { scaleSize } from "@/utils/scaleSize";
import {
  type MissingSeason,
  type MissingSeasonBadge,
  missingSeasonIcon,
} from "@/utils/seerr/missingSeasons";

// A season nobody may ask for has no badge of its own: a quiet circle.
const NO_BADGE_COLOR = "rgba(255,255,255,0.2)";

// How long a closed sheet's route takes to leave before the page can take the
// focus back, as the library toolbar waits (TVLibraryToolbar).
const FOCUS_RESTORE_DELAY_MS = 300;

type FocusableView = View & { requestTVFocus?: () => void };

/**
 * The Seerr side of a series' TV page: the seasons Seerr does not report as
 * available, and the TV's season request sheet to ask for them, opened as the
 * Seerr page opens it (TVSeerrPage).
 */
export const useTVSeerrMissingSeasons = (
  item: BaseItemDto | undefined,
  episodes: BaseItemDto[] | undefined,
  /** Where the focus goes back to when the request button is gone. */
  fallbackFocus: View | null,
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
  const buttonRef = useRef<View | null>(null);
  const fallbackRef = useRef(fallbackFocus);
  fallbackRef.current = fallbackFocus;

  useEffect(() => {
    if (sheetOpen || !opened.current) return;
    opened.current = false;
    const timer = setTimeout(
      () =>
        (
          (buttonRef.current ?? fallbackRef.current) as FocusableView | null
        )?.requestTVFocus?.(),
      FOCUS_RESTORE_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [sheetOpen]);

  const setButtonRef = useCallback((ref: View | null) => {
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

/** The button beside Play that opens the season request sheet. */
export const TVSeerrRequestSeasonsButton: React.FC<{
  onPress: () => void;
  disabled?: boolean;
  refSetter?: (ref: View | null) => void;
}> = ({ onPress, disabled, refSetter }) => {
  const typography = useScaledTVTypography();
  const { t } = useTranslation();

  return (
    <TVButton
      onPress={onPress}
      disabled={disabled}
      variant='secondary'
      refSetter={refSetter}
    >
      <View style={{ marginRight: scaleSize(10) }}>
        <SeerrRequestIcon size={scaleSize(28)} color='#FFFFFF' />
      </View>
      <Text
        style={{
          fontSize: typography.callout,
          fontWeight: "bold",
          color: "#FFFFFF",
        }}
      >
        {t("seerr.series_page.request_seasons")}
      </Text>
    </TVButton>
  );
};

/**
 * The missing seasons, each with Seerr's badge and where it stands, under the
 * page's buttons. Only to read: nothing here takes the focus, which goes from
 * the buttons straight down to the episodes.
 */
export const TVSeerrMissingSeasons: React.FC<{
  seasons: MissingSeason[];
  offersRequest: boolean;
}> = ({ seasons, offersRequest }) => {
  const typography = useScaledTVTypography();
  const { t } = useTranslation();

  if (seasons.length === 0) return null;

  // Written out rather than built, so each key reads as used.
  const statusText: Record<MissingSeasonBadge, string> = {
    not_requested: t("seerr.season_badge.not_requested"),
    pending: t("seerr.season_badge.pending"),
    requested: t("seerr.season_badge.requested"),
    partially_available: t("seerr.season_badge.partially_available"),
    failed: t("seerr.request_status.failed"),
  };

  return (
    <View style={{ marginTop: scaleSize(28) }}>
      <Text
        style={{
          fontSize: typography.callout,
          fontWeight: "600",
          color: "rgba(255,255,255,0.7)",
          marginBottom: scaleSize(12),
        }}
      >
        {t("seerr.series_page.missing_seasons")}
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          columnGap: scaleSize(32),
          rowGap: scaleSize(12),
        }}
      >
        {seasons.map((season) => {
          const badge = missingSeasonIcon(season, offersRequest);
          return (
            <View
              key={season.seasonNumber}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: scaleSize(10),
              }}
            >
              <View
                style={{
                  width: scaleSize(30),
                  height: scaleSize(30),
                  borderRadius: scaleSize(15),
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: badge
                    ? SeerrStatusBadgeColors[badge.tone]
                    : NO_BADGE_COLOR,
                }}
              >
                {badge && (
                  <MaterialCommunityIcons
                    name={badge.icon}
                    size={scaleSize(18)}
                    color='white'
                  />
                )}
              </View>
              <Text
                style={{
                  fontSize: typography.callout,
                  fontWeight: "600",
                  color: "#FFFFFF",
                }}
              >
                {season.seasonNumber === 0
                  ? t("seerr.specials")
                  : t("seerr.season_number", {
                      season_number: season.seasonNumber,
                    })}
              </Text>
              <Text
                style={{
                  fontSize: typography.callout,
                  color:
                    season.badge === "failed"
                      ? SeerrBadgeColors.danger.border
                      : "rgba(255,255,255,0.6)",
                }}
              >
                {statusText[season.badge]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};
