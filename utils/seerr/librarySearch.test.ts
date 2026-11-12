import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { SEERR_OWNED_TITLES_LIMIT } from "@/constants/SeerrLibrarySearch";
import { makeApi } from "@/test-utils/jellyfinApi";
import { notInLibrary, searchOwnedTitles } from "./librarySearch";
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
