import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { makeApi } from "@/test-utils/jellyfinApi";
import type { SeerrSearchApi } from "@/utils/seerr/search";
import { MediaStatus, MediaType, type MovieResult } from "@/utils/seerr/types";
import { useSeerrLibraryMatches } from "./useSeerrLibraryMatches";

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
  jellyfinMediaId?: string,
): MovieResult => ({
  id,
  mediaType: MediaType.MOVIE,
  title,
  mediaInfo: jellyfinMediaId
    ? {
        id: id * 10,
        tmdbId: id,
        mediaType: MediaType.MOVIE,
        status: MediaStatus.AVAILABLE,
        jellyfinMediaId,
      }
    : undefined,
});

// The reported search: the library holds The Hunger Games under its English
// name, and Seerr finds it, with the films the library does not have, for the
// German one.
const hungerGames = film(70160, "The Hunger Games", "hunger-games");
const sunrise = film(1300968, "The Hunger Games: Sunrise on the Reaping");
const hungerGamesItem: BaseItemDto = {
  Id: "hunger-games",
  Type: "Movie",
  Name: "The Hunger Games",
};

const fakeSeerr = (
  results: MovieResult[] = [sunrise, hungerGames],
): SeerrSearchApi & { search: jest.Mock } => ({
  axios: { defaults: { baseURL: "https://seerr.example.com" } },
  search: jest.fn(async () => ({
    page: 1,
    totalPages: 1,
    totalResults: results.length,
    results,
  })),
});

type Props = Parameters<typeof useSeerrLibraryMatches>[0];

const renderMatches = (props: Partial<Props>) => {
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  return renderHook(
    () =>
      useSeerrLibraryMatches({
        seerrApi: undefined,
        query: "Tribute von Panem",
        found: [],
        settled: true,
        ...props,
      }),
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>
          <JotaiProvider store={createStore()}>{children}</JotaiProvider>
        </QueryClientProvider>
      ),
    },
  );
};

/** Lets every request the hook would start go out. */
const settle = () => act(async () => {});

const itemRequests = () =>
  jellyfin.mock.history.get.map(
    (request) => new URL(request.url ?? "").pathname,
  );

beforeEach(() => {
  jellyfin.mock.reset();
});

describe("useSeerrLibraryMatches", () => {
  test("finds the library's film for its title in another language", async () => {
    jellyfin.mock.onGet(/\/Items\/hunger-games/).reply(200, hungerGamesItem);
    const seerr = fakeSeerr();

    const { result } = await renderMatches({ seerrApi: seerr });

    await waitFor(() =>
      expect(result.current.items).toEqual([hungerGamesItem]),
    );
    expect(result.current.pending).toBe(false);
    expect(seerr.search).toHaveBeenCalledWith({
      query: "Tribute von Panem",
      page: 1,
    });
    // One lookup, as the user: the film Seerr does not report in the library
    // is not asked for.
    expect(itemRequests()).toEqual(["/Items/hunger-games"]);
    expect(
      new URL(jellyfin.mock.history.get[0].url ?? "").searchParams.get(
        "userId",
      ),
    ).toBe("user-1");
  });

  // Asked earlier, every title the library's own search is about to list
  // would cost a request of its own.
  test("asks the library nothing before its own search has answered", async () => {
    const seerr = fakeSeerr();

    const { result } = await renderMatches({ seerrApi: seerr, settled: false });
    await waitFor(() => expect(seerr.search).toHaveBeenCalled());
    await settle();

    expect(itemRequests()).toEqual([]);
    expect(result.current.items).toEqual([]);
    expect(result.current.pending).toBe(true);
  });

  test("asks nothing for a title the library's own search found", async () => {
    const seerr = fakeSeerr();

    const { result } = await renderMatches({
      seerrApi: seerr,
      found: [hungerGamesItem],
    });
    await waitFor(() => expect(result.current.pending).toBe(false));

    expect(seerr.search).toHaveBeenCalled();
    expect(itemRequests()).toEqual([]);
    expect(result.current.items).toEqual([]);
  });

  // A shared Seerr knows every library, the ones this user may not open too.
  test("leaves out an item the user may not open", async () => {
    jellyfin.mock.onGet(/\/Items\/hunger-games/).reply(404);
    const seerr = fakeSeerr();

    const { result } = await renderMatches({ seerrApi: seerr });

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(itemRequests()).toEqual(["/Items/hunger-games"]);
    expect(result.current.items).toEqual([]);
  });

  test("is pending while Seerr and the library answer", async () => {
    jellyfin.mock
      .onGet(/\/Items\/hunger-games/)
      .reply(() => new Promise(() => {}));
    const seerr = fakeSeerr();

    const { result } = await renderMatches({ seerrApi: seerr });

    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(itemRequests()).toHaveLength(1));
    expect(result.current.pending).toBe(true);
  });

  test("asks nothing without a Seerr, nor for an empty text", async () => {
    const seerr = fakeSeerr();

    const without = await renderMatches({ seerrApi: undefined });
    const empty = await renderMatches({ seerrApi: seerr, query: "" });
    await settle();

    expect(seerr.search).not.toHaveBeenCalled();
    expect(itemRequests()).toEqual([]);
    expect(without.result.current).toEqual({ items: [], pending: false });
    expect(empty.result.current).toEqual({ items: [], pending: false });
  });
});
