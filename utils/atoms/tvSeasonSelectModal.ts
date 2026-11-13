import { atom } from "jotai";
import type { HeldSeasons } from "@/utils/seerr/seasons";
import type { TvDetails } from "@/utils/seerr/types";

export type TVSeasonSelectModalState = {
  /** The series, whose seasons, requests and library state the sheet reads. */
  series: TvDetails;
  /** Seasons the library holds in full, shown available rather than offered. */
  heldSeasons?: HeldSeasons;
  title: string;
  mediaId: number;
  tvdbId?: number;
  hasAdvancedRequestPermission: boolean;
  /** After a request went through, for a page that has more to refresh. */
  onRequested?: () => void;
} | null;

export const tvSeasonSelectModalAtom = atom<TVSeasonSelectModalState>(null);
