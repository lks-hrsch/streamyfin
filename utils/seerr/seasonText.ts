import type { TFunction } from "i18next";
import type { SeasonBadge } from "./seasons";

/** A season on Seerr by name: season 0 is the specials, as Seerr has it. */
export const seerrSeasonLabel = (t: TFunction, seasonNumber: number): string =>
  seasonNumber === 0
    ? t("seerr.specials")
    : t("seerr.season_number", { season_number: seasonNumber });

/**
 * Where a season stands on Seerr, in the words of its request table, and a
 * failed request, which Seerr has no badge for, by the request's own status.
 * Each key is written out rather than built, so it reads as used.
 */
export const seerrSeasonStatusText = (
  t: TFunction,
  badge: SeasonBadge | "failed",
): string => {
  switch (badge) {
    case "not_requested":
      return t("seerr.season_badge.not_requested");
    case "pending":
      return t("seerr.season_badge.pending");
    case "requested":
      return t("seerr.season_badge.requested");
    case "partially_available":
      return t("seerr.season_badge.partially_available");
    case "available":
      return t("seerr.season_badge.available");
    case "failed":
      return t("seerr.request_status.failed");
  }
};
