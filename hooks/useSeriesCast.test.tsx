import type {
  BaseItemDto,
  UserDto,
} from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { OfflineModeProvider } from "@/providers/OfflineModeProvider";
import { makeApi } from "@/test-utils/jellyfinApi";
import { useSeriesCast } from "./useSeriesCast";

let mockApi: ReturnType<typeof makeApi> | null = null;
let mockUser: UserDto | null = null;

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom(() => mockApi),
    userAtom: atom(() => mockUser),
  };
});

const SERVER = "https://jellyfin.example.com";
const SERVER_INFO_URL = `${SERVER}/System/Info/Public`;
// The SDK writes the query into the URL.
const PERSONS_URL = /\/Persons(\?|$)/;

const SERIES: BaseItemDto = {
  Id: "series-1",
  Type: "Series",
  People: [
    { Id: "bates", Name: "Kathy Bates", Type: "Actor", Role: "Delphine" },
    { Id: "murphy", Name: "Ryan Murphy", Type: "Creator" },
  ],
};

const EPISODE_ACTORS: BaseItemDto[] = [
  { Id: "peters", Name: "Evan Peters", Type: "Person" },
  { Id: "bates", Name: "Kathy Bates", Type: "Person" },
];

const serverRunning = (version: string) => {
  const api = makeApi();
  api.mock.onGet(SERVER_INFO_URL).reply(200, { Version: version });
  api.mock
    .onGet(PERSONS_URL)
    .reply(200, { Items: EPISODE_ACTORS, TotalRecordCount: 2 });
  mockApi = api;
  return api;
};

const personRequests = (api: ReturnType<typeof makeApi>) =>
  api.mock.history.get.filter((request) => PERSONS_URL.test(request.url ?? ""));

const renderSeriesCast = async ({
  series = SERIES,
  isOffline = false,
  client = new QueryClient({
    // No garbage collection timer nor retry: either keeps Jest from exiting.
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  }),
}: {
  series?: BaseItemDto | null;
  isOffline?: boolean;
  client?: QueryClient;
} = {}) => {
  // A store per render: the api and user atoms are read once per store.
  const store = createStore();
  const rendered = await renderHook(
    ({ item }: { item: BaseItemDto | null }) => useSeriesCast(item),
    {
      initialProps: { item: series },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
          <JotaiProvider store={store}>
            <OfflineModeProvider isOffline={isOffline}>
              {children}
            </OfflineModeProvider>
          </JotaiProvider>
        </QueryClientProvider>
      ),
    },
  );
  return { ...rendered, client };
};

/** Lets the server version land, and anything it would set off after it. */
const untilServerVersionIsKnown = async (client: QueryClient) => {
  await waitFor(() =>
    expect(client.getQueryState(["jellyfin", "serverInfo"])?.status).toBe(
      "success",
    ),
  );
  // React Query hands its state updates to a timer.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const ids = (cast: { Id?: string | null }[]) => cast.map((person) => person.Id);

describe("useSeriesCast", () => {
  beforeEach(() => {
    mockApi = null;
    mockUser = { Id: "user-1" };
  });

  test("adds the actors of the episodes a Jellyfin 12 server lists", async () => {
    const api = serverRunning("12.2.0");

    const { result } = await renderSeriesCast();

    await waitFor(() =>
      expect(ids(result.current)).toEqual(["bates", "peters"]),
    );
    const [request] = personRequests(api);
    const query = new URL(request.url ?? "").searchParams;
    expect(Object.fromEntries(query)).toEqual({
      parentId: "series-1",
      personTypes: "Actor",
      userId: "user-1",
      enableUserData: "false",
      enableImageTypes: "Primary",
      imageTypeLimit: "1",
    });
  });

  // 10.11 has no parentId on /Persons: it would answer every person of the
  // server as the cast of this one series.
  test("never asks a 10.11 server, and keeps to the series' own actors", async () => {
    const api = serverRunning("10.11.11");

    const { result, client } = await renderSeriesCast();
    await untilServerVersionIsKnown(client);

    expect(personRequests(api)).toHaveLength(0);
    expect(ids(result.current)).toEqual(["bates"]);
  });

  test("shows the series' own actors before the server version is known", async () => {
    const api = makeApi();
    // The version request never answers.
    api.mock.onGet(SERVER_INFO_URL).reply(() => new Promise(() => {}));
    mockApi = api;

    const { result } = await renderSeriesCast();

    expect(ids(result.current)).toEqual(["bates"]);
    expect(personRequests(api)).toHaveLength(0);
  });

  test("asks nothing offline and lists no one, even with a cast cached online", async () => {
    const api = serverRunning("12.2.0");
    const client = new QueryClient({
      defaultOptions: {
        queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      },
    });
    client.setQueryData(["seriesCast", "series-1", "user-1"], EPISODE_ACTORS);

    const { result } = await renderSeriesCast({ isOffline: true, client });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(api.mock.history.get).toHaveLength(0);
    expect(result.current).toEqual([]);
  });

  test("asks nothing without a signed in user, or a series", async () => {
    const api = serverRunning("12.2.0");
    mockUser = null;

    const { client } = await renderSeriesCast();
    await untilServerVersionIsKnown(client);
    expect(personRequests(api)).toHaveLength(0);

    mockUser = { Id: "user-1" };
    const { result, client: second } = await renderSeriesCast({
      series: null,
    });
    await untilServerVersionIsKnown(second);
    expect(personRequests(api)).toHaveLength(0);
    expect(result.current).toEqual([]);
  });

  test("asks nothing without a server", async () => {
    const { result } = await renderSeriesCast();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(ids(result.current)).toEqual(["bates"]);
  });

  // The row re-renders when the cast changes, not with every render of the
  // page around it.
  test("hands back the same cast while nothing changed", async () => {
    serverRunning("12.2.0");
    const { result, rerender } = await renderSeriesCast();
    await waitFor(() => expect(result.current).toHaveLength(2));
    const first = result.current;

    await rerender({ item: SERIES });

    expect(result.current).toBe(first);
  });
});
