import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";
import { SearchTabButtons } from "./SearchTabButtons";

jest.mock("@expo/ui/swift-ui", () => ({}));
jest.mock("@expo/ui/swift-ui/modifiers", () => ({ buttonStyle: jest.fn() }));
jest.mock("@/components/GenreTags", () => ({ Tag: () => null }));

const setMacCatalyst = (value: boolean) =>
  Object.defineProperty(Platform, "isMacCatalyst", {
    value,
    configurable: true,
  });

describe("SearchTabButtons on the Mac", () => {
  beforeEach(() => setMacCatalyst(true));
  afterEach(() => setMacCatalyst(false));

  // SwiftUI's glass and glass-prominent button styles look the same on the
  // Mac, so nothing showed whether Library or Discover was on.
  test("marks the selected search type", async () => {
    await render(
      <SearchTabButtons
        searchType='Discover'
        setSearchType={jest.fn()}
        t={(key) => key}
      />,
    );

    expect(
      screen.getByRole("button", { name: "search.discover" }).props
        .accessibilityState,
    ).toEqual(expect.objectContaining({ selected: true }));
    expect(
      screen.getByRole("button", { name: "search.library" }).props
        .accessibilityState,
    ).toEqual(expect.objectContaining({ selected: false }));
  });

  test("switches the search type", async () => {
    const setSearchType = jest.fn();
    await render(
      <SearchTabButtons
        searchType='Library'
        setSearchType={setSearchType}
        t={(key) => key}
      />,
    );

    await fireEvent.press(
      screen.getByRole("button", { name: "search.discover" }),
    );

    expect(setSearchType).toHaveBeenCalledWith("Discover");
  });
});
