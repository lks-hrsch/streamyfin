/**
 * Whether the Search screen shows its sort: it sorts what the search found,
 * so it comes with the first word typed.
 */
export const showSearchSort = (query: string) => query.length > 0;

/** What the Search screen shows below the search field. */
export type SearchView = "discover" | "examples" | "results";

/**
 * One search, no tabs: before anything is typed the screen is for browsing,
 * Seerr's Discover rows where Seerr is set up and a few example searches
 * otherwise. The first word turns it into the results: the library's, then
 * what Seerr could add.
 */
export const searchView = (query: string, hasSeerr: boolean): SearchView => {
  if (query.length > 0) return "results";
  return hasSeerr ? "discover" : "examples";
};
