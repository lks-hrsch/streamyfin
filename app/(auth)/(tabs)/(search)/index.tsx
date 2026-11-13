import {
  type BaseItemDto,
  type BaseItemKind,
  ItemFields,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useLocalSearchParams, useNavigation, useSegments } from "expo-router";
import { useAtom } from "jotai";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Platform,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CardRow } from "@/components/cards/CardRow";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import {
  getItemNavigation,
  TouchableItemRouter,
} from "@/components/common/TouchableItemRouter";
import SeerrPoster from "@/components/posters/SeerrPoster";
import { LoadingSkeleton } from "@/components/search/LoadingSkeleton";
import { SearchItemWrapper } from "@/components/search/SearchItemWrapper";
import { SearchSortMenu } from "@/components/search/SearchSortMenu";
import { searchView, showSearchSort } from "@/components/search/searchFilters";
import {
  LIBRARY_SORTS,
  type LibrarySort,
  type SortOrder,
  sortLibraryResults,
} from "@/components/search/searchSort";
import { TVSearchPage } from "@/components/search/TVSearchPage";
import { SeerrIndexPage } from "@/components/seerr/SeerrIndexPage";
import { SEARCH_RESULT_LIMIT } from "@/constants/Search";
import useRouter from "@/hooks/useAppRouter";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrLibrarySearch } from "@/hooks/useSeerrLibrarySearch";
import { useServerVersion } from "@/hooks/useServerVersion";
import { useTVItemActionModal } from "@/hooks/useTVItemActionModal";
import { useTVOptionModal } from "@/hooks/useTVOptionModal";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getIntegrationHeaders } from "@/utils/customHeaders";
import { isAbortLikeError } from "@/utils/errors";
import { eventBus } from "@/utils/eventBus";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { searchPeople, searchStudios } from "@/utils/jellyfin/search";
import { logAndCaptureError } from "@/utils/log";
import { isSeerrQuery } from "@/utils/seerr/queries";
import { loadDiscoverSliders } from "@/utils/seerr/sliders";
import type { MovieResult, TvResult } from "@/utils/seerr/types";
import { MediaType } from "@/utils/seerr/types";
import { createStreamystatsApi } from "@/utils/streamystats";

const exampleSearches = [
  "Lord of the rings",
  "Avengers",
  "Game of Thrones",
  "Breaking Bad",
  "Stranger Things",
  "The Mandalorian",
];

