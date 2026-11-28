import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { render, screen } from "@testing-library/react-native";
import { SeriesPlayRow } from "./SeriesPlayRow";

// The item page's Play button, casting and resuming included, is not under
// test here: which episode it is handed is.
jest.mock("@/components/PlayButton", () => ({
  PlayButton: ({ item }: { item: BaseItemDto }) => {
    const { Text } = jest.requireActual("react-native");
    return <Text>{`play ${item.Id}`}</Text>;
  },
}));
jest.mock("@/components/seerr/LibraryIssueButton", () => ({
  LibraryIssueButton: ({ item }: { item: BaseItemDto }) => {
    const { Text } = jest.requireActual("react-native");
    return <Text>{`issue ${item.Id}`}</Text>;
  },
}));
jest.mock("@/hooks/usePlayMedia", () => ({ usePlayMedia: () => jest.fn() }));
jest.mock(
  "@/providers/JellyfinProvider",
  () =>
    jest.requireActual("@/test-utils/jellyfinProvider").jellyfinProviderModule,
);
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({ getDownloadedItemById: () => undefined }),
}));
jest.mock("@/hooks/useImageColorsReturn", () => ({
  useImageColorsReturn: () => ({ primary: "#000", text: "#fff" }),
}));

const series: BaseItemDto = { Id: "got", Type: "Series", Name: "GoT" };
const episodes: BaseItemDto[] = [
  {
    Id: "e1",
    Type: "Episode",
    Name: "Winter Is Coming",
    ParentIndexNumber: 1,
    IndexNumber: 1,
    UserData: { Played: true } as BaseItemDto["UserData"],
  },
  {
    Id: "e2",
    Type: "Episode",
    Name: "The Kingsroad",
    ParentIndexNumber: 1,
    IndexNumber: 2,
  },
];

describe("SeriesPlayRow", () => {
  it("plays the episode the series is at, and names it", async () => {
    // The phone's series page had no Play of its own: the next episode was a
    // card in Next up, and its own page another press away.
    await render(<SeriesPlayRow item={series} episodes={episodes} />);

    expect(screen.getByText("S1:E2 · The Kingsroad")).toBeTruthy();
    expect(screen.getByText("play e2")).toBeTruthy();
  });

  it("reports an issue for the series beside Play, as Seerr's page did", async () => {
    await render(<SeriesPlayRow item={series} episodes={episodes} />);

    expect(screen.getByText("issue got")).toBeTruthy();
  });

  it("draws nothing before the episodes are known", async () => {
    await render(<SeriesPlayRow item={series} episodes={undefined} />);

    expect(screen.queryByText(/play/)).toBeNull();
  });
});
