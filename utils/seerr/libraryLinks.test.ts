import {
  missingCollectionParts,
  opensSeerrPages,
  seerrCollectionIdOf,
  tmdbIdsOf,
} from "./libraryLinks";
import { MediaStatus, MediaType, type MovieResult } from "./types";

// A part of a TMDB collection as Seerr sends it: with the library's view of
// the film when Seerr has a record of it, and without one when it has none.
const film = (id: number, status?: MediaStatus): MovieResult => ({
  id,
  title: `Film ${id}`,
  mediaType: MediaType.MOVIE,
  mediaInfo:
    status === undefined
      ? undefined
      : { id: id * 10, tmdbId: id, status, mediaType: MediaType.MOVIE },
});

describe("opensSeerrPages", () => {
  test("opens them from the tabs Seerr's posters lead from", () => {
    expect(opensSeerrPages("(home)")).toBe(true);
    expect(opensSeerrPages("(search)")).toBe(true);
    expect(opensSeerrPages("(libraries)")).toBe(true);
  });

  // Seerr's posters draw nothing there, so a link would lead nowhere.
  test("does not from the other tabs", () => {
    expect(opensSeerrPages("(favorites)")).toBe(false);
    expect(opensSeerrPages("(watchlists)")).toBe(false);
    expect(opensSeerrPages(undefined)).toBe(false);
  });
});

describe("seerrCollectionIdOf", () => {
  // As a live Jellyfin 12.2 serves The Matrix Collection once its metadata
  // is refreshed: Seerr's GET /collection/2344.
  test("reads a BoxSet's TMDB collection number", () => {
    expect(
      seerrCollectionIdOf({ Type: "BoxSet", ProviderIds: { Tmdb: "2344" } }),
    ).toBe(2344);
  });

  // A UserView opens the same page, and is no TMDB collection.
  test("has none for anything but a BoxSet", () => {
    expect(
      seerrCollectionIdOf({ Type: "UserView", ProviderIds: { Tmdb: "10" } }),
    ).toBeUndefined();
    expect(
      seerrCollectionIdOf({ Type: "Movie", ProviderIds: { Tmdb: "11" } }),
    ).toBeUndefined();
  });

  test("has none for a BoxSet without a TMDB match", () => {
    expect(
      seerrCollectionIdOf({ Type: "BoxSet", ProviderIds: {} }),
    ).toBeUndefined();
    expect(seerrCollectionIdOf(undefined)).toBeUndefined();
  });
});

describe("tmdbIdsOf", () => {
  // A film of the collection carries the collection's number beside its own,
  // as the same server serves The Matrix: Seerr's parts are films.
  test("reads a film's own number, not its collection's", () => {
    expect(
      tmdbIdsOf([{ ProviderIds: { Tmdb: "603", TmdbCollection: "2344" } }]),
    ).toEqual([603]);
  });

  test("gives each film's number once, and leaves out those without", () => {
    expect(
      tmdbIdsOf([
        { ProviderIds: { Tmdb: "11" } },
        { ProviderIds: { Imdb: "tt0080684" } },
        // Two versions of one film, filed as two items.
        { ProviderIds: { Tmdb: "1891" } },
        { ProviderIds: { Tmdb: "1891" } },
      ]),
    ).toEqual([11, 1891]);
    expect(tmdbIdsOf(undefined)).toEqual([]);
  });
});

describe("missingCollectionParts", () => {
  test("keeps every film the library does not have, with its status", () => {
    const parts = [
      film(11, MediaStatus.AVAILABLE),
      film(1891),
      film(1892, MediaStatus.PENDING),
      film(1893, MediaStatus.PROCESSING),
      film(1894, MediaStatus.UNKNOWN),
      film(1895, MediaStatus.DELETED),
      film(140607, MediaStatus.BLOCKLISTED),
    ];

    expect(missingCollectionParts(parts, []).map((part) => part.id)).toEqual([
      1891, 1892, 1893, 1894, 1895, 140607,
    ]);
  });

  // Seerr reads the library on a schedule and only the libraries it scans:
  // a film the Jellyfin collection shows above the row is not missing.
  test("leaves out a film the collection holds, whatever Seerr says", () => {
    const parts = [film(11), film(1891, MediaStatus.PENDING), film(1892)];

    expect(
      missingCollectionParts(parts, [11, 1891]).map((part) => part.id),
    ).toEqual([1892]);
  });

  test("keeps Seerr's order, which is by release", () => {
    const parts = [film(1893), film(1894), film(1895)];

    expect(missingCollectionParts(parts, [])).toEqual(parts);
  });

  test("has none when every film is there, or when Seerr sent no parts", () => {
    expect(
      missingCollectionParts([film(11, MediaStatus.AVAILABLE)], []),
    ).toEqual([]);
    expect(missingCollectionParts(undefined, [])).toEqual([]);
  });
});
