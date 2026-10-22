import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useSegments } from "expo-router";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, useWindowDimensions, View } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { OverviewText } from "@/components/OverviewText";
import {
  PARALLAX_HEADER_HEIGHT,
  ParallaxScrollView,
} from "@/components/ParallaxPage";
import { PersonFilmographyRow } from "@/components/persons/PersonFilmographyRow";
import { TVActorPage } from "@/components/persons/TVActorPage";
import { usePersonFactLines } from "@/components/persons/usePersonFactLines";
import { usePersonProfile } from "@/hooks/usePersonProfile";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { toImagePixels } from "@/utils/jellyfin/image/imagePixels";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { opensSeerrPages } from "@/utils/seerr/libraryLinks";

const page: React.FC = () => {
  const local = useLocalSearchParams();
  const { personId } = local as { personId: string };

  // Render TV-optimized page on TV platforms
  if (Platform.isTV) {
    return <TVActorPage personId={personId} />;
  }

  return <MobileActorPage personId={personId} />;
};

const MobileActorPage: React.FC<{ personId: string }> = ({ personId }) => {
  const { t } = useTranslation();

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { width: windowWidth } = useWindowDimensions();

  const { data: item, isLoading: l1 } = useQuery({
    queryKey: ["item", personId],
    queryFn: async () =>
      await getUserItemData({
        api,
        userId: user?.Id,
        itemId: personId,
      }),
    enabled: !!personId && !!api,
    staleTime: 60,
  });

  // Seerr's titles only where its pages open; see opensSeerrPages.
  const from = (useSegments() as string[])[2];
  const { facts, filmography, isLoading } = usePersonProfile(item, {
    withSeerr: opensSeerrPages(from),
  });
  const factLines = usePersonFactLines(facts);

  const backdropUrl = useMemo(
    () =>
      getBackdropUrl({
        api,
        item,
        quality: 90,
        // The image covers the header, which spans the window.
        width: toImagePixels(windowWidth),
        height: toImagePixels(PARALLAX_HEADER_HEIGHT),
      }),
    [api, item, windowWidth],
  );

  if (l1)
    return (
      <View className='justify-center items-center h-full'>
        <Loader />
      </View>
    );

  if (!item?.Id || !backdropUrl) return null;

  return (
    <ParallaxScrollView
      headerImage={
        <Image
          source={{
            uri: backdropUrl,
          }}
          style={{
            width: "100%",
            height: "100%",
          }}
        />
      }
    >
      <View className='flex flex-col space-y-4 my-4'>
        <View className='px-4 mb-4'>
          <Text selectable className='font-bold text-2xl mb-1'>
            {item.Name}
          </Text>
          {factLines.map((line) => (
            <Text key={line} className='opacity-50'>
              {line}
            </Text>
          ))}
          <OverviewText text={facts.biography} className='mt-4' />
        </View>

        <PersonFilmographyRow
          title={t("item_card.movies")}
          entries={filmography.movies}
          loading={isLoading}
        />
        <PersonFilmographyRow
          title={t("item_card.shows")}
          entries={filmography.shows}
          loading={isLoading}
        />
      </View>
    </ParallaxScrollView>
  );
};

export default page;
