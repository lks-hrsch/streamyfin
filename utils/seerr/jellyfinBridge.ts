import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { MediaType } from "./types";

/**
 * A Jellyfin item's TMDB number, from its provider ids. Jellyfin writes the key
 * as "Tmdb", but the dictionary is case-insensitive on the server, so a
 * metadata plugin's spelling is accepted too.
 */
export const tmdbIdOf = (
  item: Pick<BaseItemDto, "ProviderIds"> | null | undefined,
): number | undefined => {
  const ids = item?.ProviderIds;
  if (!ids) return undefined;
  const key = Object.keys(ids).find((name) => name.toLowerCase() === "tmdb");
  const value = key ? Number(ids[key]) : Number.NaN;
  return Number.isInteger(value) && value > 0 ? value : undefined;
};

/**
 * The Seerr title a Jellyfin movie or series is, which is how Seerr knows it:
 * by its type and TMDB number. Undefined for anything else (a season or an
 * episode belongs to its series, whose item carries the number) and for an
 * item without a TMDB match.
 */
export const seerrTitleOf = (
  item: Pick<BaseItemDto, "Type" | "ProviderIds"> | null | undefined,
): { mediaType: MediaType; tmdbId: number } | undefined => {
  const mediaType =
    item?.Type === "Movie"
      ? MediaType.MOVIE
      : item?.Type === "Series"
        ? MediaType.TV
        : undefined;
  const tmdbId = tmdbIdOf(item);
  return mediaType && tmdbId ? { mediaType, tmdbId } : undefined;
};
