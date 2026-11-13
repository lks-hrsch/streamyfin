import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import { Profiler } from "react";
import { View } from "react-native";
import {
  MusicPlayerProvider,
  useMusicPlayer,
} from "@/providers/MusicPlayerProvider";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { clearMmkv } from "@/test-utils/mmkv";
import { MusicTrackItem } from "./MusicTrackItem";

jest.mock(
  "react-native-track-player",
  () => jest.requireActual("@/test-utils/trackPlayer").trackPlayerModule,
  { virtual: true },
);
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock(
  "@/components/common/ServerImage",
  () => jest.requireActual("@/test-utils/serverImage").serverImageModule,
);
// Its bars animate on the UI thread, which Jest does not have. What the row
// decides is whether it is there.
jest.mock("@/components/music/AnimatedEqualizer", () => {
  const { View: MockView } = jest.requireActual("react-native");
  return { AnimatedEqualizer: () => <MockView testID='now playing' /> };
});
jest.mock(
  "@/providers/NetworkStatusProvider",
  () => jest.requireActual("@/test-utils/appProviders").networkStatusModule,
);
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  const { makeApi: make } = jest.requireActual("@/test-utils/jellyfinApi");
  const mockApi = make();
  return {
    apiAtom: atom(mockApi),
    userAtom: atom({ Id: "user", ServerId: "server" }),
    mockApi,
  };
});
jest.mock("@/providers/AudioStorage", () => ({
  initAudioStorage: async () => undefined,
  setMaxCacheSizeMB: () => undefined,
  getLocalPath: () => null,
  isDownloading: () => false,
  downloadTrack: async () => undefined,
  isPermanentDownloading: () => false,
  isPermanentlyDownloaded: () => false,
  isCached: () => false,
  audioStorageEvents: { on: () => {}, off: () => {} },
}));
jest.mock("@/providers/WebSocketProvider", () => ({
  useWebSocketContext: () => ({ subscribe: () => () => {} }),
}));

/** Stream URL requests the spec keeps pending, by item id. */
const mockHeldStreams = new Map<string, Array<() => void>>();

jest.mock("@/utils/jellyfin/audio/getAudioStreamUrl", () => ({
  getAudioStreamUrl: async (_api: unknown, _userId: string, itemId: string) => {
    const held = mockHeldStreams.get(itemId);
    if (held) await new Promise<void>((release) => held.push(release));
    return {
      url: `https://jellyfin.example.com/Audio/${itemId}/stream`,
      sessionId: `session-${itemId}`,
      mediaSource: null,
      isTranscoding: false,
    };
  },
}));
// The real module pulls in the bottom sheet and Reanimated. The rows read the
// haptics setting, the player its audio settings: the defaults stand for both.
jest.mock("@/utils/atoms/settings", () => ({
  settingsAtom: jest.requireActual("jotai").atom({}),
  useSettings: () => ({ settings: {} }),
}));
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));
jest.mock("@/utils/customHeaders", () => ({
  getJellyfinHeadersForUrl: () => undefined,
}));

const api: ReturnType<typeof makeApi> = jest.requireMock(
  "@/providers/JellyfinProvider",
).mockApi;

const STOPPED_URL = "https://jellyfin.example.com/Sessions/Playing/Stopped";

const TRACKS: BaseItemDto[] = ["t0", "t1", "t2", "t3", "t4"].map((id) => ({
  Id: id,
  Name: `Track ${id}`,
  ServerId: "server",
  AlbumId: "album",
}));

/** How many times each row rendered since the last `resetRenders()`. */
const renders = new Map<string, number>();
const resetRenders = () => renders.clear();
const countRender = (id: string) => renders.set(id, (renders.get(id) ?? 0) + 1);

type Player = ReturnType<typeof useMusicPlayer>;
let player: Player;

/**
 * What the playback engine does with the player: it writes the position and
 * the play state it polls from the native side.
 */
const Engine = () => {
  player = useMusicPlayer();
  return null;
};

const mount = async () => {
  await render(
    <MusicPlayerProvider>
      <Engine />
      {TRACKS.map((track) => (
        <Profiler key={track.Id} id={track.Id!} onRender={countRender}>
          <View testID={`row ${track.Id}`}>
            <MusicTrackItem track={track} />
          </View>
        </Profiler>
      ))}
    </MusicPlayerProvider>,
  );
  await settle();
};

/** Lets the promise chains started by the last action run out. */
const settle = async () => {
  for (let i = 0; i < 20; i++) {
    await act(async () => {});
  }
};

const row = (id: string) => within(screen.getByTestId(`row ${id}`));

const tap = async (id: string) => {
  await fireEvent.press(row(id).getByText(`Track ${id}`));
  await settle();
};

/** Plays on for `seconds`, one progress update a second like the engine. */
const playFor = async (seconds: number) => {
  const start = player.progress;
  for (let second = 1; second <= seconds; second++) {
    await act(async () => player.setProgress(start + second));
  }
};

/** The spinner over the row's artwork while its track loads. */
const isLoading = (id: string) =>
  screen
    .getByTestId(`row ${id}`)
    .queryAll((node) => node.type === "ActivityIndicator").length > 0;

const isMarkedPlaying = (id: string) =>
  row(id).queryByTestId("now playing") !== null;

const reports = (url: string) =>
  api.mock.history.post
    .filter((request) => request.url === url)
    .map((request) => JSON.parse(request.data));

beforeEach(() => {
  clearMmkv();
  mockHeldStreams.clear();
  resetRenders();
  api.mock.reset();
  api.mock.onPost().reply(204);
});

describe("MusicTrackItem in a track list", () => {
  // Every progress update, once a second while a track plays, re-rendered
  // every visible row: the rows read the whole player, the position with it.
  test("a progress update re-renders no row", async () => {
    await mount();
    await tap("t1");
    expect(isMarkedPlaying("t1")).toBe(true);

    resetRenders();
    await playFor(5);

    expect(Object.fromEntries(renders)).toEqual({});
    expect(isMarkedPlaying("t1")).toBe(true);
  });

  test("tapping a row shows its spinner, then marks it as the one playing", async () => {
    await mount();
    await tap("t1");
    await playFor(3);

    mockHeldStreams.set("t3", []);
    await tap("t3");

    expect(isLoading("t3")).toBe(true);
    expect(isLoading("t1")).toBe(false);

    for (const release of mockHeldStreams.get("t3") ?? []) release();
    mockHeldStreams.clear();
    await settle();

    expect(isLoading("t3")).toBe(false);
    expect(isMarkedPlaying("t3")).toBe(true);
    expect(isMarkedPlaying("t1")).toBe(false);
  });

  test("pausing and resuming update the row of the track playing", async () => {
    await mount();
    await tap("t2");
    await playFor(3);

    await act(async () => player.setIsPlaying(false));
    expect(isMarkedPlaying("t2")).toBe(false);

    await act(async () => player.setIsPlaying(true));
    expect(isMarkedPlaying("t2")).toBe(true);
  });

  // The row that starts the next track rendered before the current one
  // played on, and keeps the playTrack it got then.
  test("a tap after the track played on reports where it was stopped", async () => {
    await mount();
    await tap("t0");
    await playFor(30);

    await tap("t4");

    await waitFor(() =>
      expect(reports(STOPPED_URL)).toEqual([
        expect.objectContaining({
          ItemId: "t0",
          PositionTicks: 30 * 10_000_000,
        }),
      ]),
    );
    expect(isMarkedPlaying("t4")).toBe(true);
  });
});
