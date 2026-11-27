import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/** Which way a sort runs. */
export type SortOrder = "asc" | "desc";

/** The sorts the search offers. Relevance is the server's order. */
export const LIBRARY_SORTS = [
  "Relevance",
  "Name",
  "CommunityRating",
  "ProductionYear",
  "DateCreated",
] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

const libraryValue: Record<
  Exclude<LibrarySort, "Relevance">,
  (item: BaseItemDto) => string | number | undefined
> = {
  Name: (item) => (item.SortName ?? item.Name ?? undefined)?.toLowerCase(),
  CommunityRating: (item) => item.CommunityRating ?? undefined,
  ProductionYear: (item) => item.ProductionYear ?? undefined,
  DateCreated: (item) =>
    item.DateCreated ? Date.parse(item.DateCreated) : undefined,
};

/**
 * Orders the Library search's results in the app, so the same ten most
 * relevant results come back whatever the search engine, only in another
 * order. What has no value for the sort goes last, in either order.
 */
export const sortLibraryResults = (
  items: BaseItemDto[] | undefined,
  sort: LibrarySort,
  order: SortOrder,
): BaseItemDto[] | undefined => {
  if (!items || sort === "Relevance") return items;
  const value = libraryValue[sort];
  const direction = order === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === undefined) return y === undefined ? 0 : 1;
    if (y === undefined) return -1;
    if (typeof x === "string" && typeof y === "string") {
      return x.localeCompare(y) * direction;
    }
    return ((x as number) - (y as number)) * direction;
  });
};
