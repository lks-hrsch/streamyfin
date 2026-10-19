import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, TVFocusGuideView, View } from "react-native";
import { Text } from "@/components/common/Text";
import { TVSeerrPosterCard } from "@/components/tv/TVSeerrPosterCard";
import {
  SEERR_TV_ROW_PADDING,
  SEERR_TV_ROW_TITLE_GAP,
} from "@/constants/Seerr";
import { useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useSeerrCollectionMissing } from "@/hooks/useSeerrCollection";
import { scaleSize } from "@/utils/scaleSize";

interface Props {
  collection: BaseItemDto;
  /**
   * The grid's side padding and the space between its posters. The row
   * spans the grid edge to edge and lays its own posters out on the grid's
   * columns, so it reads as one more row of the collection, scrolling
   * sideways.
   */
  inset: number;
  gap: number;
}

/**
 * Under a library collection on the TV: the films of its TMDB collection the
 * library lacks, as Seerr's posters with their status, each opening the
 * film's Seerr page, where it is requested. No card takes the first focus,
 * which stays with the page's filter bar.
 */
export const TVMissingFromCollection: React.FC<Props> = ({
  collection,
  inset,
  gap,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const sizes = useScaledTVSizes();
  const typography = useScaledTVTypography();
  const missing = useSeerrCollectionMissing(collection);

  if (missing.length === 0) return null;

  return (
    <View style={{ marginTop: sizes.gaps.section, marginHorizontal: -inset }}>
      <Text
        style={{
          fontSize: typography.heading,
          fontWeight: "bold",
          color: "#FFFFFF",
          marginBottom: scaleSize(SEERR_TV_ROW_TITLE_GAP),
          marginLeft: inset,
        }}
      >
        {t("seerr.library_links.missing_from_collection")}
      </Text>
      {/* As wide as the page, so a move down from any column of the grid
          lands in the row, on its first card or the one last focused, however
          few cards it has. autoFocus only redirects focus that enters the
          guide: it takes none when the row mounts after Seerr answers, so the
          filter bar keeps the first focus. And the guide wraps the row rather
          than sitting above it, so a move up from a card leaves it for the
          grid without crossing it. The warning in docs/tv-focus-guide.md is
          about autoFocus beside bidirectional guides, and this page has none.
          A guide with destinations would need a second one for the way back
          up, and there is no single poster of the grid to send focus to. */}
      <TVFocusGuideView autoFocus>
        {/* A ScrollView rather than a FlatList: a collection's films are
            few, and every card mounted keeps focus moves predictable. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ overflow: "visible" }}
          contentContainerStyle={{
            paddingHorizontal: inset,
            // Room for a focused card to grow without being cut by the row.
            paddingVertical: scaleSize(SEERR_TV_ROW_PADDING),
            gap,
          }}
        >
          {missing.map((item) => (
            <TVSeerrPosterCard
              key={item.id}
              item={item}
              onPress={() =>
                router.push({
                  pathname: "/(auth)/(tabs)/(search)/seerr/page",
                  params: { id: String(item.id), mediaType: item.mediaType },
                })
              }
            />
          ))}
        </ScrollView>
      </TVFocusGuideView>
    </View>
  );
};
