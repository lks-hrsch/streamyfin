import type { BaseItemPerson } from "@jellyfin/sdk/lib/generated-client/models";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { TVSeriesCast } from "./TVSeriesCast";

let mockCast: BaseItemPerson[] = [];

// What the cast is made of is useSeriesCast's, covered by its own spec.
jest.mock("@/hooks/useSeriesCast", () => ({
  useSeriesCast: () => mockCast,
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom({ basePath: "http://server" }) };
});
jest.mock("@/providers/InactivityProvider", () => ({
  useInactivity: () => ({ resetInactivityTimer: () => {} }),
}));
// The real hooks read the settings atom, whose module graph is the whole app.
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({}),
}));
jest.mock("@/constants/TVSizes", () => ({
  useScaledTVSizes: () => ({ gaps: { item: 0 } }),
}));
jest.mock("@/components/common/ServerImage", () => ({ Image: () => null }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const CAST: BaseItemPerson[] = [
  { Id: "bates", Name: "Kathy Bates", Type: "Actor", Role: "Delphine, Ethel" },
  { Id: "peters", Name: "Evan Peters", Type: "Actor", Role: null },
];

const renderRow = (onPersonPress = jest.fn(), disabled = false) =>
  render(
    <TVSeriesCast
      item={{ Id: "series-1", Type: "Series" }}
      onPersonPress={onPersonPress}
      disabled={disabled}
      horizontalPadding={0}
      titleInset={0}
    />,
  );

describe("TVSeriesCast", () => {
  beforeEach(() => {
    mockCast = CAST;
  });

  test("shows the cast, and an actor opens their page", async () => {
    const onPersonPress = jest.fn();
    await renderRow(onPersonPress);

    expect(screen.getByText("item_card.cast")).toBeTruthy();
    expect(screen.getByText("Delphine, Ethel")).toBeTruthy();
    fireEvent.press(screen.getByText("Evan Peters"));

    expect(onPersonPress).toHaveBeenCalledWith("peters");
  });

  // The series page keeps its season modal on top of the row: the remote
  // must not reach, let alone open, what sits behind it.
  test("a disabled actor cannot be opened", async () => {
    const onPersonPress = jest.fn();
    await renderRow(onPersonPress, true);

    fireEvent.press(screen.getByText("Evan Peters"));

    expect(onPersonPress).not.toHaveBeenCalled();
  });

  // Offline, or a series nobody is credited on: an empty row would be one
  // more stop for the focus engine.
  test("draws nothing without a cast", async () => {
    mockCast = [];
    await renderRow();

    expect(screen.queryByText("item_card.cast")).toBeNull();
  });
});
