import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  type MissingSeason,
  missingSeasonIcon,
  missingSeasons,
  seasonsHeldInFull,
} from "./missingSeasons";
import { unrequestedSeasons } from "./seasons";
import {
  type MediaInfo,
  type MediaRequest,
  MediaRequestStatus,
  MediaStatus,
  MediaType,
  type TvDetails,
  type User,
} from "./types";

const stamps = { createdAt: "2026-10-16", updatedAt: "2026-10-16" };

const someone: User = {
  id: 108,
  permissions: 0,
  displayName: "Someone",
  ...stamps,
};

const media = (overrides: Partial<MediaInfo> = {}): MediaInfo => ({
  id: 1,
  tmdbId: 1399,
  status: MediaStatus.PARTIALLY_AVAILABLE,
  mediaType: MediaType.TV,
  ...overrides,
});

/** A series with seasons 0 to 3, ten episodes each. */
const show = (
  mediaInfo?: MediaInfo,
  seasonNumbers = [0, 1, 2, 3],
): TvDetails => ({
  id: 1399,
  name: "A series",
  seasons: seasonNumbers.map((seasonNumber) => ({
    id: 100 + seasonNumber,
    seasonNumber,
    episodeCount: 10,
  })),
  contentRatings: {},
  keywords: [],
  spokenLanguages: [],
  mediaInfo,
});

const inLibrary = (seasonNumber: number, status: MediaStatus) => ({
  id: seasonNumber,
  seasonNumber,
  status,
  status4k: MediaStatus.UNKNOWN,
  ...stamps,
});

/** A request whose own status is the status of the seasons it names. */
const requested = (
  status: MediaRequestStatus,
  seasonNumbers: number[],
): MediaRequest => ({
  id: 7,
  status,
  media: media(),
  requestedBy: someone,
  seasons: seasonNumbers.map((seasonNumber, index) => ({
    id: index,
    seasonNumber,
    status,
    ...stamps,
  })),
});

const episode = (
  season: number | undefined,
  overrides: Partial<BaseItemDto> = {},
): BaseItemDto => ({
  Type: "Episode",
  ParentIndexNumber: season,
  LocationType: "FileSystem",
  ...overrides,
});

/** The library holding every one of a season's ten episodes. */
const wholeSeason = (season: number) =>
  Array.from({ length: 10 }, () => episode(season));

const numbers = (seasons: MissingSeason[]) =>
  seasons.map((season) => season.seasonNumber);

