import type { BaseItemKind } from "@jellyfin/sdk/lib/generated-client/models";
import {
  canCreateIssues,
  episodeLabel,
  issueEpisodeOf,
  issueReport,
  issueSubject,
  issueTitleSource,
  libraryIssueTarget,
} from "./libraryIssue";
import { Permission } from "./permissions";

describe("canCreateIssues", () => {
  // Seerr's own rule for POST /issue: either permission will do.
  test("takes an issue from those who may create or manage issues", () => {
    expect(canCreateIssues(Permission.CREATE_ISSUES)).toBe(true);
    expect(canCreateIssues(Permission.MANAGE_ISSUES)).toBe(true);
    expect(canCreateIssues(Permission.ADMIN)).toBe(true);
    expect(canCreateIssues(Permission.REQUEST | Permission.CREATE_ISSUES)).toBe(
      true,
    );
  });

  test("refuses everyone else", () => {
    expect(canCreateIssues(Permission.REQUEST | Permission.VIEW_ISSUES)).toBe(
      false,
    );
    expect(canCreateIssues(Permission.NONE)).toBe(false);
    // No Seerr user signed in.
    expect(canCreateIssues(undefined)).toBe(false);
  });
});

describe("issueTitleSource", () => {
  test("a movie is its own Seerr title", () => {
    expect(issueTitleSource({ Type: "Movie" })).toBe("self");
  });

  // Seerr files issues against a series, never an episode of it.
  test("an episode goes through its series", () => {
    expect(issueTitleSource({ Type: "Episode", SeriesId: "s1" })).toBe(
      "series",
    );
  });

  test("an episode with no series to look up has no title", () => {
    expect(issueTitleSource({ Type: "Episode" })).toBeUndefined();
    expect(
      issueTitleSource({ Type: "Episode", SeriesId: null }),
    ).toBeUndefined();
  });

  test("nothing else reports an issue", () => {
    const others: BaseItemKind[] = [
      "Series",
      "Season",
      "Program",
      "Video",
      "Book",
    ];
    for (const Type of others) {
      expect(issueTitleSource({ Type, SeriesId: "s1" })).toBeUndefined();
    }
    expect(issueTitleSource(undefined)).toBeUndefined();
  });
});

describe("issueEpisodeOf", () => {
  test("reads the season, the episode and the title", () => {
    expect(
      issueEpisodeOf({
        Type: "Episode",
        Name: "Grilled",
        ParentIndexNumber: 2,
        IndexNumber: 5,
      }),
    ).toEqual({ season: 2, episode: 5, name: "Grilled" });
  });

  // Specials live in season 0, which is a season like any other.
  test("a special is in season 0", () => {
    expect(
      issueEpisodeOf({ Type: "Episode", ParentIndexNumber: 0, IndexNumber: 3 }),
    ).toEqual({ season: 0, episode: 3 });
  });

  test("keeps what the library knows of an episode it has not numbered", () => {
    expect(issueEpisodeOf({ Type: "Episode", ParentIndexNumber: 4 })).toEqual({
      season: 4,
    });
    expect(issueEpisodeOf({ Type: "Episode", Name: "Pilot" })).toEqual({
      name: "Pilot",
    });
  });

  test("names nothing of an episode the library knows nothing about", () => {
    expect(issueEpisodeOf({ Type: "Episode" })).toBeUndefined();
  });

  test("a movie is no episode", () => {
    expect(
      issueEpisodeOf({
        Type: "Movie",
        Name: "Heat",
        ParentIndexNumber: 1,
        IndexNumber: 2,
      }),
    ).toBeUndefined();
  });
});

describe("episodeLabel", () => {
  test("writes the usual S02E05", () => {
    expect(episodeLabel({ season: 2, episode: 5, name: "Grilled" })).toBe(
      "S02E05",
    );
    expect(episodeLabel({ season: 12, episode: 104 })).toBe("S12E104");
  });

  test("names an episode without numbers by its title", () => {
    expect(episodeLabel({ name: "Pilot" })).toBe("Pilot");
    expect(episodeLabel({ season: 4, name: "Pilot" })).toBe("Pilot");
    expect(episodeLabel({ episode: 3, name: "Pilot" })).toBe("Pilot");
  });

  test("falls back to the season alone", () => {
    expect(episodeLabel({ season: 0 })).toBe("S00");
  });

  test("has nothing to say without numbers or a title", () => {
    expect(episodeLabel({ episode: 3 })).toBeUndefined();
  });
});

