import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { sortLibraryResults } from "@/components/search/searchSort";

const item = (
  name: string,
  fields: Partial<BaseItemDto> = {},
): BaseItemDto => ({
  Name: name,
  ...fields,
});
const names = (items?: BaseItemDto[]) => items?.map((i) => i.Name);

describe("sortLibraryResults", () => {
  const items = [
    item("Big Buck Bunny", {
      CommunityRating: 6.5,
      ProductionYear: 2008,
      DateCreated: "2026-10-06T10:00:00Z",
    }),
    item("sintel", {
      CommunityRating: 7.2,
      ProductionYear: 2010,
      DateCreated: "2026-10-01T10:00:00Z",
    }),
    item("Elephants Dream", { ProductionYear: 2006 }),
  ];

  // Relevance is the order the server answered with.
  test("keeps the server's order for relevance", () => {
    expect(names(sortLibraryResults(items, "Relevance", "asc"))).toEqual([
      "Big Buck Bunny",
      "sintel",
      "Elephants Dream",
    ]);
  });

  test("sorts by name, whatever the case", () => {
    expect(names(sortLibraryResults(items, "Name", "asc"))).toEqual([
      "Big Buck Bunny",
      "Elephants Dream",
      "sintel",
    ]);
    expect(names(sortLibraryResults(items, "Name", "desc"))).toEqual([
      "sintel",
      "Elephants Dream",
      "Big Buck Bunny",
    ]);
  });

  test("sorts by year", () => {
    expect(names(sortLibraryResults(items, "ProductionYear", "desc"))).toEqual([
      "sintel",
      "Big Buck Bunny",
      "Elephants Dream",
    ]);
  });

  test("sorts by date added", () => {
    expect(names(sortLibraryResults(items, "DateCreated", "desc"))).toEqual([
      "Big Buck Bunny",
      "sintel",
      "Elephants Dream",
    ]);
  });

  // A title without a rating says nothing about where it ranks: it goes
  // after the rated ones in either order.
  test("puts what has no value last, in both orders", () => {
    expect(names(sortLibraryResults(items, "CommunityRating", "asc"))).toEqual([
      "Big Buck Bunny",
      "sintel",
      "Elephants Dream",
    ]);
    expect(names(sortLibraryResults(items, "CommunityRating", "desc"))).toEqual(
      ["sintel", "Big Buck Bunny", "Elephants Dream"],
    );
  });

  test("leaves the results it was given alone", () => {
    const before = names(items);
    sortLibraryResults(items, "Name", "desc");
    expect(names(items)).toEqual(before);
  });
});
