import { fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import { Platform, Text } from "react-native";
import { PlatformDropdown } from "./PlatformDropdown";

const mockHost = jest.fn();
const mockMenu = jest.fn();

// The SwiftUI views are native. Each stands in as what it carries: the Host
// records its props, the Menu is its label and its items, a Button a row.
jest.mock("@expo/ui/swift-ui", () => {
  const { Text: Row, View: Box } = jest.requireActual("react-native");
  return {
    Host: (props: { children: React.ReactNode }) => {
      mockHost(props);
      return <Box>{props.children}</Box>;
    },
    Menu: (props: { label: React.ReactNode; children: React.ReactNode }) => {
      mockMenu(props);
      return (
        <Box>
          <Box testID='menu-label'>{props.label}</Box>
          {props.children}
        </Box>
      );
    },
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <Row accessibilityRole='menuitem' onPress={onPress}>
        {label}
      </Row>
    ),
  };
});
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  disabled: jest.fn(),
  menuOrder: (order: string) => `menuOrder:${order}`,
  menuStyle: (style: string) => `menuStyle:${style}`,
  buttonStyle: (style: string) => `buttonStyle:${style}`,
  menuIndicator: (visibility: string) => `menuIndicator:${visibility}`,
}));
jest.mock("@gorhom/bottom-sheet", () =>
  jest.requireActual("@gorhom/bottom-sheet/mock"),
);
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/providers/GlobalModalProvider", () => ({
  useGlobalModal: () => ({
    showModal: jest.fn(),
    hideModal: jest.fn(),
    isVisible: false,
  }),
}));

const onPickSecond = jest.fn();
const groups = [
  {
    options: [
      {
        type: "radio" as const,
        label: "First",
        value: 1,
        selected: true,
        onPress: jest.fn(),
      },
      {
        type: "radio" as const,
        label: "Second",
        value: 2,
        selected: false,
        onPress: onPickSecond,
      },
    ],
  },
];

describe("PlatformDropdown on iOS", () => {
  beforeEach(() => jest.clearAllMocks());

  // The Quick Connect user picker sits above a code field that holds the
  // keyboard up. SwiftUI kept the Menu clear of that keyboard, which in a Host
  // the size of its trigger left nothing to tap: the picker drew and never
  // opened. A Host passing under a bar was pushed the same way, so it ignores
  // every safe area. Nothing in JS shows it, so the prop is what there is to
  // pin.
  test("keeps the menu where its trigger is, keyboard or bar", async () => {
    await render(
      <PlatformDropdown groups={groups} trigger={<Text>Pick</Text>} />,
    );

    expect(mockHost).toHaveBeenCalledWith(
      expect.objectContaining({ ignoreSafeArea: "all" }),
    );
  });

  // A React Native trigger inside the Menu is hosted in a view whose frame
  // both layout engines set; a caller with a SwiftUI label skips that host.
  test("labels the menu with the native label it is given", async () => {
    await render(
      <PlatformDropdown
        groups={groups}
        trigger={<Text>Pick</Text>}
        nativeLabel={<Text>Native</Text>}
      />,
    );

    const label = screen.getByTestId("menu-label");
    expect(label).toHaveTextContent("Native");
    expect(label).not.toHaveTextContent("Pick");
  });

  test("offers every option and reports the one picked", async () => {
    const onOptionSelect = jest.fn();
    await render(
      <PlatformDropdown
        groups={groups}
        trigger={<Text>Pick</Text>}
        onOptionSelect={onOptionSelect}
      />,
    );

    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    await fireEvent.press(screen.getByText("Second"));

    expect(onPickSecond).toHaveBeenCalledTimes(1);
    expect(onOptionSelect).toHaveBeenCalledWith(2);
  });
});

describe("PlatformDropdown on the Mac", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, "isMacCatalyst", {
      value: true,
      configurable: true,
    });
  });
  afterEach(() => {
    Object.defineProperty(Platform, "isMacCatalyst", {
      value: false,
      configurable: true,
    });
  });

  // The Mac's default menu style is a bordered pull-down button that shows
  // only text or an image from its label, so the React Native trigger drew as
  // an empty pill with a chevron.
  test("lets the trigger draw itself instead of a system pull-down button", async () => {
    await render(
      <PlatformDropdown groups={groups} trigger={<Text>Pick</Text>} />,
    );

    expect(mockMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        modifiers: [
          "menuOrder:fixed",
          "menuStyle:button",
          "buttonStyle:plain",
          "menuIndicator:hidden",
        ],
      }),
    );
  });

  test("keeps the iOS menu as it is, items in the given order", async () => {
    Object.defineProperty(Platform, "isMacCatalyst", {
      value: false,
      configurable: true,
    });
    await render(
      <PlatformDropdown groups={groups} trigger={<Text>Pick</Text>} />,
    );

    expect(mockMenu.mock.calls[0][0].modifiers).toEqual(["menuOrder:fixed"]);
  });
});
