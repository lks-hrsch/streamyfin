import type {
  BaseItemDto,
  MediaSourceInfo,
  UserItemDataDto,
} from "@jellyfin/sdk/lib/generated-client";
import { renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";
import { usePlayEpisodeNow, useSeriesPlayback } from "./useSeriesPlayback";

// The player is the boundary: what reaches it is the request this asserts.
const mockPlayMedia = jest.fn();
jest.mock("@/hooks/usePlayMedia", () => ({
  usePlayMedia: () => mockPlayMedia,
}));
jest.mock(
  "@/providers/JellyfinProvider",
  () =>
    jest.requireActual("@/test-utils/jellyfinProvider").jellyfinProviderModule,
);
let mockOffline = false;
const mockDownloads: Record<string, { userData: object }> = {};
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockOffline,
}));
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({
    getDownloadedItemById: (id: string) => mockDownloads[id],
  }),
}));
let mockShowResumeDialog = true;
jest.mock("@/utils/atoms/settings", () => {
  const { makeSettingsModule } = jest.requireActual("@/test-utils/settings");
  const module = makeSettingsModule();
  return {
    ...module,
    useSettings: () => ({
      ...module.useSettings(),
      settings: {
        ...module.useSettings().settings,
        showResumeDialog: mockShowResumeDialog,
      },
    }),
  };
});

const source = {
  Id: "source-1",
  DefaultAudioStreamIndex: 1,
  MediaStreams: [{ Index: 1, Type: "Audio", Language: "eng" }],
} as MediaSourceInfo;
const episode = (
  id: string,
  index: number,
  userData: Partial<UserItemDataDto> = {},
  extra: Partial<BaseItemDto> = {},
): BaseItemDto => ({
  Id: id,
  Type: "Episode",
  Name: `Episode ${index}`,
  ParentIndexNumber: 1,
  IndexNumber: index,
  MediaSources: [source],
  UserData: userData as UserItemDataDto,
  ...extra,
});

beforeEach(() => {
  mockShowResumeDialog = true;
  mockOffline = false;
  for (const id of Object.keys(mockDownloads)) delete mockDownloads[id];
  mockPlayMedia.mockReset().mockResolvedValue(undefined);
});

describe("useSeriesPlayback", () => {
  it("starts the next unplayed episode, with the episode's default tracks", async () => {
    const episodes = [
      episode("e1", 1, { Played: true }),
      episode("e2", 2),
      episode("e3", 3),
    ];
    const { result } = await renderHook(() => useSeriesPlayback(episodes));

    expect(result.current.target?.Id).toBe("e2");
    expect(result.current.selectedOptions).toEqual(
      expect.objectContaining({
        mediaSource: expect.objectContaining({ Id: "source-1" }),
        audioIndex: 1,
      }),
    );
  });

  it("skips the placeholders of episodes the library does not have", async () => {
    // A missing episode Jellyfin lists has nothing to play: Play would open
    // a player on a 400.
    const episodes = [
      episode("e1", 1, {}, { LocationType: "Virtual" }),
      episode("e2", 2),
    ];
    const { result } = await renderHook(() => useSeriesPlayback(episodes));

    expect(result.current.target?.Id).toBe("e2");
  });

  it("offline, plays a download with the tracks it was pulled with", async () => {
    // The file holds those tracks only: the server's default index can name
    // a stream it lacks.
    mockOffline = true;
    mockDownloads.e2 = {
      userData: { audioStreamIndex: 3, subtitleStreamIndex: 5 },
    };
    const { result } = await renderHook(() =>
      useSeriesPlayback([episode("e2", 2)]),
    );

    expect(result.current.selectedOptions).toEqual(
      expect.objectContaining({ audioIndex: 3, subtitleIndex: 5 }),
    );
  });

  it("has nothing to start until the episodes are known", async () => {
    const { result } = await renderHook(() => useSeriesPlayback(undefined));

    expect(result.current.target).toBeUndefined();
    expect(result.current.selectedOptions).toBeUndefined();
  });
});

describe("usePlayEpisodeNow", () => {
  it("plays an episode from the start at once, no page in between", async () => {
    const { result } = await renderHook(() => usePlayEpisodeNow());
    result.current(episode("e2", 2));

    expect(mockPlayMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "e2",
        mediaSourceId: "source-1",
        audioIndex: 1,
        playbackPositionTicks: 0,
      }),
      { item: expect.objectContaining({ Id: "e2" }) },
    );
  });

  it("asks resume or restart for an episode in progress, as its page does", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { result } = await renderHook(() => usePlayEpisodeNow());
    result.current(episode("e2", 2, { PlaybackPositionTicks: 6_000_000_000 }));

    expect(mockPlayMedia).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2]!;
    buttons.find((b) => b.isPreferred)?.onPress?.();
    expect(mockPlayMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "e2",
        playbackPositionTicks: 6_000_000_000,
      }),
      expect.anything(),
    );
    alert.mockRestore();
  });

  it("resumes at once when the resume dialog is turned off", async () => {
    mockShowResumeDialog = false;
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { result } = await renderHook(() => usePlayEpisodeNow());
    result.current(episode("e2", 2, { PlaybackPositionTicks: 6_000_000_000 }));

    expect(alert).not.toHaveBeenCalled();
    expect(mockPlayMedia).toHaveBeenCalledWith(
      expect.objectContaining({ playbackPositionTicks: 6_000_000_000 }),
      expect.anything(),
    );
    alert.mockRestore();
  });
});
