import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { tmdbIdOf } from "./jellyfinBridge";
import { MediaStatus, type MovieResult } from "./types";

/**
 * The phone tabs a Seerr page opens in. The Seerr posters draw nothing in any
 * other (TouchableSeerrRouter, PersonPoster), so a link there would be a
 * heading over an empty row, or a button that does nothing.
 */
const SEERR_PHONE_TABS = ["(home)", "(search)", "(libraries)"];

/** Whether the phone can open Seerr's pages from a tab, by its route group. */
export const opensSeerrPages = (tab: string | undefined): boolean =>
  tab !== undefined && SEERR_PHONE_TABS.includes(tab);

/**
 * The TMDB collection a Jellyfin collection is. Jellyfin's TMDB provider keeps
 * a BoxSet's collection number under the "Tmdb" key a film keeps its own
 * number under (TmdbBoxSetProvider), so only a BoxSet's is a collection's: a
 * UserView opens the same page and carries no such number.
 */
export const seerrCollectionIdOf = (
  item: Pick<BaseItemDto, "Type" | "ProviderIds"> | null | undefined,
): number | undefined => (item?.Type === "BoxSet" ? tmdbIdOf(item) : undefined);

/** The TMDB numbers of Jellyfin films, each once, without the films that have none. */
export const tmdbIdsOf = (
  items: Pick<BaseItemDto, "ProviderIds">[] | null | undefined,
): number[] => [
  ...new Set(
    (items ?? []).flatMap((item) => {
      const id = tmdbIdOf(item);
      return id === undefined ? [] : [id];
    }),
  ),
];

/**
 * The films of a TMDB collection the library lacks, in Seerr's order, which is
 * by release: the ones there is something to do about on Seerr.
 *
 * A film Seerr reports available is in the library somewhere, if not in this
 * collection, and Seerr refuses a request for it, so it is no missing film.
 * Seerr's status is also only what it last read from Jellyfin: it lags a film
 * added since its last scan, and never sees a library it was not told to
 * scan. A film the Jellyfin collection holds (`owned`, by TMDB number) is
 * therefore never missing either, whatever Seerr says about it.
 */
export const missingCollectionParts = (
  parts: MovieResult[] | null | undefined,
  owned: readonly number[],
): MovieResult[] => {
  const held = new Set(owned);
  return (parts ?? []).filter(
    (part) =>
      part.mediaInfo?.status !== MediaStatus.AVAILABLE && !held.has(part.id),
  );
};
