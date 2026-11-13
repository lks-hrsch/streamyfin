import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { fileByRelease, seriesMissingFrom } from "./personTitles";

const title = (Id: string, date?: string, year?: number): BaseItemDto => ({
  Id,
  Name: Id,
  PremiereDate: date && `${date}T00:00:00.0000000Z`,
  ProductionYear: year ?? (date ? Number(date.slice(0, 4)) : undefined),
});
const idsOf = (items: BaseItemDto[]) => items.map((item) => item.Id);

describe("fileByRelease", () => {
  test("files each extra title before the first one it is newer than", () => {
    const sorted = [title("2022", "2022-09-21"), title("2005", "2005-09-21")];
    const extra = [title("2014", "2014-05-15"), title("2024", "2024-01-01")];

    expect(idsOf(fileByRelease(sorted, extra))).toEqual([
      "2024",
      "2022",
      "2014",
      "2005",
    ]);
  });

  test("goes by the year when there is no premiere date", () => {
    const sorted = [title("2022", "2022-09-21"), title("2005", "2005-09-21")];

    expect(
      idsOf(fileByRelease(sorted, [title("year 2011", undefined, 2011)])),
    ).toEqual(["2022", "year 2011", "2005"]);
  });

  // The server sorts on its own fields, so an undated title of its list stays
  // where it put it; only the extra ones are placed here.
  test("never moves a title of the server's list", () => {
    const sorted = [title("undated"), title("2005", "2005-09-21")];

    expect(idsOf(fileByRelease(sorted, [title("2011", "2011-10-05")]))).toEqual(
      ["2011", "undated", "2005"],
    );
  });

  test("puts an extra title without a date or year last", () => {
    const sorted = [title("2005", "2005-09-21")];

    expect(idsOf(fileByRelease(sorted, [title("undated")]))).toEqual([
      "2005",
      "undated",
    ]);
  });
});

describe("seriesMissingFrom", () => {
  test("names each series of the episodes once, but not one already listed", () => {
    const titles = [{ Id: "series-a", Type: "Series" }] as BaseItemDto[];
    const episodes = [
      { Id: "a1", SeriesId: "series-a" },
      { Id: "b1", SeriesId: "series-b" },
      { Id: "b2", SeriesId: "series-b" },
      { Id: "orphan" },
    ] as BaseItemDto[];

    expect(seriesMissingFrom(titles, episodes)).toEqual(["series-b"]);
  });
});
