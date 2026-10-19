/**
 * How long Seerr's first page of results for a text is reused before it is
 * asked for again: switching between Library and Discover, or typing back to
 * an earlier text, within a minute costs Seerr no new search. A request, a
 * pull to refresh and a sign out end that at once (touchedByRequest,
 * isSeerrQuery), so a status shown is still the one Seerr last reported.
 */
export const SEERR_SEARCH_REUSE_MS = 60_000;

/**
 * How many of the library's films and series matching the text are checked
 * against Seerr's titles, ids only. Far past the ten a row shows, so a title
 * the library has keeps out of "Not in your library" however it ranks; the
 * answer stays small (no images, no user data).
 */
export const SEERR_OWNED_TITLES_LIMIT = 100;