// The people and studio requests are covered by utils/jellyfin/search.test.ts,
// the TV's studio section by components/search/TVSearchPage.test.tsx, and what
// Seerr adds under the library's results by hooks/useSeerrLibrarySearch.test.tsx
// and utils/seerr/librarySearch.test.ts.
export default function SearchPage() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showItemActions } = useTVItemActionModal();
  const { showOptions } = useTVOptionModal();
  const segments = useSegments();
  const from = (segments as string[])[2] || "(search)";

  const [user] = useAtom(userAtom);

  const { t } = useTranslation();

  const { q } = params as { q: string };

  // Pulling down asks again for what the screen shows: Discover's rows, or
  // the results of the search.
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "search" || isSeerrQuery(query.queryKey),
      });
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);
  const [search, setSearch] = useState<string>("");

  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(timeout);
  }, [search]);

  const [api] = useAtom(apiAtom);
  const serverVersion = useServerVersion();

  const { settings } = useSettings();
  const { seerrApi } = useSeerr();
  // Relevance is the order the search engine answered with. Ascending, as
  // the library pages start.
  const [librarySort, setLibrarySort] = useState<LibrarySort>("Relevance");
  const [librarySortOrder, setLibrarySortOrder] = useState<SortOrder>("asc");

  const searchEngine = useMemo(() => {
    return settings?.searchEngine || "Jellyfin";
  }, [settings]);

  useEffect(() => {
    if (q && q.length > 0) {
      setSearch(q);
    }
  }, [q]);

  const searchFn = useCallback(
    async ({
      types,
      query,
      fields = [],
      signal,
    }: {
      types: BaseItemKind[];
      query: string;
      // Asked for on top of DateCreated, which the sort by date added needs.
      fields?: ItemFields[];
      signal?: AbortSignal;
    }): Promise<BaseItemDto[]> => {
      if (!api || !query) {
        return [];
      }

      try {
        if (searchEngine === "Jellyfin") {
          const searchApi = await getLibraryApi(api).getItems(
            {
              searchTerm: query,
              limit: SEARCH_RESULT_LIMIT,
              includeItemTypes: types,
              recursive: true,
              userId: user?.Id,
              // For the sort by date added.
              fields: [ItemFields.DateCreated, ...fields],
            },
            { signal },
          );

          return (searchApi.data.Items as BaseItemDto[]) || [];
        }

        if (searchEngine === "Streamystats") {
          if (!settings?.streamyStatsServerUrl || !api.accessToken) {
            return [];
          }

          const streamyStatsApi = createStreamystatsApi({
            serverUrl: settings.streamyStatsServerUrl,
            jellyfinToken: api.accessToken,
          });

          const typeMap: Record<BaseItemKind, string> = {
            Movie: "movies",
            Series: "series",
            Episode: "episodes",
            Person: "actors",
            BoxSet: "movies",
            Audio: "audio",
          } as Record<BaseItemKind, string>;

          const searchType = types.length === 1 ? typeMap[types[0]] : "media";
          const response = await streamyStatsApi.searchIds(
            query,
            searchType as "movies" | "series" | "episodes" | "actors" | "media",
            SEARCH_RESULT_LIMIT,
            signal,
          );

          // searchIds answers with every list, empty when the server's body has
          // none: covered by utils/streamystats/api.test.ts.
          const allIds: string[] = [
            ...response.data.movies,
            ...response.data.series,
            ...response.data.episodes,
            ...response.data.actors,
            ...response.data.audio,
          ];

          if (!allIds.length) {
            return [];
          }

          const itemsResponse = await getLibraryApi(api).getItems(
            {
              ids: allIds,
              enableImageTypes: ["Primary", "Backdrop", "Thumb"],
              fields: [ItemFields.DateCreated, ...fields],
            },
            { signal },
          );

          return (itemsResponse.data.Items as BaseItemDto[]) || [];
        }

        // Marlin search
        if (!settings?.marlinServerUrl) {
          return [];
        }

        const url = `${settings.marlinServerUrl}/search?q=${encodeURIComponent(query)}&includeItemTypes=${types
          .map((type) => encodeURIComponent(type))
          .join("&includeItemTypes=")}`;

        const response1 = await axios.get(url, {
          signal,
          headers: getIntegrationHeaders("marlin"),
        });

        const ids = response1.data.ids;

        if (!ids?.length) {
          return [];
        }

        const response2 = await getLibraryApi(api).getItems(
          {
            ids,
            enableImageTypes: ["Primary", "Backdrop", "Thumb"],
            fields: [ItemFields.DateCreated, ...fields],
          },
          { signal },
        );

        return (response2.data.Items as BaseItemDto[]) || [];
      } catch (error) {
        // Aborted requests are routine; anything else used to render as
        // "no results" with no trace of the failure.
        if (!isAbortLikeError(error)) {
          logAndCaptureError("Search request failed", error);
        }
        return [];
      }
    },
    [api, searchEngine, settings, user?.Id],
  );

  // Separate search function for music types - always uses Jellyfin since Streamystats doesn't support music
  const jellyfinSearchFn = useCallback(
    async ({
      types,
      query,
      signal,
    }: {
      types: BaseItemKind[];
      query: string;
      signal?: AbortSignal;
    }): Promise<BaseItemDto[]> => {
      if (!api || !query) {
        return [];
      }

      try {
        const searchApi = await getLibraryApi(api).getItems(
          {
            searchTerm: query,
            limit: SEARCH_RESULT_LIMIT,
            includeItemTypes: types,
            recursive: true,
            userId: user?.Id,
            fields: [ItemFields.DateCreated],
          },
          { signal },
        );

        return (searchApi.data.Items as BaseItemDto[]) || [];
      } catch (error) {
        if (!isAbortLikeError(error)) {
          logAndCaptureError("Music search request failed", error);
        }
        return [];
      }
    },
    [api, user?.Id],
  );

  type HeaderSearchBarRef = {
    focus: () => void;
    blur: () => void;
    setText: (text: string) => void;
    clearText: () => void;
    cancelSearch: () => void;
  };

  const searchBarRef = useRef<HeaderSearchBarRef>(null);
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({
      headerSearchBarOptions: {
        ref: searchBarRef,
        placeholder: t("search.search"),
        onChangeText: (e: any) => {
          router.setParams({ q: "" });
          setSearch(e.nativeEvent.text);
        },
        hideWhenScrolling: false,
        autoFocus: false,
        // Android: color of the user-typed text (was dark and unreadable on the dark header)
        textColor: "#fff",
        // Android: placeholder and icon color
        hintTextColor: "#fff",
        headerIconColor: "#fff",
      },
    });
  }, [navigation]);

  useEffect(() => {
    const unsubscribe = eventBus.on("searchTabPressed", () => {
      // Screen not active
      if (!searchBarRef.current) {
        return;
      }
      // Screen is active, focus search bar
      searchBarRef.current?.focus();
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // The TMDB numbers keep a film or a series found here out of the titles
  // Seerr lists as not in the library (notInLibrary). Jellyfin's item search
  // leaves ProviderIds out unless asked for them.
  const { data: moviesFound, isFetching: l1 } = useQuery({
    queryKey: ["search", "movies", debouncedSearch],
    queryFn: ({ signal }) =>
      searchFn({
        query: debouncedSearch,
        types: ["Movie"],
        fields: [ItemFields.ProviderIds],
        signal,
      }),
    enabled: debouncedSearch.length > 0,
  });

  const { data: seriesFound, isFetching: l2 } = useQuery({
    queryKey: ["search", "series", debouncedSearch],
    queryFn: ({ signal }) =>
      searchFn({
        query: debouncedSearch,
        types: ["Series"],
        fields: [ItemFields.ProviderIds],
        signal,
      }),
    enabled: debouncedSearch.length > 0,
  });

  const { data: episodesFound, isFetching: l3 } = useQuery({
    queryKey: ["search", "episodes", debouncedSearch],
    queryFn: ({ signal }) =>
      searchFn({
        query: debouncedSearch,
        types: ["Episode"],
        signal,
      }),
    enabled: debouncedSearch.length > 0,
  });

  const { data: collectionsFound, isFetching: l7 } = useQuery({
    queryKey: ["search", "collections", debouncedSearch],
    queryFn: ({ signal }) =>
      searchFn({
        query: debouncedSearch,
        types: ["BoxSet"],
        signal,
      }),
    enabled: debouncedSearch.length > 0,
  });

  // Jellyfin's own search asks the Persons API, which can leave the musicians
  // out. Marlin and Streamystats rank people themselves, so they keep theirs.
  const { data: actorsFound, isFetching: l8 } = useQuery({
    // The version picks between the two ways of leaving the musicians out,
    // which do not answer alike, so an answer is only good for the version
    // it was asked under.
    queryKey: [
      "search",
      "actors",
      searchEngine,
      debouncedSearch,
      serverVersion,
    ],
    queryFn: ({ signal }) =>
      searchEngine === "Jellyfin"
        ? searchPeople({
            api,
            userId: user?.Id,
            query: debouncedSearch,
            serverVersion,
            signal,
          })
        : searchFn({
            query: debouncedSearch,
            types: ["Person"],
            signal,
          }),
    enabled: debouncedSearch.length > 0,
  });

  // Always Jellyfin: neither Marlin nor Streamystats indexes studios.
  const { data: studiosFound, isFetching: l13 } = useQuery({
    queryKey: ["search", "studios", debouncedSearch],
    queryFn: ({ signal }) =>
      searchStudios({
        api,
        userId: user?.Id,
        query: debouncedSearch,
        signal,
      }),
    enabled: debouncedSearch.length > 0,
  });

  // Music search queries - always use Jellyfin since Streamystats doesn't support music
  const { data: artistsFound, isFetching: l9 } = useQuery({
    queryKey: ["search", "artists", debouncedSearch],
    queryFn: ({ signal }) =>
      jellyfinSearchFn({
        query: debouncedSearch,
        types: ["MusicArtist"],
        signal,
      }),
    enabled: debouncedSearch.length > 0,
  });

  const { data: albumsFound, isFetching: l10 } = useQuery({
    queryKey: ["search", "albums", debouncedSearch],
    queryFn: ({ signal }) =>
      jellyfinSearchFn({
        query: debouncedSearch,
        types: ["MusicAlbum"],
        signal,
      }),
    enabled: debouncedSearch.length > 0,
  });

  const { data: songsFound, isFetching: l11 } = useQuery({
    queryKey: ["search", "songs", debouncedSearch],
    queryFn: ({ signal }) =>
      jellyfinSearchFn({
        query: debouncedSearch,
        types: ["Audio"],
        signal,
      }),
    enabled: debouncedSearch.length > 0,
  });

  const { data: playlistsFound, isFetching: l12 } = useQuery({
    queryKey: ["search", "playlists", debouncedSearch],
    queryFn: ({ signal }) =>
      jellyfinSearchFn({
        query: debouncedSearch,
        types: ["Playlist"],
        signal,
      }),
    enabled: debouncedSearch.length > 0,
  });

  // The Library results in the order picked, for the phone and the TV alike.
  const {
    movies,
    series,
    episodes,
    collections,
    actors,
    studios,
    artists,
    albums,
    songs,
    playlists,
  } = useMemo(() => {
    const sorted = (items?: BaseItemDto[]) =>
      sortLibraryResults(items, librarySort, librarySortOrder);
    return {
      movies: sorted(moviesFound),
      series: sorted(seriesFound),
      episodes: sorted(episodesFound),
      collections: sorted(collectionsFound),
      actors: sorted(actorsFound),
      studios: sorted(studiosFound),
      artists: sorted(artistsFound),
      albums: sorted(albumsFound),
      songs: sorted(songsFound),
      playlists: sorted(playlistsFound),
    };
  }, [
    moviesFound,
    seriesFound,
    episodesFound,
    collectionsFound,
    actorsFound,
    studiosFound,
    artistsFound,
    albumsFound,
    songsFound,
    playlistsFound,
    librarySort,
    librarySortOrder,
  ]);

  const noResults = useMemo(() => {
    return !(
      movies?.length ||
      episodes?.length ||
      series?.length ||
      collections?.length ||
      actors?.length ||
      studios?.length ||
      artists?.length ||
      albums?.length ||
      songs?.length ||
      playlists?.length
    );
  }, [
    episodes,
    movies,
    series,
    collections,
    actors,
    studios,
    artists,
    albums,
    songs,
    playlists,
  ]);

  const loading = useMemo(() => {
    return l1 || l2 || l3 || l7 || l8 || l9 || l10 || l11 || l12 || l13;
  }, [l1, l2, l3, l7, l8, l9, l10, l11, l12, l13]);

  // What Seerr could add, under the library's results. Its first page only:
  // this runs for every text typed.
  const foundTitles = useMemo(
    () => [...(moviesFound ?? []), ...(seriesFound ?? [])],
    [moviesFound, seriesFound],
  );
  const seerrNotInLibrary = useSeerrLibrarySearch({
    seerrApi,
    query: debouncedSearch,
    found: foundTitles,
  });

  // TV item press handler
  const handleItemPress = useCallback(
    (item: BaseItemDto) => {
      const navigation = getItemNavigation(item, from);
      router.push(navigation as any);
    },
    [from, router],
  );

  // Seerr's Discover rows, what the TV page shows until something is typed.
  const { data: discoverSliders } = useQuery({
    queryKey: ["search", "seerr", "discoverSettings", "tv"],
    queryFn: () => loadDiscoverSliders(seerrApi),
    enabled: Platform.isTV && !!seerrApi && debouncedSearch.length === 0,
  });

  // TV Seerr press handlers
  const handleSeerrMoviePress = useCallback(
    (item: MovieResult) => {
      router.push({
        pathname: "/(auth)/(tabs)/(search)/seerr/page",
        params: {
          mediaTitle: item.title,
          releaseYear: String(new Date(item.releaseDate || "").getFullYear()),
          canRequest: "true",
          posterSrc:
            seerrApi?.imageProxy(item.posterPath, "w600_and_h900_bestv2") || "",
          mediaType: MediaType.MOVIE,
          id: String(item.id),
          backdropPath: item.backdropPath || "",
          overview: item.overview || "",
        },
      });
    },
    [router, seerrApi],
  );

  const handleSeerrTvPress = useCallback(
    (item: TvResult) => {
      router.push({
        pathname: "/(auth)/(tabs)/(search)/seerr/page",
        params: {
          mediaTitle: item.name,
          releaseYear: String(new Date(item.firstAirDate || "").getFullYear()),
          canRequest: "true",
          posterSrc:
            seerrApi?.imageProxy(item.posterPath, "w600_and_h900_bestv2") || "",
          mediaType: MediaType.TV,
          id: String(item.id),
          backdropPath: item.backdropPath || "",
          overview: item.overview || "",
        },
      });
    },
    [router, seerrApi],
  );

  const handleSeerrResultPress = useCallback(
    (item: MovieResult | TvResult) => {
      if (item.mediaType === MediaType.MOVIE) handleSeerrMoviePress(item);
      else handleSeerrTvPress(item);
    },
    [handleSeerrMoviePress, handleSeerrTvPress],
  );

  // The sort of the results. Relevance has no order to pick.
  const librarySorts = useMemo(
    () =>
      LIBRARY_SORTS.map((value) => ({
        value: value as string,
        label: t(`search.library_sort.${value}`),
      })),
    [t],
  );
  const sortMenu = {
    sorts: librarySorts,
    sort: librarySort as string,
    onSort: (value: string) => setLibrarySort(value as LibrarySort),
    order: librarySort === "Relevance" ? undefined : librarySortOrder,
    onOrder: setLibrarySortOrder,
  };

  // On TV, as on the TV library page: a sheet for the sort, one for the order.
  const tvSortButtons = showSearchSort(debouncedSearch)
    ? {
        sortValue:
          sortMenu.sorts.find((s) => s.value === sortMenu.sort)?.label ?? "",
        onSortPress: () =>
          showOptions({
            title: t("library.filters.sort_by"),
            options: sortMenu.sorts.map((s) => ({
              label: s.label,
              value: s.value,
              selected: s.value === sortMenu.sort,
            })),
            onSelect: sortMenu.onSort,
          }),
        orderValue: sortMenu.order
          ? t(`library.filters.${sortMenu.order}`)
          : undefined,
        onOrderPress: () =>
          showOptions({
            title: t("library.filters.sort_order"),
            options: (["asc", "desc"] as const).map((order) => ({
              label: t(`library.filters.${order}`),
              value: order,
              selected: order === sortMenu.order,
            })),
            onSelect: sortMenu.onOrder,
          }),
      }
    : undefined;

  // One search, no tabs: Discover's rows to browse until something is typed
  // (example searches without Seerr), then what the search found.
  const view = searchView(debouncedSearch, !!seerrApi);

  // Render TV search page
  if (Platform.isTV) {
    return (
      <TVSearchPage
        search={search}
        setSearch={setSearch}
        debouncedSearch={debouncedSearch}
        movies={movies}
        series={series}
        episodes={episodes}
        collections={collections}
        actors={actors}
        studios={studios}
        artists={artists}
        albums={albums}
        songs={songs}
        playlists={playlists}
        loading={loading}
        noResults={noResults}
        onItemPress={handleItemPress}
        onItemLongPress={showItemActions}
        sortButtons={tvSortButtons}
        seerrNotInLibrary={seerrNotInLibrary}
        onSeerrResultPress={handleSeerrResultPress}
        discoverSliders={discoverSliders}
      />
    );
  }

  return (
    <ScrollView
      keyboardDismissMode='on-drag'
      contentInsetAdjustmentBehavior='automatic'
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: 60,
      }}
    >
      <View
        className='flex flex-col'
        style={{ paddingTop: Platform.OS === "android" ? 10 : 0 }}
      >
        {/* Covered by components/search/searchFilters.test.ts. */}
        {showSearchSort(debouncedSearch) && (
          <View className='pl-4 pr-4 flex flex-row'>
            <SearchSortMenu
              sorts={sortMenu.sorts}
              sort={sortMenu.sort}
              onSort={sortMenu.onSort}
              order={sortMenu.order}
              onOrder={sortMenu.onOrder}
              t={t}
            />
          </View>
        )}

        <View className='mt-2'>
          <LoadingSkeleton isLoading={loading} />
        </View>

        {view === "discover" ? (
          <SeerrIndexPage />
        ) : (
          <View className={l1 || l2 ? "opacity-0" : "opacity-100"}>
            <CardRow
              enableActionSheet
              title={t("search.movies")}
              items={movies ?? []}
              kind='portrait'
              hideIfEmpty
            />
            <CardRow
              enableActionSheet
              title={t("search.series")}
              items={series ?? []}
              kind='portrait'
              hideIfEmpty
            />
            <CardRow
              enableActionSheet
              title={t("search.episodes")}
              items={episodes ?? []}
              kind='wide'
              hideIfEmpty
            />
            <CardRow
              enableActionSheet
              title={t("search.collections")}
              items={collections ?? []}
              kind='portrait'
              hideIfEmpty
            />
            <CardRow
              enableActionSheet
              title={t("search.actors")}
              items={actors ?? []}
              kind='portrait'
              hideIfEmpty
            />
            <CardRow
              title={t("search.studios")}
              items={studios ?? []}
              kind='wide'
              hideIfEmpty
            />
            {/* Music search results */}
            <SearchItemWrapper
              items={artists}
              header={t("search.artists")}
              renderItem={(item: BaseItemDto) => {
                const imageUrl = getPrimaryImageUrl({ api, item });
                return (
                  <TouchableItemRouter
                    item={item}
                    key={item.Id}
                    className='flex flex-col w-24 mr-2 items-center'
                  >
                    <View
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: 40,
                        overflow: "hidden",
                        backgroundColor: "#1a1a1a",
                      }}
                    >
                      {imageUrl ? (
                        <Image
                          source={{ uri: imageUrl }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit='cover'
                        />
                      ) : (
                        <View className='flex-1 items-center justify-center bg-neutral-800'>
                          <Text className='text-xl'>👤</Text>
                        </View>
                      )}
                    </View>
                    <Text numberOfLines={2} className='mt-2 text-center'>
                      {item.Name}
                    </Text>
                  </TouchableItemRouter>
                );
              }}
            />
            <SearchItemWrapper
              items={albums}
              header={t("search.albums")}
              renderItem={(item: BaseItemDto) => {
                const imageUrl = getPrimaryImageUrl({ api, item });
                return (
                  <TouchableItemRouter
                    item={item}
                    key={item.Id}
                    className='flex flex-col w-28 mr-2'
                  >
                    <View
                      style={{
                        width: 112,
                        height: 112,
                        borderRadius: 8,
                        overflow: "hidden",
                        backgroundColor: "#1a1a1a",
                      }}
                    >
                      {imageUrl ? (
                        <Image
                          source={{ uri: imageUrl }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit='cover'
                        />
                      ) : (
                        <View className='flex-1 items-center justify-center bg-neutral-800'>
                          <Text className='text-4xl'>🎵</Text>
                        </View>
                      )}
                    </View>
                    <Text numberOfLines={2} className='mt-2'>
                      {item.Name}
                    </Text>
                    <Text className='opacity-50 text-xs' numberOfLines={1}>
                      {item.AlbumArtist || item.Artists?.join(", ")}
                    </Text>
                  </TouchableItemRouter>
                );
              }}
            />
            <SearchItemWrapper
              items={songs}
              header={t("search.songs")}
              renderItem={(item: BaseItemDto) => {
                const imageUrl = getPrimaryImageUrl({ api, item });
                return (
                  <TouchableItemRouter
                    item={item}
                    key={item.Id}
                    className='flex flex-col w-28 mr-2'
                  >
                    <View
                      style={{
                        width: 112,
                        height: 112,
                        borderRadius: 8,
                        overflow: "hidden",
                        backgroundColor: "#1a1a1a",
                      }}
                    >
                      {imageUrl ? (
                        <Image
                          source={{ uri: imageUrl }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit='cover'
                        />
                      ) : (
                        <View className='flex-1 items-center justify-center bg-neutral-800'>
                          <Text className='text-4xl'>🎵</Text>
                        </View>
                      )}
                    </View>
                    <Text numberOfLines={2} className='mt-2'>
                      {item.Name}
                    </Text>
                    <Text className='opacity-50 text-xs' numberOfLines={1}>
                      {item.Artists?.join(", ") || item.AlbumArtist}
                    </Text>
                  </TouchableItemRouter>
                );
              }}
            />
            <SearchItemWrapper
              items={playlists}
              header={t("search.playlists")}
              renderItem={(item: BaseItemDto) => {
                const imageUrl = getPrimaryImageUrl({ api, item });
                return (
                  <TouchableItemRouter
                    item={item}
                    key={item.Id}
                    className='flex flex-col w-28 mr-2'
                  >
                    <View
                      style={{
                        width: 112,
                        height: 112,
                        borderRadius: 8,
                        overflow: "hidden",
                        backgroundColor: "#1a1a1a",
                      }}
                    >
                      {imageUrl ? (
                        <Image
                          source={{ uri: imageUrl }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit='cover'
                        />
                      ) : (
                        <View className='flex-1 items-center justify-center bg-neutral-800'>
                          <Text className='text-4xl'>🎶</Text>
                        </View>
                      )}
                    </View>
                    <Text numberOfLines={2} className='mt-2'>
                      {item.Name}
                    </Text>
                    <Text className='opacity-50 text-xs'>
                      {item.ChildCount} tracks
                    </Text>
                  </TouchableItemRouter>
                );
              }}
            />
          </View>
        )}

        {view === "results" && !loading && noResults ? (
          <View>
            <Text className='text-center text-lg font-bold mt-4'>
              {t("search.no_results_found_for")}
            </Text>
            <Text className='text-xs text-purple-600 text-center'>
              "{debouncedSearch}"
            </Text>
          </View>
        ) : view === "examples" ? (
          <View className='mt-2 flex flex-col items-center space-y-2'>
            {exampleSearches.map((e) => (
              <TouchableOpacity
                onPress={() => {
                  setSearch(e);
                  searchBarRef.current?.setText(e);
                }}
                key={e}
                className='mb-2'
              >
                <Text className='text-purple-600'>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {/* After the library's results, and after the line saying it has
            none: what the user could request instead. */}
        {view === "results" && !loading && seerrNotInLibrary.length > 0 && (
          <View className='mt-4'>
            <SearchItemWrapper
              header={t("seerr.library_search.not_in_your_library")}
              items={seerrNotInLibrary}
              renderItem={(item: MovieResult | TvResult) => (
                <SeerrPoster item={item} key={`${item.mediaType}-${item.id}`} />
              )}
            />
          </View>
        )}
      </View>
    </ScrollView>
  );
}
