import { FlatList, View } from "react-native";
import { Text } from "@/components/common/Text";
import { TVSeerrPosterCard } from "@/components/tv/TVSeerrPosterCard";
import { useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import type { MovieResult, TvResult } from "@/utils/seerr/types";
import { SCALE_PADDING } from "./TVSearchSection";

interface Props {
  title: string;
  items: (MovieResult | TvResult)[];
  onItemPress: (item: MovieResult | TvResult) => void;
}

/**
 * The library search's last row on the TV: what Seerr found that the library
 * has not, laid out as the library's own rows above it (TVSearchSection), with
 * Seerr's badges on each poster. No poster asks for the first focus: the search
 * field keeps it while the user types.
 */
export const TVSeerrLibrarySearchRow: React.FC<Props> = ({
  title,
  items,
  onItemPress,
}) => {
  const typography = useScaledTVTypography();
  const sizes = useScaledTVSizes();

  if (items.length === 0) return null;

  return (
    <View style={{ overflow: "visible" }}>
      <Text
        style={{
          fontSize: typography.heading,
          fontWeight: "700",
          color: "#FFFFFF",
          marginBottom: 20,
          marginLeft: sizes.padding.horizontal,
          letterSpacing: 0.5,
        }}
      >
        {title}
      </Text>
      <FlatList
        horizontal
        data={items}
        // A film and a series can share a TMDB number.
        keyExtractor={(item) => `${item.mediaType}-${item.id}`}
        renderItem={({ item }) => (
          <View style={{ marginRight: sizes.gaps.item }}>
            <TVSeerrPosterCard item={item} onPress={() => onItemPress(item)} />
          </View>
        )}
        showsHorizontalScrollIndicator={false}
        removeClippedSubviews={false}
        style={{ overflow: "visible" }}
        contentContainerStyle={{
          paddingHorizontal: sizes.padding.horizontal,
          paddingVertical: SCALE_PADDING,
        }}
      />
    </View>
  );
};
