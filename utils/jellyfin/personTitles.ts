import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  ItemFields,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import {
  PERSON_EPISODES_LIMIT,
  PERSON_TITLES_LIMIT,
} from "@/constants/Persons";

/** What a filmography card and its Seerr match read off a title. */
const TITLE_FIELDS: ItemFields[] = ["ProviderIds", "PrimaryImageAspectRatio"];

/** The later value first, and a missing one last, as the server sorts. */
const laterFirst = <T extends string | number>(
  a: T | null | undefined,
  b: T | null | undefined,
): number => {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  return a < b ? 1 : a > b ? -1 : 0;
};

/**
 * When a title came out, as Jellyfin sorts by premiere date: the date, else
 * the start of its year.
 */
const releaseOf = (item: BaseItemDto): string | undefined =>
  item.PremiereDate ??
  (item.ProductionYear
    ? `${String(item.ProductionYear).padStart(4, "0")}-01-01T00:00:00.0000000Z`
    : undefined);

/** The order the server lists a person's titles in: the newest first. */
const newestFirst = (a: BaseItemDto, b: BaseItemDto): number =>
  laterFirst(releaseOf(a), releaseOf(b)) ||
  laterFirst(a.ProductionYear, b.ProductionYear) ||
  (a.SortName ?? a.Name ?? "").localeCompare(b.SortName ?? b.Name ?? "");

/**
 * `extra` filed into `sorted`, which is in the server's order, each before the
 * first title it is newer than. `sorted` keeps its order as it is: only where
 * the extra titles go is decided here, so a title the server places its own
 * way (one without a date) is never moved.
 */
export const fileByRelease = (
  sorted: BaseItemDto[],
  extra: BaseItemDto[],
): BaseItemDto[] => {
  const pending = [...extra].sort(newestFirst);
  const filed: BaseItemDto[] = [];
  for (const title of sorted) {
    while (pending.length > 0 && newestFirst(pending[0], title) < 0) {
      filed.push(pending.shift()!);
    }
    filed.push(title);
  }
  return [...filed, ...pending];
};

/** The series of `episodes` that `titles` does not already hold, each once. */
export const seriesMissingFrom = (
  titles: BaseItemDto[],
  episodes: BaseItemDto[],
): string[] => {
  const held = new Set(titles.map((title) => title.Id));
  return [
    ...new Set(
      episodes.flatMap((episode) =>
        episode.SeriesId && !held.has(episode.SeriesId)
          ? [episode.SeriesId]
          : [],
      ),
    ),
  ];
};

/**
 * A person's films and series in the library, newest first, the series they
 * are in only through its episodes included: Jellyfin's TMDB provider lists a
 * season's cast on its episodes, and only some of them on the series, so a
 * season's lead is often not among the series' people at all.
 */
export const getPersonTitles = async ({
  api,
  userId,
  personId,
  signal,
}: {
  api: Api;
  userId: string | undefined;
  personId: string;
  signal?: AbortSignal;
}): Promise<BaseItemDto[]> => {
  const library = getLibraryApi(api);
  const [titles, episodes] = await Promise.all([
    library.getItems(
      {
        userId,
        personIds: [personId],
        includeItemTypes: ["Movie", "Series"],
        recursive: true,
        sortBy: ["PremiereDate", "ProductionYear", "SortName"],
        sortOrder: ["Descending", "Descending", "Ascending"],
        fields: TITLE_FIELDS,
        collapseBoxSetItems: false,
        limit: PERSON_TITLES_LIMIT,
      },
      { signal },
    ),
    // Only the SeriesId of each is read, which an episode carries unasked.
    library.getItems(
      {
        userId,
        personIds: [personId],
        includeItemTypes: ["Episode"],
        recursive: true,
        enableImages: false,
        enableUserData: false,
        limit: PERSON_EPISODES_LIMIT,
      },
      { signal },
    ),
  ]);

  const own = titles.data.Items ?? [];
  const seriesIds = seriesMissingFrom(own, episodes.data.Items ?? []);
  if (seriesIds.length === 0) return own;

  const series = await library.getItems(
    { userId, ids: seriesIds, fields: TITLE_FIELDS },
    { signal },
  );
  return fileByRelease(own, series.data.Items ?? []);
};
