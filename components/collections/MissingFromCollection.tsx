import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useSegments } from "expo-router";
import type React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/common/Text";
import SeerrPoster from "@/components/posters/SeerrPoster";
import { useSeerrCollectionMissing } from "@/hooks/useSeerrCollection";
import { opensSeerrPages } from "@/utils/seerr/libraryLinks";

/**
 * Under a library collection on the phone: the films of its TMDB collection
 * the library lacks, as Seerr's posters with their status, each opening the
 * film's Seerr page, where it is requested.
 */
export const MissingFromCollection: React.FC<{ collection: BaseItemDto }> = ({
  collection,
}) => {
  const { t } = useTranslation();
  const segments = useSegments();
  const opens = opensSeerrPages((segments as string[])[2]);
  // Nothing asked of Seerr from a tab where its posters draw nothing.
  const missing = useSeerrCollectionMissing(opens ? collection : undefined);

  if (missing.length === 0) return null;

  return (
    <View className='mt-6'>
      <Text className='font-bold text-lg mb-2 px-4'>
        {t("seerr.library_links.missing_from_collection")}
      </Text>
      {/* A ScrollView rather than a FlashList: in the grid's footer a
          horizontal FlashList has no height of its own to lay out in, and a
          collection's films are few enough to mount at once. The row takes
          the height of its posters. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
      >
        {missing.map((item) => (
          <SeerrPoster key={item.id} item={item} />
        ))}
      </ScrollView>
    </View>
  );
};
