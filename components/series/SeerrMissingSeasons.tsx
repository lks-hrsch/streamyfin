import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BottomSheetModalMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import RequestModal from "@/components/seerr/RequestModal";
import { SeerrRequestIcon } from "@/components/seerr/SeerrRequestIcon";
import {
  SeerrBadgeColors,
  SeerrStatusColors,
  SheetColors,
} from "@/constants/Colors";
import { SEERR_STATUS_TINT_ALPHA } from "@/constants/Seerr";
import { useSeerrMissingSeasons } from "@/hooks/useSeerrMissingSeasons";
import { ANIME_KEYWORD_ID } from "@/utils/seerr/data";
import {
  type MissingSeasonBadge,
  missingSeasonIcon,
} from "@/utils/seerr/missingSeasons";
import { type MediaRequestBody, MediaType } from "@/utils/seerr/types";

// The request sheet's colours for each status (SeasonPicker), so a season
// reads the same here as in the sheet this section opens.
const STATUS_COLORS: Record<MissingSeasonBadge, string> = {
  not_requested: SheetColors.secondaryText,
  pending: SeerrStatusColors.pending,
  requested: SeerrStatusColors.requested,
  partially_available: SeerrStatusColors.available,
  failed: SeerrBadgeColors.danger.border,
};

const CIRCLE = 22;

/**
 * The seasons of a library series that Seerr does not report as available,
 * each with where it stands there, and the Seerr page's own request sheet
 * (RequestModal) to ask for them. Nothing when there is nothing to tell.
 */
export const SeerrMissingSeasons: React.FC<{
  item: BaseItemDto;
  episodes?: BaseItemDto[];
}> = ({ item, episodes }) => {
  const { t } = useTranslation();
  const {
    details,
    held,
    seasons,
    offersRequest,
    hasAdvancedRequestPermission,
  } = useSeerrMissingSeasons(item, episodes);
  const [requestBody, setRequestBody] = useState<MediaRequestBody>();
  const sheetRef = useRef<BottomSheetModalMethods>(null);

  if (!details) return null;

  // Written out rather than built, so each key reads as used.
  const statusText: Record<MissingSeasonBadge, string> = {
    not_requested: t("seerr.season_badge.not_requested"),
    pending: t("seerr.season_badge.pending"),
    requested: t("seerr.season_badge.requested"),
    partially_available: t("seerr.season_badge.partially_available"),
    failed: t("seerr.request_status.failed"),
  };
  const title = item.Name ?? details.name;

  // As the Seerr page opens it: Seerr's season table, nothing chosen yet.
  const openRequest = () => {
    setRequestBody({
      mediaId: details.id,
      mediaType: MediaType.TV,
      // TMDB sends null for a show it has no TVDB id for, and the request
      // schema takes a number or nothing.
      tvdbId: details.externalIds?.tvdbId ?? undefined,
      seasons: [],
    });
    sheetRef.current?.present();
  };

  return (
    <View className='px-4 mb-4'>
      <Text className='text-lg font-bold mb-2'>
        {t("seerr.series_page.missing_seasons")}
      </Text>
      <View
        style={{
          backgroundColor: SheetColors.group,
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {seasons.map((season, index) => {
          const color = STATUS_COLORS[season.badge];
          const icon = missingSeasonIcon(season, offersRequest)?.icon;
          const name =
            season.seasonNumber === 0
              ? t("seerr.specials")
              : t("seerr.season_number", {
                  season_number: season.seasonNumber,
                });
          const episodeCount = t("seerr.number_episodes", {
            count: season.episodeCount,
            episode_number: season.episodeCount,
          });
          return (
            <View key={season.seasonNumber}>
              {index > 0 && (
                <View
                  style={{
                    height: 1,
                    marginLeft: 14 + CIRCLE + 12,
                    backgroundColor: SheetColors.separator,
                  }}
                />
              )}
              <View
                accessible
                accessibilityLabel={[
                  name,
                  episodeCount,
                  statusText[season.badge],
                ].join(", ")}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                }}
              >
                <View
                  style={{
                    width: CIRCLE,
                    height: CIRCLE,
                    borderRadius: CIRCLE / 2,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: `${color}${SEERR_STATUS_TINT_ALPHA}`,
                  }}
                >
                  {icon && (
                    <MaterialCommunityIcons
                      name={icon}
                      size={14}
                      color={color}
                    />
                  )}
                </View>
                <View
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "baseline",
                    gap: 8,
                  }}
                >
                  <Text style={{ fontSize: 16 }} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text
                    style={{ fontSize: 13, color: SheetColors.secondaryText }}
                    numberOfLines={1}
                  >
                    {episodeCount}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, color }}>
                  {statusText[season.badge]}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      {offersRequest && (
        <Button
          color='purple'
          className='mt-3'
          onPress={openRequest}
          iconLeft={<SeerrRequestIcon />}
        >
          <Text className='text-sm'>
            {t("seerr.series_page.request_seasons")}
          </Text>
        </Button>
      )}
      <RequestModal
        ref={sheetRef}
        requestBody={requestBody}
        title={title}
        id={details.id}
        type={MediaType.TV}
        isAnime={details.keywords.some((k) => k.id === ANIME_KEYWORD_ID)}
        details={details}
        heldSeasons={held}
        advanced={hasAdvancedRequestPermission}
        // The request refreshes the details itself (requestMedia), and the
        // list with them.
        onRequested={() => {
          setRequestBody(undefined);
          sheetRef.current?.close();
        }}
        onDismiss={() => setRequestBody(undefined)}
      />
    </View>
  );
};
