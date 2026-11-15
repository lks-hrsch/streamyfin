import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { episodeCode, getSeriesPlaybackTarget } from "./seriesPlaybackTarget";

const episode = (
  id: string,
  season: number,
  played: boolean,
  playbackPositionTicks = 0,
): BaseItemDto => ({
  Id: id,
  ParentIndexNumber: season,
  UserData: {
    Key: id,
    Played: played,
    PlaybackPositionTicks: playbackPositionTicks,
  },
});

describe("getSeriesPlaybackTarget", () => {
  test("prefers the episode currently in progress", () => {
    const target = getSeriesPlaybackTarget([
      episode("first-unplayed", 1, false),
      episode("in-progress", 3, false, 10_000),
    ]);

    expect(target?.Id).toBe("in-progress");
    expect(target?.ParentIndexNumber).toBe(3);
  });

  test("falls back through the first unplayed and first episode", () => {
    expect(
      getSeriesPlaybackTarget([
        episode("played", 1, true),
        episode("next", 2, false),
      ])?.Id,
    ).toBe("next");
    expect(
      getSeriesPlaybackTarget([
        episode("first", 1, true),
        episode("second", 2, true),
      ])?.Id,
    ).toBe("first");
  });

  test("returns undefined without episodes", () => {
    expect(getSeriesPlaybackTarget([])).toBeUndefined();
  });
});

describe("episodeCode", () => {
  it("names an episode by season and number, as the TV's Play does", () => {
    expect(episodeCode({ ParentIndexNumber: 1, IndexNumber: 2 })).toBe("S1:E2");
    expect(episodeCode({ ParentIndexNumber: 0, IndexNumber: 1 })).toBe("S0:E1");
  });

  it("has no name for an episode the library has not numbered", () => {
    expect(episodeCode({ ParentIndexNumber: 1 })).toBeUndefined();
    expect(episodeCode({ IndexNumber: null })).toBeUndefined();
  });
});
