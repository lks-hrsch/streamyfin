import { MaterialCommunityIcons } from "@expo/vector-icons";
import type React from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewInstance } from "react-native";
import { Text } from "@/components/common/Text";
import { SeerrRequestIcon } from "@/components/seerr/SeerrRequestIcon";
import { TVButton } from "@/components/tv/TVButton";
import {
  SEERR_TV_NO_BADGE,
  SeerrBadgeColors,
  SeerrStatusBadgeColors,
  TVTextColors,
} from "@/constants/Colors";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";
import {
  type MissingSeason,
  missingSeasonIcon,
} from "@/utils/seerr/missingSeasons";
import {
  seerrSeasonLabel,
  seerrSeasonStatusText,
} from "@/utils/seerr/seasonText";

/** The button beside Play that opens the season request sheet. */
export const TVSeerrRequestSeasonsButton: React.FC<{
  onPress: () => void;
  disabled?: boolean;
  refSetter?: (ref: ViewInstance | null) => void;
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
        <SeerrRequestIcon size={scaleSize(28)} color={TVTextColors.primary} />
      </View>
      <Text
        style={{
          fontSize: typography.callout,
          fontWeight: "bold",
          color: TVTextColors.primary,
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

  return (
    <View style={{ marginTop: scaleSize(28) }}>
      <Text
        style={{
          fontSize: typography.callout,
          fontWeight: "600",
          color: TVTextColors.heading,
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
                  // A season nobody may ask for has no badge of its own.
                  backgroundColor: badge
                    ? SeerrStatusBadgeColors[badge.tone]
                    : SEERR_TV_NO_BADGE,
                }}
              >
                {badge && (
                  <MaterialCommunityIcons
                    name={badge.icon}
                    size={scaleSize(18)}
                    color={TVTextColors.primary}
                  />
                )}
              </View>
              <Text
                style={{
                  fontSize: typography.callout,
                  fontWeight: "600",
                  color: TVTextColors.primary,
                }}
              >
                {seerrSeasonLabel(t, season.seasonNumber)}
              </Text>
              <Text
                style={{
                  fontSize: typography.callout,
                  color:
                    season.badge === "failed"
                      ? SeerrBadgeColors.danger.border
                      : TVTextColors.secondary,
                }}
              >
                {seerrSeasonStatusText(t, season.badge)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};
