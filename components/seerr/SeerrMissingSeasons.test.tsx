import { fireEvent, render, screen } from "@testing-library/react-native";
import type { MissingSeason } from "@/utils/seerr/missingSeasons";
import { MediaType, type TvDetails } from "@/utils/seerr/types";
import { SeerrMissingSeasons } from "./SeerrMissingSeasons";

const mockMissing: {
  details?: TvDetails;
  held?: ReadonlySet<number>;
  seasons: MissingSeason[];
  offersRequest: boolean;
} = { seasons: [], offersRequest: false };
const mockPresent = jest.fn();
const mockSheetProps: { current?: Record<string, unknown> } = {};

jest.mock("@/hooks/useSeerrMissingSeasons", () => ({
  useSeerrMissingSeasons: () => ({
    ...mockMissing,
    hasAdvancedRequestPermission: false,
  }),
}));
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { season_number?: number }) =>
      options?.season_number === undefined
        ? key
        : `${key}:${options.season_number}`,
  }),
}));
// The sheet is the Seerr page's own and not under test: what it is opened
// with is.
jest.mock("@/components/seerr/RequestModal", () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual("react");
  return {
    __esModule: true,
    default: forwardRef((props: Record<string, unknown>, ref: unknown) => {
      mockSheetProps.current = props;
      useImperativeHandle(ref, () => ({
        present: mockPresent,
        close: () => {},
      }));
      return null;
    }),
  };
});

const details = {
  id: 1399,
  name: "A series on Seerr",
  externalIds: { tvdbId: 121361 },
  keywords: [],
} as unknown as TvDetails;

const season = (
  seasonNumber: number,
  overrides: Partial<MissingSeason> = {},
): MissingSeason => ({
  seasonNumber,
  episodeCount: 10,
  badge: "not_requested",
  requestable: true,
  ...overrides,
});

const show = () =>
  render(
    <SeerrMissingSeasons
      item={{ Id: "series", Name: "A series" }}
      episodes={[]}
    />,
  );

beforeEach(() => {
  mockMissing.details = details;
  mockMissing.held = new Set([1, 2]);
  mockMissing.seasons = [
    season(3, { badge: "requested", requestable: false }),
    season(4),
    season(5, { badge: "failed", requestable: false }),
  ];
  mockMissing.offersRequest = true;
  mockPresent.mockClear();
  mockSheetProps.current = undefined;
});

describe("SeerrMissingSeasons", () => {
  test("shows nothing when Seerr has nothing to tell about the series", async () => {
    mockMissing.details = undefined;
    mockMissing.seasons = [];
    await show();

    expect(screen.queryByText("seerr.series_page.missing_seasons")).toBeNull();
    expect(mockSheetProps.current).toBeUndefined();
  });

  test("lists each missing season with where it stands", async () => {
    await show();

    expect(screen.getByText("seerr.season_number:3")).toBeTruthy();
    expect(screen.getByText("seerr.season_badge.requested")).toBeTruthy();
    expect(screen.getByText("seerr.season_number:4")).toBeTruthy();
    expect(screen.getByText("seerr.season_badge.not_requested")).toBeTruthy();
    // Not pending: nothing waits for approval, and nothing is on its way.
    expect(screen.getByText("seerr.season_number:5")).toBeTruthy();
    expect(screen.getByText("seerr.request_status.failed")).toBeTruthy();
    expect(screen.queryByText("seerr.season_badge.pending")).toBeNull();
  });

  test("opens Seerr's season table with nothing chosen yet", async () => {
    await show();
    await fireEvent.press(
      screen.getByText("seerr.series_page.request_seasons"),
    );

    expect(mockPresent).toHaveBeenCalled();
    expect(mockSheetProps.current).toMatchObject({
      id: 1399,
      type: MediaType.TV,
      details,
      // The sheet offers no season the library holds, as the list does not.
      heldSeasons: new Set([1, 2]),
      // The name the page shows, not Seerr's.
      title: "A series",
      requestBody: {
        mediaId: 1399,
        mediaType: MediaType.TV,
        tvdbId: 121361,
        seasons: [],
      },
    });
  });

  test("offers no request to someone who may not make one", async () => {
    mockMissing.offersRequest = false;
    await show();

    expect(screen.getByText("seerr.season_number:4")).toBeTruthy();
    expect(screen.queryByText("seerr.series_page.request_seasons")).toBeNull();
  });
});
