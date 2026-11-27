import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { MediaType, type MovieResult } from "@/utils/seerr/types";
import { TVMissingFromCollection } from "./TVMissingFromCollection";

let mockMissing: MovieResult[];
const mockPush = jest.fn();

jest.mock("@/hooks/useSeerrCollection", () => ({
  useSeerrCollectionMissing: () => mockMissing,
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: mockPush }),
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
// The card itself is not under test: a pressable carrying the title and the
// first-focus request stands for it.
jest.mock("@/components/tv/TVSeerrPosterCard", () => {
  const { Pressable, Text } = jest.requireActual("react-native");
  return {
    TVSeerrPosterCard: ({
      item,
      onPress,
      hasTVPreferredFocus,
    }: {
      item: MovieResult;
      onPress: () => void;
      hasTVPreferredFocus?: boolean;
    }) => (
      <Pressable onPress={onPress} testID={`focus-${!!hasTVPreferredFocus}`}>
        <Text>{item.title}</Text>
      </Pressable>
    ),
  };
});

const HEADING = "seerr.library_links.missing_from_collection";
const matrixCollection: BaseItemDto = {
  Id: "boxset-1",
  Type: "BoxSet",
  ProviderIds: { Tmdb: "2344" },
};

beforeEach(() => {
  mockPush.mockClear();
  mockMissing = [
    { id: 605, title: "The Matrix Revolutions", mediaType: MediaType.MOVIE },
  ];
});

describe("TVMissingFromCollection", () => {
  test("opens a missing film's Seerr page, where it is requested", async () => {
    await render(
      <TVMissingFromCollection
        collection={matrixCollection}
        inset={20}
        gap={16}
      />,
    );

    expect(screen.getByText(HEADING)).toBeTruthy();
    fireEvent.press(screen.getByText("The Matrix Revolutions"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/(auth)/(tabs)/(search)/seerr/page",
      params: { id: "605", mediaType: MediaType.MOVIE },
    });
  });

  // The page's filter bar has it (docs/conventions/tv.md: exactly one).
  test("leaves the first focus to the page", async () => {
    await render(
      <TVMissingFromCollection
        collection={matrixCollection}
        inset={20}
        gap={16}
      />,
    );

    expect(screen.queryByTestId("focus-true")).toBeNull();
  });

  // No heading and no empty band under the grid for the remote to stop on.
  test("draws nothing at all when nothing is missing", async () => {
    mockMissing = [];
    await render(
      <TVMissingFromCollection
        collection={matrixCollection}
        inset={20}
        gap={16}
      />,
    );

    expect(screen.toJSON()).toBeNull();
  });
});
