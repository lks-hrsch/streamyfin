import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { episodeAvailability } from "@/utils/upcomingEpisodes";
import {
  type HeldSeasons,
  type SeasonBadge,
  type SeasonRow,
  seasonRows,
  unrequestedSeasons,
} from "./seasons";
import { seerrStatusBadge } from "./statusBadge";
import { MediaStatus, type TvDetails } from "./types";

/**
 * Where a season the library lacks stands on Seerr: Seerr's own badge but
 * available, or a request for it that failed.
 */
export type MissingSeasonBadge = Exclude<SeasonBadge, "available"> | "failed";

export interface MissingSeason {
  seasonNumber: number;
  episodeCount: number;
  badge: MissingSeasonBadge;
  /** Whether it can still be asked for, by the request sheet's own rules. */
  requestable: boolean;
}

/**
 * The seasons of a series the Jellyfin library holds every episode of, by
 * Seerr's count of each season's episodes. A missing or unaired episode the
 * server lists as a placeholder does not count.
 */
export const seasonsHeldInFull = (
  details: TvDetails,
  episodes: BaseItemDto[],
): HeldSeasons => {
  const held = new Map<number, number>();
  for (const episode of episodes) {
    const season = episode.ParentIndexNumber;
    if (season == null || episodeAvailability(episode) !== null) continue;
    held.set(season, (held.get(season) ?? 0) + 1);
  }
  return new Set(
    details.seasons
      .filter(
        (season) =>
          season.episodeCount > 0 &&
          (held.get(season.seasonNumber) ?? 0) >= season.episodeCount,
      )
      .map((season) => season.seasonNumber),
  );
};

/**
 * The words for a season row, undefined for one with nothing missing or
 * nothing to ask for. Seerr draws no badge for two kinds of row: a season it
 * holds aside (pending approval, or blocklisted, which no request can change),
 * and a season whose request stands but failed.
 */
const missingBadge = (
  details: TvDetails,
  row: SeasonRow,
): MissingSeasonBadge | undefined => {
  if (row.badge) return row.badge === "available" ? undefined : row.badge;
  const library = details.mediaInfo?.seasons?.find(
    (season) => season.seasonNumber === row.seasonNumber,
  )?.status;
  if (library === MediaStatus.BLOCKLISTED) return undefined;
  if (library === MediaStatus.PENDING) return "pending";
  return "failed";
};

/**
 * The seasons of a library series that Seerr does not report as available,
 * each with where it stands there. They are the rows of the request sheet
 * (seasonRows), with the same seasons held by the library and the same rules
 * for what can still be asked for, so the list never offers what the sheet
 * does not: a partially available season, for one, is in neither.
 */
export const missingSeasons = (
  details: TvDetails,
  { specials = false, held }: { specials?: boolean; held?: HeldSeasons } = {},
): MissingSeason[] => {
  const unrequested = new Set(unrequestedSeasons(details, { specials, held }));

  return seasonRows(details, { specials, held })
    .flatMap((row): MissingSeason[] => {
      const badge = missingBadge(details, row);
      if (!badge) return [];
      return [
        {
          seasonNumber: row.seasonNumber,
          episodeCount: row.episodeCount,
          badge,
          requestable: unrequested.has(row.seasonNumber),
        },
      ];
    })
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
};

// The status icon of each of Seerr's badges (seasons.ts, BADGE_STATUS).
const BADGE_STATUS: Record<
  Exclude<MissingSeasonBadge, "failed">,
  MediaStatus
> = {
  not_requested: MediaStatus.UNKNOWN,
  pending: MediaStatus.PENDING,
  requested: MediaStatus.PROCESSING,
  partially_available: MediaStatus.PARTIALLY_AVAILABLE,
};

/**
 * The badge a missing season draws, Seerr's own (seerrStatusBadge): a "+" on
 * one the user may ask for, and none for a failed request, which Seerr draws
 * none for either.
 */
export const missingSeasonIcon = (
  season: MissingSeason,
  offersRequest: boolean,
) =>
  season.badge === "failed"
    ? undefined
    : seerrStatusBadge(
        BADGE_STATUS[season.badge],
        offersRequest && season.requestable,
      );
