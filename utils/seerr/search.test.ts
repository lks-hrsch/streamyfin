import { QueryClient, type QueryClientConfig } from "@tanstack/react-query";
import { SEERR_SEARCH_REUSE_MS } from "@/constants/SeerrLibrarySearch";
import { isSeerrQuery, touchedByRequest } from "./queries";
import {
  nextResultsPage,
  type SeerrSearchApi,
  searchSeerr,
  seerrFirstPageKey,
  seerrFirstPageQuery,
  seerrQueryString,
  seerrSearchKey,
  seerrSearchQuery,
} from "./search";

const fakeApi = (pages: { id: number; mediaType?: string }[][] = [[]]) => {
  const calls: { query: string; page: number }[] = [];
  const api = {
    search: async (params: { query: string; page: number }) => {
      calls.push(params);
      return {
        page: params.page,
        totalPages: pages.length,
        results: pages[params.page - 1] ?? [],
      };
    },
  };
  return { api: api as never, calls };
};

describe("searchSeerr", () => {
  // The text used to go through URLSearchParams, which sent "dune=" for
  // "dune": results moved around, and a word still being typed found nothing.
  test("searches for the text as it was typed", async () => {
    const { api, calls } = fakeApi();

    await searchSeerr(api, "noctur");
    await searchSeerr(api, "castlevania noct");

    expect(new Set(calls.map((call) => call.query))).toEqual(
      new Set(["noctur", "castlevania noct"]),
    );
  });

  test("asks only for the pages there are, four at most", async () => {
    const one = fakeApi([[{ id: 1 }]]);
    await searchSeerr(one.api, "castlevania noct");
    expect(one.calls.map((call) => call.page)).toEqual([1]);

    const many = fakeApi(Array.from({ length: 65 }, () => []));
    await searchSeerr(many.api, "dune");
    expect(many.calls.map((call) => call.page).sort()).toEqual([1, 2, 3, 4]);
  });

  test("keeps each result once across the pages", async () => {
    const { api } = fakeApi([
      [{ id: 1 }, { id: 2 }],
      [{ id: 2 }, { id: 3 }],
    ]);

    const results = await searchSeerr(api, "dune");

    expect(results.map((result) => result.id)).toEqual([1, 2, 3]);
  });

  test("keeps a film and a series that share a TMDB number", async () => {
    const { api } = fakeApi([
      [
        { id: 1399, mediaType: "movie" },
        { id: 1399, mediaType: "tv" },
      ],
      [{ id: 1399, mediaType: "tv" }],
    ]);

    const results = await searchSeerr(api, "got");

    expect(results.map((result) => `${result.mediaType}:${result.id}`)).toEqual(
      ["movie:1399", "tv:1399"],
    );
  });

  test("finds nothing without a Seerr connection", async () => {
    expect(await searchSeerr(undefined, "dune")).toEqual([]);
  });
});

