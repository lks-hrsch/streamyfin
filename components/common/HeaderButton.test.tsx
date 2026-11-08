import { render, screen } from "@testing-library/react-native";
import { Platform, StyleSheet, Text } from "react-native";
import { HeaderButton, HeaderButtonGroup } from "./HeaderButton";

jest.mock("react-native-gesture-handler", () => {
  const { Pressable } = jest.requireActual("react-native");
  return { Pressable };
});

const setMacCatalyst = (value: boolean) =>
  Object.defineProperty(Platform, "isMacCatalyst", {
    value,
    configurable: true,
  });

const padding = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style).paddingHorizontal;

describe("HeaderButton", () => {
  afterEach(() => setMacCatalyst(false));

  // On the Mac the toolbar draws its pill at a fixed height around the
  // button, so a bare glyph came out as a standing capsule next to the
  // round back button.
  test("pads a lone glyph to a round pill on the Mac", async () => {
    setMacCatalyst(true);
    await render(
      <HeaderButton testID='lone'>
        <Text>D</Text>
      </HeaderButton>,
    );

    expect(padding("lone")).toBe(6);
  });

  test("leaves glyphs in a group to the group's spacing on the Mac", async () => {
    setMacCatalyst(true);
    await render(
      <HeaderButtonGroup>
        <HeaderButton testID='first'>
          <Text>A</Text>
        </HeaderButton>
        <HeaderButton testID='second'>
          <Text>B</Text>
        </HeaderButton>
      </HeaderButtonGroup>,
    );

    expect(padding("first")).toBe(0);
    expect(padding("second")).toBe(0);
  });

  test("keeps a lone glyph flush on iOS", async () => {
    await render(
      <HeaderButton testID='lone'>
        <Text>D</Text>
      </HeaderButton>,
    );

    expect(padding("lone")).toBe(0);
  });
});
