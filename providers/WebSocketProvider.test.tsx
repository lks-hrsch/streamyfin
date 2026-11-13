import { act, render, renderHook } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { Alert, AppState, type AppStateStatus } from "react-native";
import { useWebSocket } from "@/hooks/useWebsockets";
import { useWebSocketContext, WebSocketProvider } from "./WebSocketProvider";

let mockApi: { basePath: string; accessToken: string } | null;
let mockNetwork: { isConnected: boolean; serverConnected: boolean };
const mockCapabilities = jest.fn().mockResolvedValue(undefined);
const mockRetryExhaustion = jest.fn();
const mockQueryClient = { invalidateQueries: jest.fn() };
const mockRouter = { canGoBack: () => true, back: jest.fn(), push: jest.fn() };

jest.mock("jotai", () => ({ useAtomValue: () => mockApi }));
jest.mock("@/providers/JellyfinProvider", () => ({ apiAtom: {} }));
jest.mock("@/providers/NetworkStatusProvider", () => ({
  useNetworkStatus: () => mockNetwork,
}));
jest.mock("@/hooks/useNetworkAwareQueryClient", () => ({
  useNetworkAwareQueryClient: () => mockQueryClient,
}));
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getSessionApi: () => ({ postFullCapabilities: mockCapabilities }),
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => mockRouter,
}));
jest.mock("@/utils/customHeaders", () => ({
  getJellyfinHeaders: () => ({}),
  hasHeaders: () => false,
}));
jest.mock("@/utils/errors", () => ({ describeHttpResponse: () => undefined }));
jest.mock("@/utils/jellyfin/socketFailure", () => ({
  ...jest.requireActual("@/utils/jellyfin/socketFailure"),
  reportSocketFastRetriesExhausted: (...args: unknown[]) =>
    mockRetryExhaustion(...args),
}));

