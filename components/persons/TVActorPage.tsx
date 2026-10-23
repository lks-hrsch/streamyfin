import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useSegments } from "expo-router";
import { useAtom } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image, prefetchServerImage } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import { Loader } from "@/components/Loader";
import { usePersonFactLines } from "@/components/persons/usePersonFactLines";
import { TVPosterCard } from "@/components/tv/TVPosterCard";
import { TVSeerrPosterCard } from "@/components/tv/TVSeerrPosterCard";
import { Colors } from "@/constants/Colors";
import { useScaledTVPosterSizes } from "@/constants/TVPosterSizes";
import { useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { usePersonProfile } from "@/hooks/usePersonProfile";
import { useTVItemActionModal } from "@/hooks/useTVItemActionModal";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import type { FilmographyEntry } from "@/utils/seerr/personProfile";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const HORIZONTAL_PADDING = 80;
const TOP_PADDING = 140;
const ACTOR_IMAGE_SIZE = 250;
const SCALE_PADDING = 20;

interface TVActorPageProps {
  personId: string;
}

export const TVActorPage: React.FC<TVActorPageProps> = ({ personId }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showItemActions } = useTVItemActionModal();
  const segments = useSegments();
  const from = (segments as string[])[2] || "(home)";
  const posterSizes = useScaledTVPosterSizes();
  const typography = useScaledTVTypography();
  const sizes = useScaledTVSizes();
  const ITEM_GAP = sizes.gaps.item;

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  // Track which filmography item is currently focused for dynamic backdrop
  const [focusedItem, setFocusedItem] = useState<BaseItemDto | null>(null);

  // Fetch actor details
  const { data: item, isLoading: isLoadingActor } = useQuery({
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

  const {
    facts,
    filmography,
    isLoading: isLoadingFilmography,
  } = usePersonProfile(item);
  const factLines = usePersonFactLines(facts);
  const firstLibraryItem = useMemo(
    () =>
      [...filmography.movies, ...filmography.shows].find(
        (entry) => entry.source === "library",
      )?.item,
    [filmography],
  );

  // Get backdrop URL from the currently focused filmography item
  // Changes dynamically as user navigates through the list
  const backdropUrl = useMemo(() => {
    // The focused library title, else the first one: a Seerr title has no
    // Jellyfin backdrop.
    const itemForBackdrop = focusedItem ?? firstLibraryItem;
    if (!itemForBackdrop) return null;
    return getBackdropUrl({
      api,
      item: itemForBackdrop,
      quality: 90,
      width: 1920,
    });
  }, [api, focusedItem, firstLibraryItem]);

  // Crossfade animation for backdrop transitions
  // Use two alternating layers for smooth crossfade
  const [activeLayer, setActiveLayer] = useState<0 | 1>(0);
  const [layer0Url, setLayer0Url] = useState<string | null>(null);
  const [layer1Url, setLayer1Url] = useState<string | null>(null);
  const layer0Opacity = useRef(new Animated.Value(1)).current;
  const layer1Opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!backdropUrl) return;

    let isCancelled = false;

    const performCrossfade = async () => {
      // Disk-only prefetch to avoid pinning large backdrops in memory cache.
      try {
        await prefetchServerImage(backdropUrl, api?.basePath, "disk");
      } catch {
        // Continue even if prefetch fails
      }

      if (isCancelled) return;

      // Determine which layer to fade in
      const incomingLayer = activeLayer === 0 ? 1 : 0;
      const incomingOpacity =
        incomingLayer === 0 ? layer0Opacity : layer1Opacity;
      const outgoingOpacity =
        incomingLayer === 0 ? layer1Opacity : layer0Opacity;

      // Set the new URL on the incoming layer
      if (incomingLayer === 0) {
        setLayer0Url(backdropUrl);
      } else {
        setLayer1Url(backdropUrl);
      }

      // Small delay to ensure image component has the new URL
      await new Promise((resolve) => setTimeout(resolve, 50));

      if (isCancelled) return;

      // Crossfade: fade in the incoming layer, fade out the outgoing
      Animated.parallel([
        Animated.timing(incomingOpacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(outgoingOpacity, {
          toValue: 0,
          duration: 500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (!isCancelled) {
          // After animation completes, switch the active layer
          setActiveLayer(incomingLayer);
        }
      });
    };

    performCrossfade();

    return () => {
      isCancelled = true;
    };
  }, [backdropUrl, api?.basePath]);

  // Get actor image URL
  const actorImageUrl = useMemo(() => {
    if (!item?.Id || !api?.basePath) return null;
    return `${api.basePath}/Items/${item.Id}/Images/Primary?fillWidth=${ACTOR_IMAGE_SIZE * 2}&fillHeight=${ACTOR_IMAGE_SIZE * 2}&quality=90`;
  }, [api?.basePath, item?.Id]);

  // Handle filmography item press
  const handleItemPress = useCallback(
    (filmItem: BaseItemDto) => {
      const navigation = getItemNavigation(filmItem, from);
      router.push(navigation as any);
    },
    [from, router],
  );

  // Every card is the same width, library or Seerr.
  const getItemLayout = useCallback(
    (_data: ArrayLike<FilmographyEntry> | null | undefined, index: number) => ({
      length: posterSizes.poster + ITEM_GAP,
      offset: (posterSizes.poster + ITEM_GAP) * index,
      index,
    }),
    [],
  );

  // The first card of the first row there is takes the first focus.
  const firstRow = filmography.movies.length > 0 ? "movies" : "shows";

  const renderEntry = useCallback(
    (row: "movies" | "shows") =>
      ({ item: entry, index }: { item: FilmographyEntry; index: number }) => (
        <View style={{ marginRight: ITEM_GAP }}>
          {entry.source === "library" ? (
            <TVPosterCard
              item={entry.item}
              orientation='vertical'
              onPress={() => handleItemPress(entry.item)}
              onLongPress={() => showItemActions(entry.item)}
              onFocus={() => setFocusedItem(entry.item)}
              hasTVPreferredFocus={row === firstRow && index === 0}
              width={posterSizes.poster}
              overlay={<TVInLibraryBadge />}
            />
          ) : (
            <TVSeerrPosterCard
              item={entry.credit}
              hasTVPreferredFocus={row === firstRow && index === 0}
              onPress={() =>
                router.push({
                  pathname: "/(auth)/(tabs)/(search)/seerr/page",
                  params: {
                    id: String(entry.credit.id),
                    mediaType: entry.credit.mediaType,
                  },
                })
              }
            />
          )}
        </View>
      ),
    [handleItemPress, showItemActions, posterSizes.poster, firstRow, router],
  );
  const renderMovieEntry = useMemo(() => renderEntry("movies"), [renderEntry]);
  const renderShowEntry = useMemo(() => renderEntry("shows"), [renderEntry]);
  const entryKey = useCallback(
    (entry: FilmographyEntry) =>
      entry.source === "library"
        ? `library-${entry.item.Id}`
        : `seerr-${entry.credit.mediaType}-${entry.credit.id}`,
    [],
  );

  if (isLoadingActor) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#000000",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Loader />
      </View>
    );
  }

  if (!item?.Id) return null;

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      {/* Full-screen backdrop with crossfade - two alternating layers */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        {/* Layer 0 */}
        <Animated.View
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            opacity: layer0Opacity,
          }}
        >
          {layer0Url ? (
            <Image
              source={{ uri: layer0Url }}
              style={{ width: "100%", height: "100%" }}
              contentFit='cover'
            />
          ) : (
            <View style={{ flex: 1, backgroundColor: "#1a1a1a" }} />
          )}
        </Animated.View>
        {/* Layer 1 */}
        <Animated.View
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            opacity: layer1Opacity,
          }}
        >
          {layer1Url ? (
            <Image
              source={{ uri: layer1Url }}
              style={{ width: "100%", height: "100%" }}
              contentFit='cover'
            />
          ) : (
            <View style={{ flex: 1, backgroundColor: "#1a1a1a" }} />
          )}
        </Animated.View>
        {/* Gradient overlay for readability */}
        <LinearGradient
          colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0.7)", "rgba(0,0,0,0.95)"]}
          locations={[0, 0.4, 1]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "100%",
          }}
        />
      </View>

      {/* Main content area */}
      <ScrollView
        style={{
          flex: 1,
        }}
        contentContainerStyle={{
          paddingTop: insets.top + TOP_PADDING,
          paddingHorizontal: insets.left + HORIZONTAL_PADDING,
          paddingBottom: 60,
        }}
      >
        {/* Top section - Actor image + Info */}
        <View
          style={{
            flexDirection: "row",
            marginBottom: 48,
          }}
        >
          {/* Left side - Circular actor image */}
          <View
            style={{
              width: ACTOR_IMAGE_SIZE,
              height: ACTOR_IMAGE_SIZE,
              borderRadius: ACTOR_IMAGE_SIZE / 2,
              overflow: "hidden",
              backgroundColor: "rgba(255,255,255,0.1)",
              marginRight: 50,
              borderWidth: 3,
              borderColor: "rgba(255,255,255,0.2)",
            }}
          >
            {actorImageUrl ? (
              <Image
                source={{ uri: actorImageUrl }}
                style={{ width: "100%", height: "100%" }}
                contentFit='cover'
              />
            ) : (
              <View
                style={{
                  flex: 1,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons
                  name='person'
                  size={80}
                  color='rgba(255,255,255,0.4)'
                />
              </View>
            )}
          </View>

          {/* Right side - Info */}
          <View style={{ flex: 1, justifyContent: "center" }}>
            {/* Actor name */}
            <Text
              style={{
                fontSize: typography.title,
                fontWeight: "bold",
                color: "#FFFFFF",
                marginBottom: 8,
              }}
              numberOfLines={2}
            >
              {item.Name}
            </Text>

            {/* Known for, born, died: Jellyfin and Seerr together */}
            {factLines.map((line, index) => (
              <Text
                key={line}
                style={{
                  fontSize: typography.callout,
                  color: "#9CA3AF",
                  marginBottom: index === factLines.length - 1 ? 16 : 4,
                }}
              >
                {line}
              </Text>
            ))}

            {/* Biography */}
            {!!facts.biography && (
              <Text
                style={{
                  fontSize: typography.body,
                  color: "#D1D5DB",
                  lineHeight: typography.body * 1.4,
                  maxWidth: SCREEN_WIDTH * 0.45,
                }}
                numberOfLines={4}
              >
                {facts.biography}
              </Text>
            )}
          </View>
        </View>

        {/* Filmography sections */}
        <View style={{ flex: 1, overflow: "visible" }}>
          {/* Movies Section */}
          {isLoadingFilmography ? (
            <View
              style={{
                height: 300,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Loader />
            </View>
          ) : (
            filmography.movies.length > 0 && (
              <View style={{ marginBottom: 32 }}>
                <Text
                  style={{
                    fontSize: typography.heading,
                    fontWeight: "600",
                    color: "#FFFFFF",
                    marginBottom: 16,
                    marginLeft: SCALE_PADDING,
                  }}
                >
                  {t("item_card.movies")}
                </Text>
                <FlatList
                  horizontal
                  data={filmography.movies}
                  keyExtractor={entryKey}
                  renderItem={renderMovieEntry}
                  showsHorizontalScrollIndicator={false}
                  initialNumToRender={6}
                  maxToRenderPerBatch={4}
                  windowSize={5}
                  removeClippedSubviews={false}
                  getItemLayout={getItemLayout}
                  style={{ overflow: "visible" }}
                  contentContainerStyle={{
                    paddingVertical: SCALE_PADDING,
                    paddingHorizontal: SCALE_PADDING,
                  }}
                />
              </View>
            )
          )}

          {/* Series Section */}
          {isLoadingFilmography ? (
            <View
              style={{
                height: 300,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Loader />
            </View>
          ) : (
            filmography.shows.length > 0 && (
              <View>
                <Text
                  style={{
                    fontSize: typography.heading,
                    fontWeight: "600",
                    color: "#FFFFFF",
                    marginBottom: 16,
                    marginLeft: SCALE_PADDING,
                  }}
                >
                  {t("item_card.shows")}
                </Text>
                <FlatList
                  horizontal
                  data={filmography.shows}
                  keyExtractor={entryKey}
                  renderItem={renderShowEntry}
                  showsHorizontalScrollIndicator={false}
                  initialNumToRender={6}
                  maxToRenderPerBatch={4}
                  windowSize={5}
                  removeClippedSubviews={false}
                  getItemLayout={getItemLayout}
                  style={{ overflow: "visible" }}
                  contentContainerStyle={{
                    paddingVertical: SCALE_PADDING,
                    paddingHorizontal: SCALE_PADDING,
                  }}
                />
              </View>
            )
          )}

          {/* Empty state - only show if both sections are empty and not loading */}
          {!isLoadingFilmography &&
            filmography.movies.length === 0 &&
            filmography.shows.length === 0 && (
              <Text
                style={{
                  color: "#737373",
                  fontSize: typography.callout,
                  marginLeft: SCALE_PADDING,
                }}
              >
                {t("common.no_results")}
              </Text>
            )}
        </View>
      </ScrollView>
    </View>
  );
};

/** On a library title's poster: it is there to play. */
const TVInLibraryBadge: React.FC = () => {
  const { t } = useTranslation();
  const typography = useScaledTVTypography();
  return (
    <View
      style={{
        position: "absolute",
        left: 8,
        top: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: "rgba(0,0,0,0.7)",
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: Colors.primary,
        }}
      />
      <Text
        style={{
          fontSize: typography.callout * 0.7,
          fontWeight: "600",
          color: "#FFFFFF",
        }}
      >
        {t("person_profile.in_library")}
      </Text>
    </View>
  );
};
