import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, renderHook } from "@testing-library/react-native";
import { Provider } from "jotai";
import type React from "react";
import type { View } from "react-native";
import { tvRequestModalAtom } from "@/utils/atoms/tvRequestModal";
import {
  type TVSeasonSelectModalState,
  tvSeasonSelectModalAtom,
} from "@/utils/atoms/tvSeasonSelectModal";
import { MediaStatus, type TvDetails } from "@/utils/seerr/types";
import { store } from "@/utils/store";
import { useTVSeerrMissingSeasons } from "./TVSeerrMissingSeasons";

// Seerr knows the series, with its first season available. The list, what is
// held and what is offered are worked out for real from there.
const mockDetails = {
  id: 1399,
  name: "A series on Seerr",
  externalIds: {},
  keywords: [],
  seasons: [1, 2, 3].map((seasonNumber) => ({
    id: seasonNumber,
    seasonNumber,
    episodeCount: 2,
  })),
  mediaInfo: {
    id: 1,
    tmdbId: 1399,
    status: MediaStatus.PARTIALLY_AVAILABLE,
    seasons: [{ id: 1, seasonNumber: 1, status: MediaStatus.AVAILABLE }],
    requests: [],
  },
} as unknown as TvDetails;

jest.mock("@/hooks/useSeerrTitle", () => ({
  useSeerrTitle: () => ({ mediaType: "tv", details: mockDetails }),
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
// The button is the focus engine's business; the hook hands focus to refs.
jest.mock("@/components/tv/TVButton", () => ({ TVButton: () => null }));
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ callout: 18 }),
}));
// Opening the sheet is setting its atom: the route itself is not under test.
jest.mock("@/hooks/useTVSeasonSelectModal", () => {
  const { store: mockStore } = jest.requireActual("@/utils/store");
  const { tvSeasonSelectModalAtom: mockAtom } = jest.requireActual(
    "@/utils/atoms/tvSeasonSelectModal",
  );
  return {
    useTVSeasonSelectModal: () => ({
      showSeasonSelectModal: (params: TVSeasonSelectModalState) =>
        mockStore.set(mockAtom, params),
    }),
  };
});

/** A view that records being asked for the focus. */
const focusable = () => {
  const requestTVFocus = jest.fn();
  return { view: { requestTVFocus } as unknown as View, requestTVFocus };
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

const episode = (season: number): BaseItemDto => ({
  Type: "Episode",
  ParentIndexNumber: season,
  LocationType: "FileSystem",
});

const setup = async (
  fallback: View | null,
  // No default: "not known yet" is what one test passes.
  episodes: BaseItemDto[] | undefined,
) => {
  const { result } = await renderHook(
    () =>
      useTVSeerrMissingSeasons(
        { Id: "series", Name: "A series", Type: "Series" },
        episodes,
        fallback,
      ),
    { wrapper },
  );
  return result;
};

const closeSheets = async () => {
  await act(async () => {
    store.set(tvSeasonSelectModalAtom, null);
    store.set(tvRequestModalAtom, null);
  });
};

describe("useTVSeerrMissingSeasons", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(async () => {
    await closeSheets();
    jest.useRealTimers();
  });

  test("opens the season sheet with the series, named as the page names it", async () => {
    const result = await setup(null, [2, 2].map(episode));
    expect(result.current.seasons.map((s) => s.seasonNumber)).toEqual([3]);
    expect(result.current.offersRequest).toBe(true);
    await act(async () => result.current.requestSeasons());

    expect(store.get(tvSeasonSelectModalAtom)).toMatchObject({
      title: "A series",
      mediaId: 1399,
      // The sheet shows the season the library holds as available, so it
      // offers no more than the page lists.
      heldSeasons: new Set([2]),
    });
  });

  // The page passed "no episodes" while they loaded or failed to: every
  // season the library holds was listed, and offered.
  test("lists and offers nothing until the library's episodes are known", async () => {
    const result = await setup(null, undefined);

    expect(result.current.seasons).toEqual([]);
    expect(result.current.offersRequest).toBe(false);
  });

  test("offers nothing once the library holds every season Seerr lacks", async () => {
    const result = await setup(null, [2, 2, 3, 3].map(episode));

    expect(result.current.seasons).toEqual([]);
    expect(result.current.offersRequest).toBe(false);
  });

  // Android TV leaves nothing focused once a sheet's route is gone, and the
  // next Back then left the page.
  test("hands the focus back to its button once the sheet is closed", async () => {
    const button = focusable();
    const result = await setup(null, []);
    result.current.setButtonRef(button.view);

    await act(async () => result.current.requestSeasons());
    await closeSheets();
    expect(button.requestTVFocus).not.toHaveBeenCalled();
    await act(async () => jest.runAllTimers());

    expect(button.requestTVFocus).toHaveBeenCalledTimes(1);
  });

  test("hands it to the fallback once the request left no button", async () => {
    const button = focusable();
    const play = focusable();
    const result = await setup(play.view, []);
    result.current.setButtonRef(button.view);

    await act(async () => result.current.requestSeasons());
    result.current.setButtonRef(null);
    await closeSheets();
    await act(async () => jest.runAllTimers());

    expect(button.requestTVFocus).not.toHaveBeenCalled();
    expect(play.requestTVFocus).toHaveBeenCalledTimes(1);
  });

  test("waits for the advanced sheet that takes the season sheet's place", async () => {
    const button = focusable();
    const result = await setup(null, []);
    result.current.setButtonRef(button.view);

    await act(async () => result.current.requestSeasons());
    await act(async () => {
      store.set(tvRequestModalAtom, {
        requestBody: { mediaId: 1399, mediaType: "tv" } as never,
        title: "A series",
        id: 1399,
        mediaType: "tv" as never,
        onRequested: () => {},
      });
      store.set(tvSeasonSelectModalAtom, null);
    });
    await act(async () => jest.runAllTimers());
    expect(button.requestTVFocus).not.toHaveBeenCalled();

    await closeSheets();
    await act(async () => jest.runAllTimers());
    expect(button.requestTVFocus).toHaveBeenCalledTimes(1);
  });

  test("leaves the focus alone after a sheet it did not open", async () => {
    const button = focusable();
    const result = await setup(null, []);
    result.current.setButtonRef(button.view);

    await act(async () => {
      store.set(tvSeasonSelectModalAtom, {
        series: {} as TvDetails,
        title: "Another series",
        mediaId: 1,
        hasAdvancedRequestPermission: false,
        onRequested: () => {},
      });
    });
    await closeSheets();
    await act(async () => jest.runAllTimers());

    expect(button.requestTVFocus).not.toHaveBeenCalled();
  });
});
