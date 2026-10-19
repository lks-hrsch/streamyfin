import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, type QueryClientConfig } from "@tanstack/react-query";
import {
  SEERR_OWNED_TITLES_LIMIT,
  SEERR_SEARCH_REUSE_MS,
} from "@/constants/SeerrLibrarySearch";
import { makeApi } from "@/test-utils/jellyfinApi";
import {
  notInLibrary,
  searchOwnedTitles,
  seerrFirstPageQuery,
  seerrSearchQuery,
} from "./librarySearch";
import { touchedByRequest } from "./queries";
import {
  MediaStatus,
  MediaType,
  type MovieResult,
  type PersonResult,
  type Results,
  type TvResult,
} from "./types";

const movie = (
  id: number,
  title: string,
  status?: MediaStatus,
  status4k?: MediaStatus,
): MovieResult => ({
  id,
  mediaType: MediaType.MOVIE,
  title,
  mediaInfo: status
    ? {
        id: id * 10,
        tmdbId: id,
        mediaType: MediaType.MOVIE,
        status,
        status4k,
      }
    : undefined,
});

const series = (id: number, name: string, status?: MediaStatus): TvResult => ({
  id,
  mediaType: MediaType.TV,
  name,
  mediaInfo: status
    ? { id: id * 10, tmdbId: id, mediaType: MediaType.TV, status }
    : undefined,
});

const person: PersonResult = {
  id: 1,
  mediaType: "person",
  name: "Denis Villeneuve",
};

const ids = (results: (MovieResult | TvResult)[]) =>
  results.map((result) => `${result.mediaType}:${result.id}`);

describe("notInLibrary", () => {
  test("lists films and series, never a person", () => {
    const results: Results[] = [
      person,
      movie(438631, "Dune"),
      series(1, "Dune"),
    ];

    expect(ids(notInLibrary(results, { query: "dune" }))).toEqual([
      "movie:438631",
      "tv:1",
    ]);
  });

  test("leaves out what Seerr reports as in the library, in full or in part", () => {
    const results = [
      movie(1, "Dune", MediaStatus.AVAILABLE),
      series(2, "Dune: Prophecy", MediaStatus.PARTIALLY_AVAILABLE),
      movie(3, "Dune: Part Two"),
    ];

    expect(ids(notInLibrary(results, { query: "dune" }))).toEqual(["movie:3"]);
  });

  // Requested and processing titles are what the badge is there for, and a
  // title deleted from the library can be requested again.
  test("keeps what is requested, processing, unknown or deleted", () => {
    const results = [
      movie(1, "A", MediaStatus.PENDING),
      movie(2, "B", MediaStatus.PROCESSING),
      movie(3, "C", MediaStatus.UNKNOWN),
      movie(4, "D", MediaStatus.DELETED),
    ];

    expect(notInLibrary(results, { query: "x" })).toHaveLength(4);
  });

  // Listed among what can be requested, a blocklisted title would only lead
  // to a page that refuses the request.
  test("leaves out a title Seerr has blocklisted", () => {
    const results = [
      movie(1, "Dune", MediaStatus.BLOCKLISTED),
      movie(2, "Dune: Part Two", MediaStatus.PENDING),
    ];

    expect(ids(notInLibrary(results, { query: "dune" }))).toEqual(["movie:2"]);
  });

  test("leaves out a title the library has in 4K only", () => {
    const results = [
      movie(1, "Dune", MediaStatus.UNKNOWN, MediaStatus.AVAILABLE),
    ];

    expect(notInLibrary(results, { query: "dune" })).toEqual([]);
  });

  // Seerr learns of a new arrival at its next library scan, and only of the
  // libraries it is set to scan: by its status alone, a film the library row
  // right above shows would be listed as missing.
  test("leaves out a title the library search found, by its TMDB number", () => {
    const library: BaseItemDto[] = [
      { Type: "Movie", ProviderIds: { Tmdb: "438631" } },
      { Type: "Series", ProviderIds: { Tmdb: "90228" } },
    ];
    const results = [
      movie(438631, "Dune", MediaStatus.PROCESSING),
      series(90228, "Dune: Prophecy"),
      // A series with the film's number is another title.
      series(438631, "Not the film"),
    ];

    expect(ids(notInLibrary(results, { query: "dune", library }))).toEqual([
      "tv:438631",
    ]);
  });

  test("puts a title named exactly as typed first, the rest in Seerr's order", () => {
    const results = [
      movie(1, "Dune: Part Two"),
      series(2, "Dune: Prophecy"),
      movie(3, "Dune"),
      movie(4, "Dune World"),
    ];

    expect(ids(notInLibrary(results, { query: " Dune " }))).toEqual([
      "movie:3",
      "movie:1",
      "tv:2",
      "movie:4",
    ]);
  });

  test("lists nothing before Seerr answered", () => {
    expect(notInLibrary(undefined, { query: "dune" })).toEqual([]);
  });
});

const fakeApi = (totalPages = 1, server = "https://seerr.example.com") => {
  const calls: { query: string; page: number }[] = [];
  const api = {
    axios: { defaults: { baseURL: server } },
    search: async (params: { query: string; page: number }) => {
      calls.push(params);
      return {
        page: params.page,
        totalPages,
        totalResults: totalPages * 20,
        results: [movie(params.page, `Page ${params.page}`)],
      };
    },
  };
  return { api, calls };
};

const clients: QueryClient[] = [];

type QueryDefaults = NonNullable<
  QueryClientConfig["defaultOptions"]
>["queries"];

const newClient = (queries: QueryDefaults = { retry: false }) => {
  const client = new QueryClient({ defaultOptions: { queries } });
  clients.push(client);
  return client;
};

