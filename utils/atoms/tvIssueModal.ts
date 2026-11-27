import { atom } from "jotai";
import type { IssueEpisode } from "@/utils/seerr/libraryIssue";

/** What the TV's report issue sheet files an issue against. */
export type TVIssueModalState = {
  /** The title's name, shown over the sheet. */
  title: string;
  /** Seerr's media id for the title (its mediaInfo), not TMDB's. */
  mediaId: number;
  /**
   * The episode of a series the issue is about, from a library episode's
   * page: Seerr files the issue against the series and records the episode.
   */
  episode?: IssueEpisode;
  /**
   * Once the sheet closes, however it does. A closed sheet leaves Android TV
   * with nothing focused, so the page hands the focus back from here.
   */
  onClose?: () => void;
} | null;

export const tvIssueModalAtom = atom<TVIssueModalState>(null);
