import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type React from "react";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { PlayButton } from "@/components/PlayButton";
import { LibraryIssueButton } from "@/components/seerr/LibraryIssueButton";
import { useImageColorsReturn } from "@/hooks/useImageColorsReturn";
import { useSeriesPlayback } from "@/hooks/useSeriesPlayback";
import { episodeCode } from "@/utils/seriesPlaybackTarget";

/**
 * A series' Play on the phone: it starts the episode the series is at (the
 * one in progress, else the next unplayed) with the item page's own button,
 * casting and resuming included, named above it. Seerr's issue report sits
 * beside it, for the series as a whole, as on Seerr's page.
 */
export const SeriesPlayRow: React.FC<{
  item: BaseItemDto;
  episodes: BaseItemDto[] | undefined;
}> = ({ item, episodes }) => {
  const colors = useImageColorsReturn({ item });
  const { target, selectedOptions } = useSeriesPlayback(episodes);
  if (!target || !selectedOptions) return null;

  return (
    <View className='px-4 mb-4'>
      <Text className='opacity-50 mb-2' numberOfLines={1}>
        {[episodeCode(target), target.Name].filter(Boolean).join(" · ")}
      </Text>
      <View className='flex flex-row items-center'>
        <PlayButton
          item={target}
          selectedOptions={selectedOptions}
          colors={colors}
        />
        <LibraryIssueButton item={item} leadingGap={12} />
      </View>
    </View>
  );
};
