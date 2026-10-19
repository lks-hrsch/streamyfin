import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type React from "react";
import { Permission } from "@/utils/seerr/permissions";
import { useLibraryIssue } from "./useLibraryIssue";

const api = { movieDetails: jest.fn(), tvDetails: jest.fn() };
const mockSeerr: {
  seerrApi?: typeof api;
  seerrUser?: { id: number; permissions: number };
} = {};
let mockOffline = false;
const mockGetItems = jest.fn();

jest.mock("@/hooks/useSeerr", () => ({
  Endpoints: {},
  useSeerr: () => mockSeerr,
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockOffline,
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom({}), userAtom: atom({ Id: "u1" }) };
});
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getItemsApi: () => ({ getItems: mockGetItems }),
}));

const movie: BaseItemDto = {
  Id: "m1",
  Type: "Movie",
  Name: "Heat",
  ProviderIds: { Tmdb: "949" },
};
const episode: BaseItemDto = {
  Id: "e1",
  Type: "Episode",
  Name: "Grilled",
  SeriesId: "s1",
  SeriesName: "Breaking Bad",
  ParentIndexNumber: 2,
  IndexNumber: 2,
};
const series: BaseItemDto = {
  Id: "s1",
  Type: "Series",
  Name: "Breaking Bad",
  ProviderIds: { Tmdb: "1396" },
};

const render = (item: BaseItemDto) => {
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useLibraryIssue(item), { wrapper });
};

// What Jellyfin was asked for, undefined when nothing was looked up.
const seriesLookedUp = () => mockGetItems.mock.calls.at(-1)?.[0];

describe("useLibraryIssue", () => {
  beforeEach(() => {
    mockOffline = false;
    api.movieDetails.mockReset().mockResolvedValue({ mediaInfo: { id: 42 } });
    api.tvDetails.mockReset().mockResolvedValue({ mediaInfo: { id: 7 } });
    mockSeerr.seerrApi = api;
    mockSeerr.seerrUser = { id: 1, permissions: Permission.CREATE_ISSUES };
    mockGetItems
      .mockReset()
      .mockResolvedValue({ data: { Items: [series], TotalRecordCount: 1 } });
  });

  test("files a movie's issue against its Seerr record", async () => {
    const { result } = await render(movie);
    await waitFor(() =>
      expect(result.current).toEqual({
        mediaId: 42,
        title: "Heat",
        episode: undefined,
      }),
    );
    expect(api.movieDetails).toHaveBeenCalledWith(949);
    expect(seriesLookedUp()).toBeUndefined();
  });

  // Seerr knows the series, not the episode: its TMDB number is on the
  // series item, which the episode page does not have.
  test("files an episode's issue against its series", async () => {
    const { result } = await render(episode);
    await waitFor(() =>
      expect(result.current).toEqual({
        mediaId: 7,
        title: "Breaking Bad",
        episode: { season: 2, episode: 2, name: "Grilled" },
      }),
    );
    // The provider ids alone, the one thing read off the series.
    expect(seriesLookedUp()).toEqual({
      ids: ["s1"],
      userId: "u1",
      fields: ["ProviderIds"],
    });
    expect(api.tvDetails).toHaveBeenCalledWith(1396);
  });

  test("offers nothing for a title Seerr has no record of", async () => {
    api.movieDetails.mockResolvedValue({});
    const { result } = await render(movie);
    await waitFor(() => expect(api.movieDetails).toHaveBeenCalled());
    // The answer has to be in before its absence means anything.
    await act(async () => {});
    expect(result.current).toBeUndefined();
  });

  // Each case asks nobody anything: no series from Jellyfin, nothing from
  // Seerr, for a button that would not be shown.
  describe("asks nothing", () => {
    const expectNothingAsked = async (item: BaseItemDto) => {
      const { result } = await render(item);
      // Lets a query that was started settle before looking.
      await act(async () => {});
      expect(result.current).toBeUndefined();
      expect(seriesLookedUp()).toBeUndefined();
      expect(api.movieDetails).not.toHaveBeenCalled();
      expect(api.tvDetails).not.toHaveBeenCalled();
    };

    test("of a user who may not create issues", async () => {
      mockSeerr.seerrUser = {
        id: 1,
        permissions: Permission.REQUEST | Permission.VIEW_ISSUES,
      };
      await expectNothingAsked(movie);
      await expectNothingAsked(episode);
    });

    test("without a Seerr user", async () => {
      mockSeerr.seerrUser = undefined;
      await expectNothingAsked(episode);
    });

    test("when Seerr is not set up", async () => {
      mockSeerr.seerrApi = undefined;
      await expectNothingAsked(movie);
      await expectNothingAsked(episode);
    });

    test("offline, where Seerr cannot be reached", async () => {
      mockOffline = true;
      await expectNothingAsked(movie);
      await expectNothingAsked(episode);
    });

    test("for an item Seerr takes no issue on", async () => {
      await expectNothingAsked({ ...series, Id: "s2" });
      await expectNothingAsked({ Id: "p1", Type: "Program", Name: "News" });
    });
  });
});
