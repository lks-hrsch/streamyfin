import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { renderHook } from "@testing-library/react-native";
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
  type TvDetails,
} from "@/utils/seerr/types";
import { useSeerrMissingSeasons } from "./useSeerrMissingSeasons";

const mockTitle: { mediaType?: MediaType; details?: TvDetails } = {};

jest.mock("@/hooks/useSeerrTitle", () => ({
  useSeerrTitle: () => mockTitle,
}));
jest.mock("@/hooks/useSeerr", () => {
  const { Permission } = jest.requireActual("@/utils/seerr/permissions");
  return {
    useSeerr: () => ({
      seerrUser: { id: 1, permissions: Permission.REQUEST },
    }),
  };
});
jest.mock("@/hooks/useSeerrPublicSettings", () => ({
  useSeerrPublicSettings: () => undefined,
}));

// Seerr knows the series with its first season available and the second not.
const details = {
  id: 1399,
  name: "A series",
  seasons: [1, 2].map((seasonNumber) => ({
    id: seasonNumber,
    seasonNumber,
    episodeCount: 2,
  })),
  keywords: [],
  mediaInfo: {
    id: 1,
    tmdbId: 1399,
    mediaType: MediaType.TV,
    status: MediaStatus.PARTIALLY_AVAILABLE,
    seasons: [
      {
        id: 1,
        seasonNumber: 1,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.UNKNOWN,
      },
    ],
    requests: [],
  },
} as unknown as TvDetails;

const series: BaseItemDto = { Id: "series", Type: "Series" };
const episode = (season: number): BaseItemDto => ({
  Type: "Episode",
  ParentIndexNumber: season,
  LocationType: "FileSystem",
});

const missing = async (episodes: BaseItemDto[] | undefined) =>
  (await renderHook(() => useSeerrMissingSeasons(series, episodes))).result
    .current;

beforeEach(() => {
  mockTitle.mediaType = MediaType.TV;
  mockTitle.details = details;
});

describe("useSeerrMissingSeasons", () => {
  test("lists what Seerr lacks and offers to request more", async () => {
    const result = await missing([episode(1), episode(1)]);

    expect(result.details).toBe(details);
    expect(result.seasons.map((s) => s.seasonNumber)).toEqual([2]);
    expect(result.offersRequest).toBe(true);
  });

  // The library's episodes decide which seasons are held: listed before they
  // are known, a season held in full would show and then go.
  test("lists nothing before the library's episodes are known", async () => {
    const result = await missing(undefined);

    expect(result.details).toBeUndefined();
    expect(result.seasons).toEqual([]);
  });

  test("shows nothing once the library holds every season", async () => {
    const result = await missing([1, 1, 2, 2].map(episode));

    expect(result.details).toBeUndefined();
    expect(result.seasons).toEqual([]);
  });

  // Seerr's own rule offered season 3, which only the library knows it holds:
  // the button would have opened a sheet offering it.
  test("offers no request when only a season the library holds is left", async () => {
    mockTitle.details = {
      ...details,
      seasons: [1, 2, 3].map((seasonNumber) => ({
        id: seasonNumber,
        seasonNumber,
        episodeCount: 2,
      })),
      mediaInfo: {
        ...details.mediaInfo,
        requests: [
          {
            id: 7,
            status: MediaRequestStatus.PENDING,
            is4k: false,
            seasons: [
              { id: 1, seasonNumber: 2, status: MediaRequestStatus.PENDING },
            ],
          },
        ],
      },
    } as unknown as TvDetails;
    const result = await missing([3, 3].map(episode));

    expect(result.seasons.map((s) => [s.seasonNumber, s.badge])).toEqual([
      [2, "pending"],
    ]);
    expect(result.held).toEqual(new Set([3]));
    expect(result.offersRequest).toBe(false);
  });

  test("shows nothing when Seerr has no details for the series", async () => {
    mockTitle.mediaType = undefined;
    mockTitle.details = undefined;
    const result = await missing([]);

    expect(result.details).toBeUndefined();
    expect(result.offersRequest).toBe(false);
  });
});
