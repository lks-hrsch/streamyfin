import type { TFunction } from "i18next";
import { seerrSeasonLabel, seerrSeasonStatusText } from "./seasonText";

const t = ((key: string, options?: { season_number?: number }) =>
  options?.season_number === undefined
    ? key
    : `${key}:${options.season_number}`) as unknown as TFunction;

describe("seerrSeasonLabel", () => {
  test("names season 0 the specials, as Seerr does", () => {
    expect(seerrSeasonLabel(t, 0)).toBe("seerr.specials");
  });

  test("names any other season by its number", () => {
    expect(seerrSeasonLabel(t, 1)).toBe("seerr.season_number:1");
    expect(seerrSeasonLabel(t, 12)).toBe("seerr.season_number:12");
  });
});

describe("seerrSeasonStatusText", () => {
  test("says each of Seerr's season badges in its request table's words", () => {
    expect(
      (
        [
          "not_requested",
          "pending",
          "requested",
          "partially_available",
          "available",
        ] as const
      ).map((badge) => seerrSeasonStatusText(t, badge)),
    ).toEqual([
      "seerr.season_badge.not_requested",
      "seerr.season_badge.pending",
      "seerr.season_badge.requested",
      "seerr.season_badge.partially_available",
      "seerr.season_badge.available",
    ]);
  });

  // Seerr draws no badge for a season whose request failed: the series
  // page's missing seasons say the request's own status instead.
  test("says a failed request as the request's status", () => {
    expect(seerrSeasonStatusText(t, "failed")).toBe(
      "seerr.request_status.failed",
    );
  });
});