describe("issueReport", () => {
  // Seerr records the season and episode in fields of their own, which its
  // issue page and notifications show.
  test("hands Seerr the season and episode, the message as typed", () => {
    expect(
      issueReport("No sound after the intro", {
        season: 2,
        episode: 5,
        name: "Grilled",
      }),
    ).toEqual({
      message: "No sound after the intro",
      problem: { season: 2, episode: 5 },
    });
  });

  test("is the message alone for a movie", () => {
    expect(issueReport("Out of sync")).toEqual({ message: "Out of sync" });
  });

  // Seerr reads season 0 as all seasons and episode 0 as all episodes, which
  // would file a special's issue against the whole series.
  test("leads the message with an episode Seerr cannot name", () => {
    expect(
      issueReport("Cuts out", { season: 0, episode: 3, name: "Special" }),
    ).toEqual({ message: "S00E03 · Cuts out" });
    expect(issueReport("Cuts out", { season: 4, episode: 0 })).toEqual({
      message: "S04E00 · Cuts out",
      problem: { season: 4 },
    });
  });

  // Otherwise the issue named the series and nothing else.
  test("names an episode the library has not numbered by its title", () => {
    expect(issueReport("Wrong cut", { name: "Pilot" })).toEqual({
      message: "Pilot · Wrong cut",
    });
    expect(issueReport("Wrong cut", { season: 3, name: "Pilot" })).toEqual({
      message: "Pilot · Wrong cut",
      problem: { season: 3 },
    });
  });

  test("hands Seerr the season when that is all the library knows", () => {
    expect(issueReport("Wrong cut", { season: 3 })).toEqual({
      message: "S03 · Wrong cut",
      problem: { season: 3 },
    });
  });
});

describe("issueSubject", () => {
  test("names the series and the episode", () => {
    expect(
      issueSubject("Breaking Bad", { season: 2, episode: 5, name: "Grilled" }),
    ).toBe("Breaking Bad · S02E05");
    expect(issueSubject("Breaking Bad", { name: "Pilot" })).toBe(
      "Breaking Bad · Pilot",
    );
  });

  test("names a movie by itself", () => {
    expect(issueSubject("Heat")).toBe("Heat");
    expect(issueSubject("Heat", { episode: 3 })).toBe("Heat");
  });
});

describe("libraryIssueTarget", () => {
  test("files a movie's issue against its Seerr record", () => {
    expect(libraryIssueTarget({ Type: "Movie", Name: "Heat" }, 42)).toEqual({
      mediaId: 42,
      title: "Heat",
      episode: undefined,
    });
  });

  test("files an episode's issue against its series, naming the episode", () => {
    expect(
      libraryIssueTarget(
        {
          Type: "Episode",
          Name: "Grilled",
          SeriesName: "Breaking Bad",
          ParentIndexNumber: 2,
          IndexNumber: 2,
        },
        7,
      ),
    ).toEqual({
      mediaId: 7,
      title: "Breaking Bad",
      episode: { season: 2, episode: 2, name: "Grilled" },
    });
  });

  // A title Seerr has never seen carries no mediaInfo, so there is nothing to
  // file an issue against.
  test("has nothing to file against without a Seerr record", () => {
    expect(
      libraryIssueTarget({ Type: "Movie", Name: "Heat" }, undefined),
    ).toBeUndefined();
    expect(libraryIssueTarget(undefined, 42)).toBeUndefined();
  });

  test("falls back to the episode's name without a series name", () => {
    expect(
      libraryIssueTarget({ Type: "Episode", Name: "Pilot" }, 7)?.title,
    ).toBe("Pilot");
  });
});