describe("missingSeasons", () => {
  test("lists every season of a series Seerr has never seen, to request", () => {
    expect(missingSeasons(show())).toEqual(
      [1, 2, 3].map((seasonNumber) => ({
        seasonNumber,
        episodeCount: 10,
        badge: "not_requested",
        requestable: true,
      })),
    );
  });

  test("leaves out the seasons Seerr reports as available", () => {
    const details = show(
      media({
        seasons: [
          inLibrary(1, MediaStatus.AVAILABLE),
          inLibrary(2, MediaStatus.PARTIALLY_AVAILABLE),
        ],
      }),
    );

    expect(numbers(missingSeasons(details))).toEqual([2, 3]);
  });

  test("lists nothing once every season is available", () => {
    const details = show(
      media({
        status: MediaStatus.AVAILABLE,
        seasons: [1, 2, 3].map((n) => inLibrary(n, MediaStatus.AVAILABLE)),
      }),
    );

    expect(missingSeasons(details)).toEqual([]);
  });

  test("says where each season stands, in the request sheet's words", () => {
    const details = show(
      media({
        seasons: [inLibrary(1, MediaStatus.PARTIALLY_AVAILABLE)],
        requests: [
          requested(MediaRequestStatus.PENDING, [2]),
          requested(MediaRequestStatus.APPROVED, [3]),
        ],
      }),
      [1, 2, 3, 4],
    );

    expect(
      missingSeasons(details).map(({ seasonNumber, badge }) => [
        seasonNumber,
        badge,
      ]),
    ).toEqual([
      [1, "partially_available"],
      [2, "pending"],
      // Approved and on its way, which Seerr calls "Requested".
      [3, "requested"],
      [4, "not_requested"],
    ]);
  });

  // Seerr draws no badge for a failed request, but nothing is on its way
  // either: it read as pending once, as if someone still had to approve it.
  test("tells a season whose request failed, which cannot be asked again", () => {
    const details = show(
      media({ requests: [requested(MediaRequestStatus.FAILED, [2])] }),
    );

    expect(missingSeasons(details).find((s) => s.seasonNumber === 2)).toEqual({
      seasonNumber: 2,
      episodeCount: 10,
      badge: "failed",
      requestable: false,
    });
  });

  test("keeps a season the library holds for approval pending", () => {
    const details = show(
      media({ seasons: [inLibrary(2, MediaStatus.PENDING)] }),
    );

    expect(
      missingSeasons(details).find((s) => s.seasonNumber === 2)?.badge,
    ).toBe("pending");
  });

  // A blocklisted season read as pending: no request is waiting for it, and
  // none can be made.
  test("leaves out a blocklisted season", () => {
    const details = show(
      media({ seasons: [inLibrary(2, MediaStatus.BLOCKLISTED)] }),
    );

    expect(numbers(missingSeasons(details))).toEqual([1, 3]);
  });

  test("offers only the seasons nobody asked for and the library lacks", () => {
    const details = show(
      media({
        seasons: [inLibrary(1, MediaStatus.PARTIALLY_AVAILABLE)],
        requests: [requested(MediaRequestStatus.PENDING, [2])],
      }),
    );

    expect(
      numbers(missingSeasons(details).filter((s) => s.requestable)),
    ).toEqual([3]);
  });

  // What the request sheet offers, partial requests on or off: on a server
  // that only takes whole series it requests these same seasons, all at once.
  test("offers exactly what the request sheet offers", () => {
    const details = show(
      media({
        seasons: [
          inLibrary(1, MediaStatus.PARTIALLY_AVAILABLE),
          inLibrary(2, MediaStatus.PROCESSING),
        ],
      }),
      [1, 2, 3, 4],
    );
    const held = new Set([4]);

    expect(
      numbers(missingSeasons(details, { held }).filter((s) => s.requestable)),
    ).toEqual(unrequestedSeasons(details, { held }));
    expect(unrequestedSeasons(details, { held })).toEqual([3]);
  });

  test("lists the specials only when the server shows them", () => {
    expect(numbers(missingSeasons(show()))).not.toContain(0);
    expect(numbers(missingSeasons(show(), { specials: true }))).toEqual([
      0, 1, 2, 3,
    ]);
  });

  test("leaves out a season without episodes", () => {
    const details = show();
    details.seasons[3] = { ...details.seasons[3], episodeCount: 0 };

    expect(numbers(missingSeasons(details))).toEqual([1, 2]);
  });

  test("orders the seasons by number, whatever order Seerr sends", () => {
    expect(numbers(missingSeasons(show(undefined, [3, 1, 2])))).toEqual([
      1, 2, 3,
    ]);
  });

  // Seerr learns what the library holds on its own scan, which can trail the
  // library: the season on screen must not read as not requested meanwhile.
  test("leaves out a season the library holds, whatever Seerr says", () => {
    const details = show(
      media({ requests: [requested(MediaRequestStatus.APPROVED, [2])] }),
    );

    expect(numbers(missingSeasons(details, { held: new Set([1, 2]) }))).toEqual(
      [3],
    );
  });
});

describe("seasonsHeldInFull", () => {
  test("holds a season once the library has all of Seerr's episodes", () => {
    const details = show();

    expect(seasonsHeldInFull(details, [...wholeSeason(1), episode(2)])).toEqual(
      new Set([1]),
    );
  });

  test("does not count a placeholder the library has no file for", () => {
    const details = show(undefined, [1, 2]);
    const placeholders = [
      episode(1, { LocationType: "Virtual", PremiereDate: "2020-01-01" }),
      episode(2, { LocationType: "Virtual", PremiereDate: "2999-01-01" }),
    ];

    expect(
      seasonsHeldInFull(details, [...wholeSeason(1).slice(1), ...placeholders]),
    ).toEqual(new Set());
  });

  test("leaves out an episode without a season", () => {
    expect(
      seasonsHeldInFull(
        show(),
        Array.from({ length: 10 }, () => episode(undefined)),
      ),
    ).toEqual(new Set());
  });

  test("holds no season without episodes", () => {
    const details = show(undefined, [1]);
    details.seasons[0] = { ...details.seasons[0], episodeCount: 0 };

    expect(seasonsHeldInFull(details, [])).toEqual(new Set());
  });
});

describe("missingSeasonIcon", () => {
  const season = (overrides: Partial<MissingSeason>): MissingSeason => ({
    seasonNumber: 1,
    episodeCount: 10,
    badge: "not_requested",
    requestable: true,
    ...overrides,
  });

  test("draws a + only on a season the user may ask for", () => {
    expect(missingSeasonIcon(season({}), true)?.icon).toBe("plus");
    expect(missingSeasonIcon(season({}), false)).toBeUndefined();
    expect(
      missingSeasonIcon(season({ requestable: false }), true),
    ).toBeUndefined();
  });

  test("draws Seerr's badge for a season it holds", () => {
    expect(missingSeasonIcon(season({ badge: "pending" }), true)?.icon).toBe(
      "bell",
    );
    expect(missingSeasonIcon(season({ badge: "requested" }), true)?.icon).toBe(
      "clock",
    );
    expect(
      missingSeasonIcon(season({ badge: "partially_available" }), true)?.icon,
    ).toBe("minus");
  });

  test("draws nothing for a failed request, as Seerr", () => {
    expect(
      missingSeasonIcon(season({ badge: "failed", requestable: false }), true),
    ).toBeUndefined();
  });
});
