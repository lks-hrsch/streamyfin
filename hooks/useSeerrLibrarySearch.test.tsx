import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { stubReactNative } from "@/test-utils/reactNative";
import type { SeerrSearchApi } from "@/utils/seerr/librarySearch";
import { MediaStatus, MediaType, type MovieResult } from "@/utils/seerr/types";
import { useSeerrLibrarySearch } from "./useSeerrLibrarySearch";

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  const { makeApi: make } = jest.requireActual("@/test-utils/jellyfinApi");
  const mockApi = make();
  return {
    apiAtom: atom(mockApi),
    userAtom: atom({ Id: "user-1" }),
    mockApi,
  };
});

const jellyfin: ReturnType<typeof makeApi> = jest.requireMock(
  "@/providers/JellyfinProvider",
).mockApi;

const film = (
  id: number,
  title: string,
  status?: MediaStatus,
): MovieResult => ({
  id,
  mediaType: MediaType.MOVIE,
  title,
  mediaInfo: status
    ? { id: id * 10, tmdbId: id, mediaType: MediaType.MOVIE, status }
    : undefined,
});

const matrix = film(603, "The Matrix", MediaStatus.PROCESSING);
const resurrections = film(624860, "The Matrix Resurrections");

const fakeSeerr = (): SeerrSearchApi & { search: jest.Mock } => ({
  axios: { defaults: { baseURL: "https://seerr.example.com" } },
  search: jest.fn(async () => ({
    page: 1,
    totalPages: 1,
    totalResults: 2,
    results: [matrix, resurrections],
  })),
});

type Props = Parameters<typeof useSeerrLibrarySearch>[0];

const renderSearch = (props: Partial<Props>) => {
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const store = createStore();
  return renderHook(
    () =>
      useSeerrLibrarySearch({
        seerrApi: undefined,
        query: "matrix",
        enabled: true,
        found: [],
        ...props,
      }),
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      ),
    },
  );
};

/** Lets every request the hook would start go out. */
const settle = () => act(async () => {});

beforeEach(() => {
  jellyfin.mock.reset();
});

// The search screen calls the hook before it chooses between the phone and
// the TV page, so both ask, and leave alone, the same.
describe.each([
  ["phone", false],
  ["TV", true],
])("the library search's Seerr row on the %s", (_, isTV) => {
  beforeEach(() => {
    stubReactNative({ isTV });
  });

  test("asks nothing while the text is empty", async () => {
    const seerr = fakeSeerr();

    const { result } = await renderSearch({ seerrApi: seerr, query: "" });
    await settle();

    expect(seerr.search).not.toHaveBeenCalled();
    expect(jellyfin.mock.history.get).toHaveLength(0);
    expect(result.current).toEqual([]);
  });

  test("asks nothing without a Seerr", async () => {
    const { result } = await renderSearch({ seerrApi: undefined });
    await settle();

    expect(jellyfin.mock.history.get).toHaveLength(0);
    expect(result.current).toEqual([]);
  });

  // Discover lists Seerr's results itself, in rows of its own.
  test("asks nothing in Discover", async () => {
    const seerr = fakeSeerr();

    const { result } = await renderSearch({ seerrApi: seerr, enabled: false });
    await settle();

    expect(seerr.search).not.toHaveBeenCalled();
    expect(jellyfin.mock.history.get).toHaveLength(0);
    expect(result.current).toEqual([]);
  });

  // The rows stop at ten a type: a film the library has but ranks lower, and
  // Seerr has not yet seen arrive, must still stay out of the row.
  test("asks Seerr for one page and leaves out what the library has", async () => {
    jellyfin.mock.onGet(/\/Items/).reply(200, {
      Items: [{ Id: "1", Type: "Movie", ProviderIds: { Tmdb: "603" } }],
    });
    const seerr = fakeSeerr();

    const { result } = await renderSearch({ seerrApi: seerr });

    await waitFor(() =>
      expect(result.current.map((title) => title.id)).toEqual([624860]),
    );
    expect(seerr.search).toHaveBeenCalledTimes(1);
    expect(seerr.search).toHaveBeenCalledWith({ query: "matrix", page: 1 });
  });

  test("lists nothing before the library has answered", async () => {
    jellyfin.mock.onGet(/\/Items/).reply(() => new Promise(() => {}));
    const seerr = fakeSeerr();

    const { result } = await renderSearch({ seerrApi: seerr });
    await waitFor(() => expect(seerr.search).toHaveBeenCalled());
    await settle();

    expect(result.current).toEqual([]);
  });

  test("keeps to what the rows found when the library cannot answer", async () => {
    jellyfin.mock.onGet(/\/Items/).reply(500);
    const seerr = fakeSeerr();
    const found: BaseItemDto[] = [
      { Id: "1", Type: "Movie", ProviderIds: { Tmdb: "603" } },
    ];

    const { result } = await renderSearch({ seerrApi: seerr, found });

    await waitFor(() =>
      expect(result.current.map((title) => title.id)).toEqual([624860]),
    );
  });
});
