import { act, renderHook } from "@testing-library/react-native";
import { stubReactNative } from "@/test-utils/reactNative";
import { useWebSocket } from "./useWebsockets";

// The provider's subscribe, holding handlers by message type.
const mockHandlers = new Map<string, Set<(data: unknown) => void>>();
const mockSubscribe = (type: string, handler: (data: unknown) => void) => {
  const handlers = mockHandlers.get(type) ?? new Set();
  mockHandlers.set(type, handlers);
  handlers.add(handler);
  return () => handlers.delete(handler);
};
const receive = (MessageType: string, Data: unknown) =>
  act(async () => {
    for (const handler of mockHandlers.get(MessageType) ?? []) handler(Data);
  });
const mockRouter = { canGoBack: () => true, back: jest.fn(), push: jest.fn() };

jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => mockRouter,
}));
jest.mock("@/providers/WebSocketProvider", () => ({
  useWebSocketContext: () => ({ subscribe: mockSubscribe }),
}));

const props = {
  isPlaying: true,
  togglePlay: jest.fn(),
  stopPlayback: jest.fn(),
  seekPlayback: jest.fn(),
  offline: false,
};

beforeEach(() => {
  mockHandlers.clear();
  stubReactNative({ isTV: false });
});

test.each(["Pause", "Unpause", "Seek", "Stop"])(
  "leaves SyncPlay %s commands to the scheduled coordinator",
  async (Command) => {
    await renderHook(() => useWebSocket(props));
    await receive("SyncPlayCommand", { Command, PositionTicks: 420000000 });
    expect(props.togglePlay).not.toHaveBeenCalled();
    expect(props.seekPlayback).not.toHaveBeenCalled();
    expect(props.stopPlayback).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  },
);

test("ordinary GeneralCommand pause still controls the player", async () => {
  await renderHook(() => useWebSocket(props));
  await receive("GeneralCommand", { Name: "Pause" });
  expect(props.togglePlay).toHaveBeenCalledTimes(1);
});

test("ordinary Playstate seek reads the flat payload", async () => {
  await renderHook(() => useWebSocket(props));
  await receive("Playstate", { Command: "Seek", SeekPositionTicks: 420000000 });
  expect(props.seekPlayback).toHaveBeenCalledWith(420000000);
});

// A command runs when it arrives, so it has to see the player's state then,
// not the one it had when the hook subscribed.
test("Pause and Unpause follow the play state the player rendered last", async () => {
  const view = await renderHook(
    (isPlaying: boolean) => useWebSocket({ ...props, isPlaying }),
    { initialProps: true },
  );
  await view.rerender(false);
  await receive("Playstate", { Command: "Pause" });
  expect(props.togglePlay).not.toHaveBeenCalled();
  await receive("Playstate", { Command: "Unpause" });
  expect(props.togglePlay).toHaveBeenCalledTimes(1);
});

test("commands are ignored while the player is offline", async () => {
  await renderHook(() => useWebSocket({ ...props, offline: true }));
  await receive("Playstate", { Command: "Stop" });
  expect(props.stopPlayback).not.toHaveBeenCalled();
  expect(mockRouter.back).not.toHaveBeenCalled();
});

test("closing the player stops listening", async () => {
  const view = await renderHook(() => useWebSocket(props));
  await view.unmount();
  expect(mockHandlers.get("GeneralCommand")?.size ?? 0).toBe(0);
  expect(mockHandlers.get("Playstate")?.size ?? 0).toBe(0);
});

describe("GoToSettings", () => {
  test("opens the settings page in More on a phone", async () => {
    await renderHook(() => useWebSocket(props));
    await receive("GeneralCommand", { Name: "GoToSettings" });
    expect(mockRouter.push).toHaveBeenCalledWith("/settings");
  });

  // TV has no More tab: Settings is a tab of its own there, and the settings
  // page in More cannot be reached.
  test("opens the Settings tab on TV", async () => {
    stubReactNative({ isTV: true });
    await renderHook(() => useWebSocket(props));
    await receive("GeneralCommand", { Name: "GoToSettings" });
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/(auth)/(tabs)/(tv-settings)",
    );
  });
});
