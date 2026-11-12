// Spec for the phone series page,
// app/(auth)/(tabs)/(home,libraries,search,more,tv-favorites,tv-watchlists)/series/[id].tsx.
// It lives here rather than next to the page because Expo Router turns every
// file under app/ into a route. Only the cast row is under test: the rest of
// the page is stubbed.
import type {
  BaseItemDto,
  BaseItemPerson,
  UserDto,
} from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { makeApi } from "@/test-utils/jellyfinApi";

let mockApi: ReturnType<typeof makeApi> | null = null;
let mockUser: UserDto | null = null;
const mockPush = jest.fn();

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "series-1" }),
  useNavigation: () => ({ setOptions: () => {} }),
  useSegments: () => ["(auth)", "(tabs)", "(home)", "series", "[id]"],
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: mockPush }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom(() => mockApi),
    userAtom: atom(() => mockUser),
  };
});
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({ getDownloadedItems: () => [], downloadedItems: [] }),
}));
jest.mock("@/hooks/useShuffleQueue", () => ({
  useShuffleQueue: () => ({ startShuffle: () => {} }),
  playableQueueItems: () => [],
}));
jest.mock("@/hooks/useLeaveWhenGone", () => ({ useLeaveWhenGone: () => {} }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// The page around the cast row: each of these asks the server for its own
// part, or reaches native code.
jest.mock("@/components/ParallaxPage", () => ({
  ParallaxScrollView: ({ children }: { children: ReactNode }) => children,
}));
// The header names the series, which tells the page has its item.
jest.mock("@/components/series/SeriesHeader", () => ({
  SeriesHeader: ({ item }: { item: { Name: string } }) => {
    const { Text } = jest.requireActual("react-native");
    return <Text>{item.Name}</Text>;
  },
}));
jest.mock("@/components/series/NextUp", () => ({ NextUp: () => null }));
jest.mock("@/components/series/SeasonPicker", () => ({
  SeasonPicker: () => null,
  seasonIndexAtom: jest.requireActual("jotai").atom({}),
}));
jest.mock("@/components/SimilarItems", () => ({ SimilarItems: () => null }));
jest.mock("@/components/series/TVSeriesPage", () => ({
  TVSeriesPage: () => null,
}));
jest.mock("@/components/AddToFavorites", () => ({
  AddToFavorites: () => null,
}));
jest.mock("@/components/DownloadItem", () => ({ DownloadItems: () => null }));
jest.mock("@/components/syncplay/SyncPlayButton", () => ({
  SyncPlayButton: () => null,
}));
jest.mock("@/components/common/HeaderButton", () => ({
  HeaderButton: () => null,
  HeaderButtonGroup: () => null,
}));
jest.mock("@/components/common/HeaderIcon", () => ({ HeaderIcon: () => null }));
jest.mock("@/components/common/ServerImage", () => ({ Image: () => null }));
// The row itself is not under test: a card shows up as its name and its
// role, and opens what the row would open.
jest.mock("@/components/cards/CardRow", () => ({
  CardRow: ({
    title,
    cards,
    onPressId,
  }: {
    title: string;
    cards: { id: string; title: string; subtitle?: string | null }[];
    onPressId: (id: string) => void;
  }) => {
    const { Pressable, Text, View } = jest.requireActual("react-native");
    return (
      <View testID='cast-row'>
        <Text>{title}</Text>
        {cards.map((card) => (
          <Pressable key={card.id} onPress={() => onPressId(card.id)}>
            <Text testID='cast-name'>{card.title}</Text>
            <Text testID={`role-${card.id}`}>{card.subtitle ?? ""}</Text>
          </Pressable>
        ))}
      </View>
    );
  },
}));

const SeriesPage =
  require("@/app/(auth)/(tabs)/(home,libraries,search,more,tv-favorites,tv-watchlists)/series/[id]").default;

const SERVER = "https://jellyfin.example.com";

/**
 * American Horror Story as Jellyfin 12 holds it with TMDB metadata: the series
 * credits its later seasons' cast, once per role, while season 1's lead is
 * credited on that season's episodes only.
 */
const SERIES_PEOPLE: BaseItemPerson[] = [
  { Id: "bates", Name: "Kathy Bates", Type: "Actor", Role: "Delphine" },
  { Id: "bates", Name: "Kathy Bates", Type: "Actor", Role: "Ethel" },
  { Id: "paulson", Name: "Sarah Paulson", Type: "Actor", Role: "Lana" },
  { Id: "murphy", Name: "Ryan Murphy", Type: "Creator" },
];

/** What `/Persons?parentId=series-1` answers: alphabetical, without roles. */
const EPISODE_ACTORS: BaseItemDto[] = [
  { Id: "peters", Name: "Evan Peters", Type: "Person", ImageTags: {} },
  { Id: "bates", Name: "Kathy Bates", Type: "Person", ImageTags: {} },
];

const SERIES: BaseItemDto = {
  Id: "series-1",
  Name: "American Horror Story",
  Type: "Series",
  BackdropImageTags: ["backdrop"],
  ImageTags: {},
  People: SERIES_PEOPLE,
};

const serverRunning = (version: string) => {
  const api = makeApi();
  api.mock.onGet(`${SERVER}/System/Info/Public`).reply(200, {
    Version: version,
  });
  // The SDK writes the query into the URL.
  api.mock.onGet(/\/Items\/series-1(\?|$)/).reply(200, SERIES);
  api.mock
    .onGet(/\/Shows\/series-1\/Episodes(\?|$)/)
    .reply(200, { Items: [], TotalRecordCount: 0 });
  api.mock.onGet(/\/Persons(\?|$)/).reply(200, {
    Items: EPISODE_ACTORS,
    TotalRecordCount: EPISODE_ACTORS.length,
  });
  mockApi = api;
  return api;
};

const renderPage = () => {
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <JotaiProvider store={createStore()}>
        <SeriesPage />
      </JotaiProvider>
    </QueryClientProvider>,
  );
};

const castNames = () =>
  screen.getAllByTestId("cast-name").map((name) => name.props.children);

describe("series page cast", () => {
  beforeEach(() => {
    mockApi = null;
    mockUser = { Id: "user-1" };
    mockPush.mockClear();
  });

  // The series page had no cast at all: season 1's lead of an anthology was
  // only to be found on one of its episodes.
  test("lists the actors credited on the episodes after the series' own", async () => {
    serverRunning("12.2.0");

    await renderPage();
    await screen.findByText("American Horror Story");

    expect(await screen.findByText("Evan Peters")).toBeTruthy();
    expect(castNames()).toEqual([
      "Kathy Bates",
      "Sarah Paulson",
      "Evan Peters",
    ]);
    // One card for Kathy Bates, with every role she plays.
    expect(screen.getByTestId("role-bates").props.children).toBe(
      "Delphine, Ethel",
    );
    // The creator is in the header's credit lines, not in the cast.
    expect(screen.queryByText("Ryan Murphy")).toBeNull();
  });

  test("an actor of the cast opens their page", async () => {
    serverRunning("12.2.0");

    await renderPage();
    fireEvent.press(await screen.findByText("Evan Peters"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/persons/[personId]",
      params: { personId: "peters" },
    });
  });
});
