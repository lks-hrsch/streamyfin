import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { hasPermission, Permission } from "./permissions";

/**
 * Whether Seerr takes an issue from this user: the rule its POST /issue route
 * checks, either permission will do.
 */
export const canCreateIssues = (permissions: number | undefined): boolean =>
  permissions !== undefined &&
  hasPermission(
    [Permission.MANAGE_ISSUES, Permission.CREATE_ISSUES],
    permissions,
    { type: "or" },
  );

/**
 * Which Jellyfin item carries the Seerr title an issue on `item` is filed
 * against: a movie is its own, an episode belongs to its series, whose item
 * holds the TMDB number. Undefined for anything Seerr takes no issue on.
 */
export const issueTitleSource = (
  item: Pick<BaseItemDto, "Type" | "SeriesId"> | null | undefined,
): "self" | "series" | undefined => {
  if (item?.Type === "Movie") return "self";
  if (item?.Type === "Episode" && item.SeriesId) return "series";
  return undefined;
};

/** The episode of a series an issue is about, as far as the library knows. */
export interface IssueEpisode {
  season?: number;
  episode?: number;
  /** Its title: what names an episode the library has not numbered. */
  name?: string;
}

export const issueEpisodeOf = (
  item: Pick<
    BaseItemDto,
    "Type" | "Name" | "ParentIndexNumber" | "IndexNumber"
  >,
): IssueEpisode | undefined => {
  if (item.Type !== "Episode") return undefined;
  const episode: IssueEpisode = {
    ...(item.ParentIndexNumber != null && { season: item.ParentIndexNumber }),
    ...(item.IndexNumber != null && { episode: item.IndexNumber }),
    ...(item.Name && { name: item.Name }),
  };
  return Object.keys(episode).length > 0 ? episode : undefined;
};

const twoDigits = (value: number) => String(value).padStart(2, "0");

/**
 * How an episode is named to whoever reads the issue: S02E05, else its title,
 * else its season (S02). Undefined when the library knows none of these.
 */
export const episodeLabel = ({
  season,
  episode,
  name,
}: IssueEpisode): string | undefined => {
  if (season !== undefined && episode !== undefined) {
    return `S${twoDigits(season)}E${twoDigits(episode)}`;
  }
  if (name) return name;
  return season !== undefined ? `S${twoDigits(season)}` : undefined;
};

/** What `SeerrApi.submitIssue` sends besides the issue type. */
export interface IssueReport {
  message: string;
  problem?: { season: number; episode?: number };
}

/**
 * The message, and the season and episode Seerr records for an issue. Seerr
 * reads a season or an episode of 0 as all of them: its issue page shows "All
 * Seasons" and "All Episodes" for a 0 (seerr-team/seerr v3.4.1,
 * src/components/IssueDetails/index.tsx#L337-L352), and its own report form
 * sends 0 for those choices (src/components/IssueModal/CreateIssueModal/
 * index.tsx#L178 and #L211). An episode Seerr cannot name that way (a special
 * in season 0, one the library has not numbered) leads the message instead,
 * where whoever handles the issue reads it first.
 */
export const issueReport = (
  text: string,
  episode?: IssueEpisode,
): IssueReport => {
  if (!episode) return { message: text };
  const { season, episode: number } = episode;
  const problem =
    season !== undefined && season > 0
      ? {
          season,
          ...(number !== undefined && number > 0 && { episode: number }),
        }
      : undefined;
  if (problem?.episode !== undefined) return { message: text, problem };
  const label = episodeLabel(episode);
  return {
    message: label ? `${label} · ${text}` : text,
    ...(problem && { problem }),
  };
};

/** What an issue is about, as the report sheet names it. */
export const issueSubject = (title: string, episode?: IssueEpisode): string => {
  const label = episode && episodeLabel(episode);
  return label ? `${title} · ${label}` : title;
};

/** Where a library movie or episode files an issue in Seerr. */
export interface LibraryIssueTarget {
  /** Seerr's media id for the title (its mediaInfo), not TMDB's. */
  mediaId: number;
  /** The movie, or the series an episode belongs to. */
  title: string;
  episode?: IssueEpisode;
}

/**
 * Undefined when Seerr has no record of the title: one it has never seen
 * carries no mediaInfo, so there is nothing to file an issue against.
 */
export const libraryIssueTarget = (
  item:
    | Pick<
        BaseItemDto,
        "Type" | "Name" | "SeriesName" | "ParentIndexNumber" | "IndexNumber"
      >
    | null
    | undefined,
  mediaId: number | undefined,
): LibraryIssueTarget | undefined => {
  if (!item || mediaId === undefined) return undefined;
  return {
    mediaId,
    title: item.SeriesName || item.Name || "",
    episode: issueEpisodeOf(item),
  };
};