// Each cached query holds a collection timer, which kept Jest from exiting
// for the five minutes it runs.
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

describe("the Seerr search Library and Discover share", () => {
  test("the library search asks Seerr for the first page alone", async () => {
    const { api, calls } = fakeApi(5);

    await newClient().fetchQuery(seerrFirstPageQuery(api, "dune"));

    expect(calls).toEqual([{ query: "dune", page: 1 }]);
  });

  test("Discover starts from the first page the library search has", async () => {
    const client = newClient();
    const { api, calls } = fakeApi(3);

    await client.fetchQuery(seerrFirstPageQuery(api, "dune"));
    const results = await client.fetchQuery(
      seerrSearchQuery(client, api, "dune"),
    );

    expect(calls.map((call) => call.page)).toEqual([1, 2, 3]);
    expect(results.map((result) => result.id)).toEqual([1, 2, 3]);
  });

  test("the library search finds the first page Discover asked for", async () => {
    const client = newClient();
    const { api, calls } = fakeApi(2);

    await client.fetchQuery(seerrSearchQuery(client, api, "dune"));
    await client.fetchQuery(seerrFirstPageQuery(api, "dune"));

    expect(calls.map((call) => call.page)).toEqual([1, 2]);
  });

  // A request changes a title's status: the first page is asked again rather
  // than reused (touchedByRequest invalidates every Seerr search).
  test("asks again for a first page that was invalidated", async () => {
    const client = newClient();
    const { api, calls } = fakeApi(1);

    await client.fetchQuery(seerrFirstPageQuery(api, "dune"));
    await client.invalidateQueries({
      predicate: (query) => touchedByRequest()(query.queryKey),
    });
    await client.fetchQuery(seerrSearchQuery(client, api, "dune"));

    expect(calls.map((call) => call.page)).toEqual([1, 1]);
  });

  test("asks again for a first page older than a minute", async () => {
    const client = newClient();
    const { api, calls } = fakeApi(1);
    const now = jest.spyOn(Date, "now");

    try {
      now.mockReturnValue(1_000_000);
      await client.fetchQuery(seerrFirstPageQuery(api, "dune"));
      now.mockReturnValue(1_000_000 + SEERR_SEARCH_REUSE_MS);
      await client.fetchQuery(seerrSearchQuery(client, api, "dune"));
    } finally {
      now.mockRestore();
    }

    expect(calls.map((call) => call.page)).toEqual([1, 1]);
  });

  // Fetched through the cache, the first page ran retries of its own inside
  // Discover's: four times as many tries before a Seerr that is down showed.
  test("asks a failing Seerr once for each try of Discover's search", async () => {
    const client = newClient({ retry: 1, retryDelay: 0 });
    let tries = 0;
    const api = {
      axios: { defaults: {} },
      search: async () => {
        tries += 1;
        throw new Error("Seerr is down");
      },
    };

    await expect(
      client.fetchQuery(seerrSearchQuery(client, api, "dune")),
    ).rejects.toThrow("Seerr is down");
    expect(tries).toBe(2);
  });

  // The plugin can point the app at another Seerr without a sign-out, which
  // leaves the cache as it was.
  test("a first page is only good for its own server", async () => {
    const client = newClient();
    const first = fakeApi(1, "https://seerr-a.example.com");
    const second = fakeApi(1, "https://seerr-b.example.com");

    await client.fetchQuery(seerrFirstPageQuery(first.api, "dune"));
    await client.fetchQuery(seerrFirstPageQuery(second.api, "dune"));
    await client.fetchQuery(seerrSearchQuery(client, second.api, "dune"));

    expect(first.calls).toHaveLength(1);
    expect(second.calls).toHaveLength(1);
  });

  test("a first page is only good for its own text", async () => {
    const client = newClient();
    const { api, calls } = fakeApi(1);

    await client.fetchQuery(seerrFirstPageQuery(api, "dune"));
    await client.fetchQuery(seerrSearchQuery(client, api, "dun"));

    expect(calls.map((call) => call.query)).toEqual(["dune", "dun"]);
  });
});

describe("searchOwnedTitles", () => {
  // Jellyfin 12.2 sends ProviderIds only when asked for them, and has no
  // filter by provider id: the text is asked again, past the rows' ten.
  test("asks Jellyfin for the films and series of the text, with their ids", async () => {
    const owned = { Id: "1", Type: "Movie", ProviderIds: { Tmdb: "603" } };
    const api = makeApi({ Items: [owned] });

    const titles = await searchOwnedTitles({
      api,
      userId: "user-1",
      query: "matrix",
    });

    expect(titles).toEqual([owned]);
    expect(api.mock.history.get).toHaveLength(1);
    const url = new URL(api.mock.history.get[0].url ?? "");
    expect(url.pathname).toBe("/Items");
    expect(url.searchParams.get("searchTerm")).toBe("matrix");
    expect(url.searchParams.get("userId")).toBe("user-1");
    expect(url.searchParams.getAll("includeItemTypes")).toEqual([
      "Movie",
      "Series",
    ]);
    expect(url.searchParams.getAll("fields")).toEqual(["ProviderIds"]);
    expect(url.searchParams.get("limit")).toBe(
      String(SEERR_OWNED_TITLES_LIMIT),
    );
    expect(url.searchParams.get("enableImages")).toBe("false");
  });

  test("asks nothing for an empty text", async () => {
    const api = makeApi({ Items: [] });

    expect(await searchOwnedTitles({ api, query: "" })).toEqual([]);
    expect(api.mock.history.get).toHaveLength(0);
  });
});
