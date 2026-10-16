import { seerrTitleOf, tmdbIdOf } from "./jellyfinBridge";
import { MediaType } from "./types";

describe("tmdbIdOf", () => {
  test("reads Jellyfin's Tmdb provider id", () => {
    expect(tmdbIdOf({ ProviderIds: { Tmdb: "1399", Imdb: "tt0944947" } })).toBe(
      1399,
    );
  });

  test("accepts another spelling of the key", () => {
    expect(tmdbIdOf({ ProviderIds: { TMDB: "603" } })).toBe(603);
  });

  test("has none without a usable number", () => {
    expect(tmdbIdOf({ ProviderIds: { Imdb: "tt0133093" } })).toBeUndefined();
    expect(tmdbIdOf({ ProviderIds: { Tmdb: "" } })).toBeUndefined();
    expect(tmdbIdOf({ ProviderIds: { Tmdb: "abc" } })).toBeUndefined();
    expect(tmdbIdOf({ ProviderIds: null })).toBeUndefined();
    expect(tmdbIdOf(undefined)).toBeUndefined();
  });
});

describe("seerrTitleOf", () => {
  test("a movie is a Seerr movie", () => {
    expect(
      seerrTitleOf({ Type: "Movie", ProviderIds: { Tmdb: "603" } }),
    ).toEqual({ mediaType: MediaType.MOVIE, tmdbId: 603 });
  });

  test("a series is a Seerr series", () => {
    expect(
      seerrTitleOf({ Type: "Series", ProviderIds: { Tmdb: "1399" } }),
    ).toEqual({ mediaType: MediaType.TV, tmdbId: 1399 });
  });

  // A season's or an episode's TMDB number is not its series'.
  test("a season or an episode is no Seerr title of its own", () => {
    expect(
      seerrTitleOf({ Type: "Season", ProviderIds: { Tmdb: "3624" } }),
    ).toBeUndefined();
    expect(
      seerrTitleOf({ Type: "Episode", ProviderIds: { Tmdb: "63056" } }),
    ).toBeUndefined();
  });

  test("an item without a TMDB match has none", () => {
    expect(seerrTitleOf({ Type: "Movie", ProviderIds: {} })).toBeUndefined();
  });
});
