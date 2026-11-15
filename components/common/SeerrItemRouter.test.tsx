import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { appRouter } from "@/test-utils/stubModules";
import {
  MediaStatus,
  MediaType,
  type MovieResult,
  type TvResult,
} from "@/utils/seerr/types";
import { TouchableSeerrRouter } from "./SeerrItemRouter";

jest.mock(
  "@/hooks/useAppRouter",
  () => jest.requireActual("@/test-utils/stubModules").appRouterModule,
);
// The route resolver is real; the pressable around it, with its action sheet,
// is not under test.
jest.mock("@/hooks/useItemActionSheet", () => ({
  useItemActionSheet: () => () => {},
}));
jest.mock("expo-router", () => ({
  ...jest.requireActual("expo-router"),
  useSegments: () => ["(auth)", "(tabs)", "(search)"],
}));

const gameOfThrones = {
  id: 1399,
  mediaType: MediaType.TV,
  name: "Game of Thrones",
  mediaInfo: {
    jellyfinMediaId: "jf-got",
    status: MediaStatus.PARTIALLY_AVAILABLE,
  },
} as unknown as TvResult;

const renderCard = (result: MovieResult | TvResult) =>
  render(
    <TouchableSeerrRouter
      result={result}
      mediaTitle='Title'
      releaseYear={2011}
      canRequest={false}
      posterSrc='poster'
      mediaType={result.mediaType as MediaType}
    >
      <Text>card</Text>
    </TouchableSeerrRouter>,
  );

describe("TouchableSeerrRouter", () => {
  it("opens a Discover card of a library series on the series' own page", async () => {
    // The reported detour: Discover opened Seerr's page, and only its Play
    // button reached the series' page with the episodes.
    await renderCard(gameOfThrones);
    await fireEvent.press(screen.getByText("card"));

    expect(appRouter.push).toHaveBeenCalledTimes(1);
    expect(appRouter.push).toHaveBeenCalledWith({
      pathname: "/series/[id]",
      params: { id: "jf-got" },
    });
  });

  it("opens a details answer, which carries no media type, by the card's", async () => {
    // A request card hands over Seerr's details, which name no media type.
    const { mediaType: _, ...details } = gameOfThrones;
    await render(
      <TouchableSeerrRouter
        result={details as TvResult}
        canRequest={false}
        posterSrc='poster'
        mediaType={MediaType.TV}
      >
        <Text>card</Text>
      </TouchableSeerrRouter>,
    );
    await fireEvent.press(screen.getByText("card"));

    expect(appRouter.push).toHaveBeenCalledWith({
      pathname: "/series/[id]",
      params: { id: "jf-got" },
    });
  });

  it("opens Seerr's page for a title the library does not have", async () => {
    await renderCard({
      id: 605,
      mediaType: MediaType.MOVIE,
      title: "The Matrix Revolutions",
    } as unknown as MovieResult);
    await fireEvent.press(screen.getByText("card"));

    expect(appRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/(auth)/(tabs)/(search)/seerr/page",
        params: expect.objectContaining({ id: 605, mediaType: "movie" }),
      }),
    );
  });
});
