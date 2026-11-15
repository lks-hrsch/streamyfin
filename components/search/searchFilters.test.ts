import { searchView, showSearchSort } from "@/components/search/searchFilters";

describe("showSearchSort", () => {
  // The sort is for what the search found, so it comes with the first word.
  test("shows the sort once something is typed", () => {
    expect(showSearchSort("dune")).toBe(true);
  });

  test("hides it until something is typed", () => {
    expect(showSearchSort("")).toBe(false);
  });
});

describe("searchView", () => {
  // The screen used to open on a Library tab holding example searches, with
  // Discover's rows behind a Discover tab, and kept "Library" on the tab
  // while it also listed what Seerr could add.
  test("opens on Discover's rows while nothing is typed, with Seerr set up", () => {
    expect(searchView("", true)).toBe("discover");
  });

  test("offers example searches while nothing is typed, without Seerr", () => {
    expect(searchView("", false)).toBe("examples");
  });

  test("shows what the search found once something is typed", () => {
    expect(searchView("dune", true)).toBe("results");
    expect(searchView("dune", false)).toBe("results");
  });
});