class TestSocket {
  static instances: TestSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  onclose: ((event: { code: number; reason?: string }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  send = jest.fn();
  close = jest.fn(() => {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  });

  constructor(readonly url: string) {
    TestSocket.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  fail() {
    this.readyState = 3;
    // Native platforms commonly emit both for one failed connection.
    this.onerror?.({ message: "connection refused" });
    this.onclose?.({ code: 1006 });
  }
}

const originalWebSocket = globalThis.WebSocket;
const originalAppState = Object.getOwnPropertyDescriptor(
  AppState,
  "currentState",
);
const appStateListeners = new Set<(state: AppStateStatus) => void>();
const latestSocket = () =>
  TestSocket.instances[TestSocket.instances.length - 1];
const wrapper = ({ children }: PropsWithChildren) => (
  <WebSocketProvider>{children}</WebSocketProvider>
);
const advance = (milliseconds: number) =>
  act(async () => {
    jest.advanceTimersByTime(milliseconds);
  });
const failLatest = () => act(async () => latestSocket().fail());
const transition = (state: AppStateStatus) =>
  act(async () => {
    AppState.currentState = state;
    for (const listener of appStateListeners) listener(state);
  });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockApi = {
    basePath: "https://jellyfin.example.com",
    accessToken: "test-token",
  };
  mockNetwork = { isConnected: true, serverConnected: false };
  TestSocket.instances = [];
  appStateListeners.clear();
  globalThis.WebSocket = TestSocket as unknown as typeof WebSocket;
  Object.defineProperty(AppState, "currentState", {
    value: "active",
    writable: true,
    configurable: true,
  });
  jest.spyOn(AppState, "addEventListener").mockImplementation((_, listener) => {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
afterAll(() => {
  globalThis.WebSocket = originalWebSocket;
  if (originalAppState)
    Object.defineProperty(AppState, "currentState", originalAppState);
});

const exhaustFastRetries = async () => {
  for (let i = 0; i < 5; i++) {
    await failLatest();
    await advance(10000);
  }
  await failLatest();
};

test("a twenty-minute outage keeps capped slow retries and recovers without relaunch", async () => {
  const view = await renderHook(useWebSocketContext, { wrapper });
  await exhaustFastRetries();
  expect(TestSocket.instances).toHaveLength(6);
  await advance(59999);
  expect(TestSocket.instances).toHaveLength(6);
  await advance(1);
  for (let i = 1; i < 20; i++) {
    await failLatest();
    await advance(60000);
  }
  expect(TestSocket.instances).toHaveLength(26);
  await act(async () => latestSocket().open());
  expect(view.result.current.isConnected).toBe(true);
  expect(mockRetryExhaustion).not.toHaveBeenCalled();
  // Opening a socket restores the fast window for its next interruption.
  await failLatest();
  await advance(10000);
  expect(TestSocket.instances).toHaveLength(27);
});

test("HTTP Retry recovery cancels a slow deadline and opens immediately with a fresh retry window", async () => {
  const view = await renderHook(useWebSocketContext, { wrapper });
  await exhaustFastRetries();
  const oldSocket = latestSocket();
  mockNetwork = { ...mockNetwork, serverConnected: true };
  await view.rerender(undefined);
  expect(TestSocket.instances).toHaveLength(7);
  // The server can still be finishing startup. Retry quickly after this miss.
  await failLatest();
  await advance(10000);
  expect(TestSocket.instances).toHaveLength(8);
  await act(async () => latestSocket().open());
  await advance(60000);
  expect(TestSocket.instances).toHaveLength(8);
  await act(async () => oldSocket.fail());
  expect(view.result.current.isConnected).toBe(true);
});

test.each([0, 1])(
  "HTTP recovery preserves a healthy socket in state %s",
  async (state) => {
    const view = await renderHook(useWebSocketContext, { wrapper });
    const socket = latestSocket();
    if (state === 1) await act(async () => socket.open());
    mockNetwork = { ...mockNetwork, serverConnected: true };
    await view.rerender(undefined);
    expect(TestSocket.instances).toHaveLength(1);
    expect(socket.close).not.toHaveBeenCalled();
    expect(view.result.current.isConnected).toBe(state === 1);
  },
);

test("logout cancels recovery and stale socket events cannot reconnect old credentials", async () => {
  const view = await renderHook(useWebSocketContext, { wrapper });
  await exhaustFastRetries();
  const oldSocket = latestSocket();
  mockApi = null;
  await view.rerender(undefined);
  mockNetwork = { ...mockNetwork, serverConnected: true };
  await view.rerender(undefined);
  await act(async () => oldSocket.fail());
  await advance(120000);
  expect(TestSocket.instances).toHaveLength(6);
  expect(view.result.current.isConnected).toBe(false);
});

test("provider teardown cancels slow retries and ignores late failures", async () => {
  const view = await renderHook(useWebSocketContext, { wrapper });
  await exhaustFastRetries();
  const oldSocket = latestSocket();
  await view.unmount();
  await act(async () => oldSocket.fail());
  await advance(120000);
  expect(TestSocket.instances).toHaveLength(6);
});

test("background without native playback cancels slow retries until foreground", async () => {
  const view = await renderHook(useWebSocketContext, { wrapper });
  await exhaustFastRetries();
  await transition("background");
  mockNetwork = { ...mockNetwork, serverConnected: true };
  await view.rerender(undefined);
  await advance(120000);
  expect(TestSocket.instances).toHaveLength(6);
  await transition("active");
  expect(TestSocket.instances).toHaveLength(7);
  await act(async () => latestSocket().open());
  expect(view.result.current.isConnected).toBe(true);
});

test("retained native PiP permits slow recovery, and releasing the lease stops it", async () => {
  const view = await renderHook(useWebSocketContext, { wrapper });
  const release = view.result.current.retainInBackground();
  await transition("background");
  await exhaustFastRetries();
  await advance(60000);
  expect(TestSocket.instances).toHaveLength(7);
  await failLatest();
  await act(async () => release());
  await advance(120000);
  expect(TestSocket.instances).toHaveLength(7);
  expect(view.result.current.isConnected).toBe(false);
});

test("a reachable server rejecting upgrades is reported once while slow retries continue", async () => {
  mockNetwork = { ...mockNetwork, serverConnected: true };
  await renderHook(useWebSocketContext, { wrapper });
  await exhaustFastRetries();
  await advance(0);
  expect(mockRetryExhaustion).toHaveBeenCalledTimes(1);
  await advance(60000);
  await failLatest();
  await advance(60000);
  expect(TestSocket.instances).toHaveLength(8);
  expect(mockRetryExhaustion).toHaveBeenCalledTimes(1);
});

const receive = (MessageType: string, Data: unknown = {}) =>
  act(async () => {
    latestSocket().onmessage?.({ data: JSON.stringify({ MessageType, Data }) });
  });

// What the JS player hands its remote control (app/(auth)/player/direct-player.tsx).
const makePlayer = () => ({
  isPlaying: true,
  offline: false,
  togglePlay: jest.fn(),
  stopPlayback: jest.fn(),
  seekPlayback: jest.fn(),
  setVolume: jest.fn(),
  volumeUp: jest.fn(),
  toggleMute: jest.fn(),
});
type Player = ReturnType<typeof makePlayer>;

const Player = ({ player }: { player: Player }) => {
  useWebSocket(player);
  return null;
};

// Every message used to land in a context state slot, so each one re-rendered
// every consumer of the context: SyncPlay, the native and the music player
// among them. The server answers the KeepAlive this client sends every 30
// seconds, and reports user data and library changes on top of that.
test.each([
  ["KeepAlive", ""],
  ["LibraryChanged", { ItemsAdded: [] }],
  ["UserDataChanged", { UserDataList: [] }],
  ["GeneralCommand", { Name: "DisplayMessage", Arguments: {} }],
  ["Playstate", { Command: "Pause" }],
])(
  "a %s message does not re-render the context's consumers",
  async (type, data) => {
    let renders = 0;
    await renderHook(
      () => {
        renders += 1;
        return useWebSocketContext();
      },
      { wrapper },
    );
    await act(async () => latestSocket().open());
    const rendersBefore = renders;
    await receive(type, data);
    await receive(type, data);
    expect(renders).toBe(rendersBefore);
  },
);

describe("remote control of the JS player", () => {
  test.each<[string, string, unknown, (player: Player) => void]>([
    [
      "GeneralCommand Pause pauses a playing video",
      "GeneralCommand",
      { Name: "Pause" },
      (player) => expect(player.togglePlay).toHaveBeenCalledTimes(1),
    ],
    [
      "Playstate Seek seeks to the flat payload's position",
      "Playstate",
      { Command: "Seek", SeekPositionTicks: 420000000 },
      (player) => expect(player.seekPlayback).toHaveBeenCalledWith(420000000),
    ],
    [
      "Playstate Stop stops and leaves the player",
      "Playstate",
      { Command: "Stop" },
      (player) => {
        expect(player.stopPlayback).toHaveBeenCalledTimes(1);
        expect(mockRouter.back).toHaveBeenCalledTimes(1);
      },
    ],
    [
      "GeneralCommand SetVolume sets the volume",
      "GeneralCommand",
      { Name: "SetVolume", Arguments: { Volume: "35" } },
      (player) => expect(player.setVolume).toHaveBeenCalledWith(35),
    ],
    [
      "GeneralCommand ToggleMute mutes",
      "GeneralCommand",
      { Name: "ToggleMute" },
      (player) => expect(player.toggleMute).toHaveBeenCalledTimes(1),
    ],
    [
      "GeneralCommand GoHome opens Home",
      "GeneralCommand",
      { Name: "GoHome" },
      () => expect(mockRouter.push).toHaveBeenCalledWith("/"),
    ],
    [
      "GeneralCommand DisplayMessage shows the message",
      "GeneralCommand",
      {
        Name: "DisplayMessage",
        Arguments: { Header: "Maintenance", Text: "Back in five minutes" },
      },
      () =>
        expect(Alert.alert).toHaveBeenCalledWith(
          expect.any(String),
          "Back in five minutes",
        ),
    ],
  ])("%s", async (_, type, data, check) => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const player = makePlayer();
    await render(
      <WebSocketProvider>
        <Player player={player} />
      </WebSocketProvider>,
    );
    await act(async () => latestSocket().open());
    await receive(type, data);
    check(player);
  });

  // The context kept the last message until the next one replaced it, and the
  // player ran it when it mounted: a Stop sent while the user was browsing
  // closed the next video they opened.
  test("a command that arrived before the player opened is not run when it opens", async () => {
    const player = makePlayer();
    const view = await render(<WebSocketProvider>{null}</WebSocketProvider>);
    await act(async () => latestSocket().open());
    await receive("Playstate", { Command: "Stop" });
    await view.rerender(
      <WebSocketProvider>
        <Player player={player} />
      </WebSocketProvider>,
    );
    expect(player.stopPlayback).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  // One state slot kept only the newest of the messages that arrived in the
  // same tick, so a remote pressing Volume Up twice raised it once.
  test("two commands arriving together are both carried out", async () => {
    const player = makePlayer();
    await render(
      <WebSocketProvider>
        <Player player={player} />
      </WebSocketProvider>,
    );
    await act(async () => latestSocket().open());
    await act(async () => {
      for (let i = 0; i < 2; i++) {
        latestSocket().onmessage?.({
          data: JSON.stringify({
            MessageType: "GeneralCommand",
            Data: { Name: "VolumeUp" },
          }),
        });
      }
    });
    expect(player.volumeUp).toHaveBeenCalledTimes(2);
  });
});
