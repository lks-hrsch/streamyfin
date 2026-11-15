import type {
  BaseItemDto,
  UserDto,
} from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { makeApi } from "@/test-utils/jellyfinApi";
import type { CombinedCredit } from "@/utils/seerr/types";
import { usePersonProfile } from "./usePersonProfile";

let mockApi: ReturnType<typeof makeApi> | null = null;
const mockUser: UserDto = { Id: "user-1" };
let mockCredits: CombinedCredit | undefined;

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom(() => mockApi),
    userAtom: atom(() => mockUser),
  };
});
jest.mock("@/hooks/useSeerrPerson", () => ({
  useSeerrPerson: () => ({ details: undefined, combinedCredits: mockCredits }),
}));

/** A library item, and the people Jellyfin lists on it. */
type Stored = BaseItemDto & { people?: string[] };

/**
 * A Jellyfin library answering `/Items` the way the server filters it: by the
 * people on an item, its type and its id, in the order the items are stored.
 */
const serveLibrary = (items: Stored[]) => {
  const api = makeApi();
  api.mock.onGet(/\/Items\?/).reply((config) => {
    const query = new URL(config.url ?? "").searchParams;
    const ids = query.getAll("ids");
    const people = query.getAll("personIds");
    const types = query.getAll("includeItemTypes");
    const limit = Number(query.get("limit") ?? Number.POSITIVE_INFINITY);
    const found = items
      .filter((item) => ids.length === 0 || ids.includes(item.Id ?? ""))
      .filter(
        (item) =>
          people.length === 0 ||
          people.some((person) => item.people?.includes(person)),
      )
      .filter((item) => types.length === 0 || types.includes(item.Type ?? ""))
      .slice(0, limit)
      .map(({ people: _people, ...item }) => item);
    return [200, { Items: found, TotalRecordCount: found.length }];
  });
  mockApi = api;
  return api;
};

/** The `/Items` requests sent, each as its query. */
const itemQueries = (api: ReturnType<typeof makeApi>) =>
  api.mock.history.get.map(
    (request) => new URL(request.url ?? "").searchParams,
  );

const EVAN = "person-evan";
const evan: BaseItemDto = {
  Id: EVAN,
  Type: "Person",
  Name: "Evan Peters",
  ProviderIds: { Tmdb: "51329" },
};

// American Horror Story as Jellyfin's TMDB provider files it: the season's
// lead is on the episodes, and not among the series' own people.
const ahs: Stored = {
  Id: "jf-ahs",
  Type: "Series",
  Name: "American Horror Story",
  PremiereDate: "2011-10-05T00:00:00.0000000Z",
  ProductionYear: 2011,
  ProviderIds: { Tmdb: "1413" },
  people: ["person-sarah"],
};
const pilot: Stored = {
  Id: "jf-ahs-s01e01",
  Type: "Episode",
  SeriesId: "jf-ahs",
  people: [EVAN],
};
const chapter1: Stored = {
  Id: "jf-ahs-s06e01",
  Type: "Episode",
  SeriesId: "jf-ahs",
  people: [EVAN],
};

const tvCredit = (id: number, name: string, character: string) => ({
  id,
  mediaType: "tv",
  name,
  character,
  voteCount: 100,
});

const renderProfile = async (person: BaseItemDto = evan) => {
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const store = createStore();
  const { result } = await renderHook(() => usePersonProfile(person), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    ),
  });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  return result;
};

/** A filmography row as ids: the library's item id, or Seerr's TMDB number. */
const rowOf = (
  entries: ReturnType<typeof usePersonProfile>["filmography"]["shows"],
) =>
  entries.map((entry) =>
    entry.source === "library"
      ? `library:${entry.item.Id}`
      : `seerr:${entry.credit.id}`,
  );

beforeEach(() => {
  mockApi = null;
  mockCredits = undefined;
});

describe("usePersonProfile", () => {
  // Reported from the app: Pilot > Cast & crew > Evan Peters listed American
  // Horror Story as a Seerr title to request, and opened its Seerr page, while
  // the library has the series and both of the episodes he was found through.
  test("lists a series the person is only in through its episodes as the library's", async () => {
    serveLibrary([ahs, pilot, chapter1]);
    mockCredits = {
      cast: [tvCredit(1413, "American Horror Story", "Tate Langdon")],
    } as CombinedCredit;

    const result = await renderProfile();

    expect(rowOf(result.current.filmography.shows)).toEqual(["library:jf-ahs"]);
    expect(result.current.filmography.shows[0].credit?.roles).toEqual([
      { character: "Tate Langdon" },
    ]);
  });

  test("lists a series once when the person is on it and on its episodes", async () => {
    const api = serveLibrary([{ ...ahs, people: [EVAN] }, pilot, chapter1]);

    const result = await renderProfile();

    expect(rowOf(result.current.filmography.shows)).toEqual(["library:jf-ahs"]);
    // Nothing left to fetch by id: the films and series, and the episodes.
    expect(itemQueries(api)).toHaveLength(2);
  });

  test("files the series found through episodes by premiere date, among the rest", async () => {
    serveLibrary([
      {
        Id: "jf-dahmer",
        Type: "Series",
        PremiereDate: "2022-09-21T00:00:00.0000000Z",
        ProviderIds: { Tmdb: "113988" },
        people: [EVAN],
      },
      {
        Id: "jf-xmen",
        Type: "Movie",
        PremiereDate: "2014-05-15T00:00:00.0000000Z",
        ProviderIds: { Tmdb: "127585" },
        people: [EVAN],
      },
      {
        Id: "jf-kickass",
        Type: "Movie",
        PremiereDate: "2010-03-22T00:00:00.0000000Z",
        ProviderIds: { Tmdb: "23483" },
        people: [EVAN],
      },
      {
        Id: "jf-invasion",
        Type: "Series",
        PremiereDate: "2005-09-21T00:00:00.0000000Z",
        ProviderIds: { Tmdb: "2602" },
        people: [EVAN],
      },
      ahs,
      pilot,
    ]);

    const result = await renderProfile();

    expect(rowOf(result.current.filmography.shows)).toEqual([
      "library:jf-dahmer",
      "library:jf-ahs",
      "library:jf-invasion",
    ]);
    expect(rowOf(result.current.filmography.movies)).toEqual([
      "library:jf-xmen",
      "library:jf-kickass",
    ]);
  });

  test("reads only the series of the person's episodes, a bounded number of them", async () => {
    const api = serveLibrary([ahs, pilot, chapter1]);

    await renderProfile();

    const episodes = itemQueries(api).find(
      (query) => query.get("includeItemTypes") === "Episode",
    );
    expect(episodes?.getAll("personIds")).toEqual([EVAN]);
    expect(episodes?.get("limit")).toBe("300");
    // Only SeriesId is read off an episode, and it comes without asking.
    expect(episodes?.get("enableImages")).toBe("false");
    expect(episodes?.get("enableUserData")).toBe("false");
    expect(episodes?.has("fields")).toBe(false);

    const series = itemQueries(api).find((query) => query.has("ids"));
    expect(series?.getAll("ids")).toEqual(["jf-ahs"]);
    expect(series?.getAll("fields")).toEqual([
      "ProviderIds",
      "PrimaryImageAspectRatio",
    ]);
  });
});
