import { fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import { Platform } from "react-native";
import { PlayInRemoteSessionButton } from "./PlayInRemoteSession";

const mockShowModal = jest.fn();

jest.mock("@/providers/GlobalModalProvider", () => ({
  useGlobalModal: () => ({ showModal: mockShowModal, hideModal: jest.fn() }),
}));
jest.mock("@/providers/JellyfinProvider", () => ({ apiAtom: {} }));
jest.mock("jotai", () => ({ useAtomValue: () => null }));
jest.mock("@/hooks/useSessions", () => ({
  useAllSessions: () => ({ sessions: [], isLoading: false }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@gorhom/bottom-sheet", () =>
  jest.requireActual("@gorhom/bottom-sheet/mock"),
);
jest.mock("./RoundButton", () => {
  const { Pressable } = jest.requireActual("react-native");
  return {
    RoundButton: ({
      onPress,
      children,
    }: {
      onPress: () => void;
      children: React.ReactNode;
    }) => (
      <Pressable accessibilityRole='button' onPress={onPress}>
        {children}
      </Pressable>
    ),
  };
});
jest.mock("./common/HeaderIcon", () => ({ HeaderIcon: () => null }));

const setMacCatalyst = (value: boolean) =>
  Object.defineProperty(Platform, "isMacCatalyst", {
    value,
    configurable: true,
  });

describe("PlayInRemoteSessionButton", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => setMacCatalyst(false));

  // On the Mac the header lives in the window toolbar, and a Modal presented
  // from there never appeared: the header's button group went blank instead.
  test("opens the session picker in the app's sheet on the Mac", async () => {
    setMacCatalyst(true);
    await render(<PlayInRemoteSessionButton item={{ Id: "item" }} />);

    await fireEvent.press(screen.getByRole("button"));

    expect(mockShowModal).toHaveBeenCalledTimes(1);
    await render(mockShowModal.mock.calls[0][0]);
    expect(screen.getByText("home.sessions.select_session")).toBeTruthy();
  });

  test("keeps its own modal elsewhere", async () => {
    await render(<PlayInRemoteSessionButton item={{ Id: "item" }} />);
    expect(screen.queryByText("home.sessions.select_session")).toBeNull();

    await fireEvent.press(screen.getByRole("button"));

    expect(mockShowModal).not.toHaveBeenCalled();
    expect(screen.getByText("home.sessions.select_session")).toBeTruthy();
  });
});
