/**
 * How a TV sheet (the option, subtitle, season and user switch sheets) comes
 * in: the backdrop fades and the sheet slides up, its cards mount once it has
 * laid out, and focus moves to the current card once they exist. And how it
 * goes: the page takes the focus back once its route has left.
 */
export const TVSheetTiming = {
  /** Fade of the dimmed backdrop. */
  fadeInMs: 250,
  /** Slide of the sheet from below. */
  slideInMs: 300,
  /** Delay before the cards mount, so the sheet has laid out. */
  contentDelayMs: 100,
  /** Delay before focus moves to the current card, so the cards exist. */
  focusDelayMs: 50,
  /** Delay before a tab's content mounts, on opening and after a tab switch. */
  tabContentDelayMs: 50,
  /**
   * Delay after a sheet closes before the page asks for the focus back
   * (useTVFocusRestore), long enough for the sheet's route to have left the
   * screen.
   */
  focusRestoreMs: 300,
} as const;
