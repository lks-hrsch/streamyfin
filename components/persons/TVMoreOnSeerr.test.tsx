import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { TVMoreOnSeerr, TVMoreOnSeerrArea } from "./TVMoreOnSeerr";

const mockPush = jest.fn();
let mockSeerrApi: object | undefined;

jest.mock("@/hooks/useSeerr", () => ({
  useSeerr: () => ({ seerrApi: mockSeerrApi }),
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: mockPush }),
}));
// The focus animation keeps the inactivity timer, whose provider reaches
// the app's storage.
jest.mock("@/providers/InactivityProvider", () => ({
  useInactivity: () => ({ resetInactivityTimer: () => {} }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// The TV sizes read the type scale from the settings, and its enum with it.
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: {} }),
  TVTypographyScale: {
    Small: "small",
    Default: "default",
    Large: "large",
    ExtraLarge: "extraLarge",
  },
}));

const LABEL = "seerr.library_links.more_on_seerr";
// A person as Jellyfin serves one matched on TMDB.
const bradPitt: BaseItemDto = {
  Id: "person-1",
  Type: "Person",
  ProviderIds: { Tmdb: "287" },
};

type HostNode = ReturnType<typeof screen.toJSON>;

/** What each host view asking the TV focus engine says about the first focus. */
const preferredFocus = (node: HostNode): unknown[] => {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(preferredFocus);
  const own =
    "hasTVPreferredFocus" in node.props ? [node.props.hasTVPreferredFocus] : [];
  return [
    ...own,
    ...(node.children ?? []).flatMap((child) =>
      typeof child === "string" ? [] : preferredFocus(child),
    ),
  ];
};

/** Whether any host view in the tree is a focus guide that hands focus on. */
const guidesFocus = (node: HostNode): boolean => {
  if (!node) return false;
  if (Array.isArray(node)) return node.some(guidesFocus);
  if (node.props.autoFocus === true) return true;
  return (node.children ?? []).some(
    (child) => typeof child !== "string" && guidesFocus(child),
  );
};

beforeEach(() => {
  mockPush.mockClear();
  mockSeerrApi = {};
});

describe("TVMoreOnSeerr", () => {
  // Seerr's TV pages live in the Search stack, which the TV pushes onto
  // whatever tab it is in, Back returning to the person.
  test("opens the person's Seerr page", async () => {
    await render(<TVMoreOnSeerr person={bradPitt} />);

    fireEvent.press(screen.getByText(LABEL));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/(auth)/(tabs)/(search)/seerr/person/[personId]",
      params: { personId: "287" },
    });
  });

  // The person's first title has it (docs/conventions/tv.md: exactly one).
  test("never asks for the first focus", async () => {
    await render(<TVMoreOnSeerr person={bradPitt} />);

    expect(preferredFocus(screen.toJSON())).toEqual([false]);
  });

  test("is not there without Seerr", async () => {
    mockSeerrApi = undefined;
    await render(<TVMoreOnSeerr person={bradPitt} />);

    expect(screen.queryByText(LABEL)).toBeNull();
  });

  test("is not there for a person without a TMDB match", async () => {
    await render(<TVMoreOnSeerr person={{ ...bradPitt, ProviderIds: {} }} />);

    expect(screen.queryByText(LABEL)).toBeNull();
  });
});

describe("TVMoreOnSeerrArea", () => {
  // The link sits in the text column; from the title under the portrait,
  // up went past it to the tab bar until the header row guided focus to it.
  test("guides focus coming up from the titles to the link", async () => {
    await render(
      <TVMoreOnSeerrArea person={bradPitt}>
        <Text>header</Text>
      </TVMoreOnSeerrArea>,
    );

    expect(guidesFocus(screen.toJSON())).toBe(true);
  });

  test("is a plain row when there is no link", async () => {
    mockSeerrApi = undefined;
    await render(
      <TVMoreOnSeerrArea person={bradPitt}>
        <Text>header</Text>
      </TVMoreOnSeerrArea>,
    );

    expect(guidesFocus(screen.toJSON())).toBe(false);
    expect(screen.getByText("header")).toBeTruthy();
  });
});
