import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { MoreOnSeerr } from "./MoreOnSeerr";

const mockPush = jest.fn();
let mockSeerrApi: object | undefined;
let mockSegments: string[];

jest.mock("@/hooks/useSeerr", () => ({
  useSeerr: () => ({ seerrApi: mockSeerrApi }),
}));
jest.mock("expo-router", () => ({ useSegments: () => mockSegments }));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: mockPush }),
}));
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const LABEL = "seerr.library_links.more_on_seerr";
// A person as Jellyfin serves one matched on TMDB.
const bradPitt: BaseItemDto = {
  Id: "person-1",
  Type: "Person",
  ProviderIds: { Tmdb: "287", Imdb: "nm0000093" },
};

beforeEach(() => {
  mockPush.mockClear();
  mockSeerrApi = {};
  mockSegments = ["(auth)", "(tabs)", "(libraries)", "persons", "[personId]"];
});

describe("MoreOnSeerr", () => {
  test("opens the person's Seerr page in the tab it is in", async () => {
    await render(<MoreOnSeerr person={bradPitt} />);

    fireEvent.press(screen.getByText(LABEL));

    expect(mockPush).toHaveBeenCalledWith(
      "/(auth)/(tabs)/(libraries)/seerr/person/287",
    );
  });

  test("is not there without Seerr", async () => {
    mockSeerrApi = undefined;
    await render(<MoreOnSeerr person={bradPitt} />);

    expect(screen.queryByText(LABEL)).toBeNull();
  });

  test("is not there for a person without a TMDB match", async () => {
    await render(
      <MoreOnSeerr person={{ ...bradPitt, ProviderIds: { Imdb: "nm1" } }} />,
    );

    expect(screen.queryByText(LABEL)).toBeNull();
  });

  // Seerr's pages draw nothing there, so the button would lead nowhere.
  test("is not there in a tab that does not open Seerr's pages", async () => {
    mockSegments = ["(auth)", "(tabs)", "(favorites)", "persons", "[personId]"];
    await render(<MoreOnSeerr person={bradPitt} />);

    expect(screen.queryByText(LABEL)).toBeNull();
  });
});
