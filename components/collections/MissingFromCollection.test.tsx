import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { render, screen } from "@testing-library/react-native";
import { MediaType, type MovieResult } from "@/utils/seerr/types";
import { MissingFromCollection } from "./MissingFromCollection";

let mockMissing: MovieResult[];
let mockSegments: string[];
const mockUseMissing = jest.fn();

jest.mock("@/hooks/useSeerrCollection", () => ({
  useSeerrCollectionMissing: (collection: unknown) => {
    mockUseMissing(collection);
    return mockMissing;
  },
}));
jest.mock("expo-router", () => ({ useSegments: () => mockSegments }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// The poster itself is not under test: its title stands for it.
jest.mock("@/components/posters/SeerrPoster", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: ({ item }: { item: MovieResult }) => <Text>{item.title}</Text>,
  };
});

const HEADING = "seerr.library_links.missing_from_collection";
const matrixCollection: BaseItemDto = {
  Id: "boxset-1",
  Type: "BoxSet",
  ProviderIds: { Tmdb: "2344" },
};
const film = (id: number, title: string): MovieResult => ({
  id,
  title,
  mediaType: MediaType.MOVIE,
});

beforeEach(() => {
  mockUseMissing.mockClear();
  mockMissing = [
    film(605, "The Matrix Revolutions"),
    film(624860, "The Matrix Resurrections"),
  ];
  mockSegments = ["(auth)", "(tabs)", "(home)", "collections", "[id]"];
});

describe("MissingFromCollection", () => {
  test("shows the films the library lacks under a heading", async () => {
    await render(<MissingFromCollection collection={matrixCollection} />);

    expect(screen.getByText(HEADING)).toBeTruthy();
    expect(screen.getByText("The Matrix Revolutions")).toBeTruthy();
    expect(screen.getByText("The Matrix Resurrections")).toBeTruthy();
  });

  // A heading over nothing would read as a section that failed to load.
  test("shows nothing when nothing is missing", async () => {
    mockMissing = [];
    await render(<MissingFromCollection collection={matrixCollection} />);

    expect(screen.toJSON()).toBeNull();
  });

  // Seerr's posters draw nothing there: Seerr is not even asked.
  test("asks Seerr nothing in a tab that does not open its pages", async () => {
    mockSegments = ["(auth)", "(tabs)", "(watchlists)", "collections", "[id]"];
    mockMissing = [];
    await render(<MissingFromCollection collection={matrixCollection} />);

    expect(mockUseMissing).toHaveBeenLastCalledWith(undefined);
    expect(screen.toJSON()).toBeNull();
  });
});