// The fake server's answer to a page: a film numbered as the page, so a test
// tells the pages apart, and one per server with `id`.
const fakeServer = (
  server = "https://seerr.example.com",
  totalPages = 1,
  id?: number,
) => {
  const calls: { query: string; page: number }[] = [];
  const api = {
    axios: { defaults: { baseURL: server } },
    search: async (params: { query: string; page: number }) => {
      calls.push(params);
      return {
        page: params.page,
        totalPages,
        totalResults: totalPages * 20,
        results: [{ id: id ?? params.page, mediaType: "movie" }],
      };
    },
  };
  return { api: api as never as SeerrSearchApi, calls };
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

describe("seerrSearchQuery", () => {
  // The plugin can point the app at another Seerr without a sign-out, which
  // leaves the cache as it was.
  test("answers for a server with that server's results", async () => {
    const client = newClient();
    const first = fakeServer("https://seerr-a.example.com", 1, 1);
    const second = fakeServer("https://seerr-b.example.com", 1, 2);

    await client.fetchQuery(seerrSearchQuery(client, first.api, "dune"));
    const results = await client.fetchQuery({
      ...seerrSearchQuery(client, second.api, "dune"),
      staleTime: Infinity,
    });

    expect(second.calls).toHaveLength(1);
    expect(results.map((result) => result.id)).toEqual([2]);
  });

  // With the server in the key, a request must still mark the results out of
  // date, and a reset of Seerr must still take them out of the cache.
  test("is still found by a request and by a reset of Seerr", () => {
    for (const key of [
      seerrSearchKey(fakeServer().api, "dune"),
      seerrFirstPageKey(fakeServer().api, "dune"),
    ]) {
      expect(touchedByRequest()(key)).toBe(true);
      expect(isSeerrQuery(key)).toBe(true);
    }
  });
});

describe("the Seerr search Library and Discover share", () => {
  test("the library search asks Seerr for the first page alone", async () => {
    const { api, calls } = fakeServer(undefined, 5);

    await newClient().fetchQuery(seerrFirstPageQuery(api, "dune"));

    expect(calls).toEqual([{ query: "dune", page: 1 }]);
  });

  test("Discover starts from the first page the library search has", async () => {
    const client = newClient();
    const { api, calls } = fakeServer(undefined, 3);

    await client.fetchQuery(seerrFirstPageQuery(api, "dune"));
    const results = await client.fetchQuery(
      seerrSearchQuery(client, api, "dune"),
    );

    expect(calls.map((call) => call.page)).toEqual([1, 2, 3]);
    expect(results.map((result) => result.id)).toEqual([1, 2, 3]);
  });

  test("the library search finds the first page Discover asked for", async () => {
    const client = newClient();
    const { api, calls } = fakeServer(undefined, 2);

    await client.fetchQuery(seerrSearchQuery(client, api, "dune"));
    await client.fetchQuery(seerrFirstPageQuery(api, "dune"));

    expect(calls.map((call) => call.page)).toEqual([1, 2]);
  });

  // A request changes a title's status: the first page is asked again rather
  // than reused (touchedByRequest invalidates every Seerr search).
  test("asks again for a first page that was invalidated", async () => {
    const client = newClient();
    const { api, calls } = fakeServer();

    await client.fetchQuery(seerrFirstPageQuery(api, "dune"));
    await client.invalidateQueries({
      predicate: (query) => touchedByRequest()(query.queryKey),
    });
    await client.fetchQuery(seerrSearchQuery(client, api, "dune"));

    expect(calls.map((call) => call.page)).toEqual([1, 1]);
  });

  test("asks again for a first page older than a minute", async () => {
    const client = newClient();
    const { api, calls } = fakeServer();
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

  test("a first page is only good for its own server", async () => {
    const client = newClient();
    const first = fakeServer("https://seerr-a.example.com");
    const second = fakeServer("https://seerr-b.example.com");

    await client.fetchQuery(seerrFirstPageQuery(first.api, "dune"));
    await client.fetchQuery(seerrFirstPageQuery(second.api, "dune"));
    await client.fetchQuery(seerrSearchQuery(client, second.api, "dune"));

    expect(first.calls).toHaveLength(1);
    expect(second.calls).toHaveLength(1);
  });

  test("a first page is only good for its own text", async () => {
    const client = newClient();
    const { api, calls } = fakeServer();

    await client.fetchQuery(seerrFirstPageQuery(api, "dune"));
    await client.fetchQuery(seerrSearchQuery(client, api, "dun"));

    expect(calls.map((call) => call.query)).toEqual(["dune", "dun"]);
  });
});

// Seerr's API refuses a query that still holds a reserved character, and a
// space written as "+" is one: Seerr's own site encodes it as %20.
describe("seerrQueryString", () => {
  test("writes a space as %20", () => {
    expect(seerrQueryString({ query: "castlevania noct", page: 1 })).toBe(
      "query=castlevania%20noct&page=1",
    );
  });

  test("encodes what Seerr's site encodes, and leaves the apostrophe", () => {
    expect(seerrQueryString({ query: "(500) days of summer!" })).toBe(
      "query=%28500%29%20days%20of%20summer%21",
    );
    expect(seerrQueryString({ query: "M*A*S*H" })).toBe("query=M%2AA%2AS%2AH");
    expect(seerrQueryString({ query: "l'été" })).toBe("query=l'%C3%A9t%C3%A9");
  });
});

// The next page of a list Seerr gives a page at a time, none past its last:
// asking on and on for empty pages cost a request at every scroll.
describe("nextResultsPage", () => {
  test("asks for the page after the one that came", () => {
    expect(nextResultsPage({ page: 1, totalPages: 3 })).toBe(2);
  });

  test("stops at the last page", () => {
    expect(nextResultsPage({ page: 3, totalPages: 3 })).toBeUndefined();
    expect(nextResultsPage({ page: 1, totalPages: 0 })).toBeUndefined();
  });

  test("stops without an answer", () => {
    expect(nextResultsPage(undefined)).toBeUndefined();
  });
});
