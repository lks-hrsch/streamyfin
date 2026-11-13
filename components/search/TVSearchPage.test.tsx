import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { MediaType, type MovieResult } from "@/utils/seerr/types";
import { TVSearchPage } from "./TVSearchPage";

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom({ basePath: "http://server" }) };
});
// The real module drags the whole settings UI in; the TV sizes only read this.
// A poster is its name and its two presses here; its artwork, its glass and
// its focus animation need the native side.
jest.mock("@/components/tv/TVPosterCard", () => {
  const { Pressable, Text } = jest.requireActual("react-native");
  return {
    TVPosterCard: ({ item, onPress, onLongPress }: any) => (
      <Pressable onPress={onPress} onLongPress={onLongPress}>
        <Text>{item.Name}</Text>
      </Pressable>
    ),
  };
});
// A Seerr poster too: its badges and its request check are not under test.
jest.mock("@/components/tv/TVSeerrPosterCard", () => {
  const { Pressable, Text } = jest.requireActual("react-native");
  return {
    TVSeerrPosterCard: ({ item, onPress }: any) => (
      <Pressable onPress={onPress}>
        <Text>{item.title ?? item.name}</Text>
      </Pressable>
    ),
  };
});
// The native search field is not what is under test, nor what the Discover
// rows draw: only whether they are there, and what they are given.
jest.mock("@/modules/tv-search", () => ({ TvSearchView: () => null }));
const mockTVDiscover = jest.fn();
jest.mock("@/components/seerr/discover/TVDiscover", () => ({
  TVDiscover: (props: unknown) => {
    mockTVDiscover(props);
    return null;
  },
}));
jest.mock("./TVSearchSortButtons", () => ({ TVSearchSortButtons: () => null }));

beforeEach(() => mockTVDiscover.mockClear());

const studio: BaseItemDto = { Id: "studio-1", Type: "Studio", Name: "Pixar" };
const actor: BaseItemDto = { Id: "person-1", Type: "Person", Name: "Tom" };

type PageProps = React.ComponentProps<typeof TVSearchPage>;

const renderPage = async (
  results: Partial<PageProps>,
  onItemPress = jest.fn(),
  onItemLongPress = jest.fn(),
) => {
  await render(
    <TVSearchPage
      search='pix'
      setSearch={() => {}}
      debouncedSearch='pix'
      loading={false}
      noResults={false}
      onItemPress={onItemPress}
      onItemLongPress={onItemLongPress}
      onSeerrResultPress={() => {}}
      {...results}
    />,
  );
  return { onItemPress, onItemLongPress };
};

describe("TV search studios", () => {
  test("lists the studios in a section of their own and opens one", async () => {
    const { onItemPress } = await renderPage({ studios: [studio] });

    expect(screen.getByText("search.studios")).toBeTruthy();
    await fireEvent.press(screen.getByText("Pixar"));
    expect(onItemPress).toHaveBeenCalledWith(studio);
  });

  test("shows no studios section when the search found none", async () => {
    await renderPage({ studios: [], actors: [actor] });

    expect(screen.queryByText("search.studios")).toBeNull();
    expect(screen.getByText("search.actors")).toBeTruthy();
  });

  // The long press marks an item played, which means nothing for a studio.
  test("offers the long press on a person but not on a studio", async () => {
    const { onItemLongPress } = await renderPage({
      studios: [studio],
      actors: [actor],
    });

    await fireEvent(screen.getByText("Pixar"), "longPress");
    expect(onItemLongPress).not.toHaveBeenCalled();

    await fireEvent(screen.getByText("Tom"), "longPress");
    expect(onItemLongPress).toHaveBeenCalledWith(actor);
  });
});

const dune: MovieResult = {
  id: 438631,
  mediaType: MediaType.MOVIE,
  title: "Dune",
};
const movie: BaseItemDto = { Id: "movie-1", Type: "Movie", Name: "Arrival" };

describe("TV search, what Seerr could add", () => {
  test("lists it in a row after the library's results and opens it", async () => {
    const onSeerrResultPress = jest.fn();
    await renderPage({
      movies: [movie],
      seerrNotInLibrary: [dune],
      onSeerrResultPress,
    });

    expect(screen.getByText("search.movies")).toBeTruthy();
    expect(
      screen.getByText("seerr.library_search.not_in_your_library"),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText("Dune"));
    expect(onSeerrResultPress).toHaveBeenCalledWith(dune);
  });

  test("lists it under the line saying the library has nothing", async () => {
    await renderPage({ noResults: true, seerrNotInLibrary: [dune] });

    expect(screen.getByText("search.no_results_found_for")).toBeTruthy();
    expect(screen.getByText("Dune")).toBeTruthy();
  });

  test("shows no row while the library search is loading", async () => {
    await renderPage({ loading: true, seerrNotInLibrary: [dune] });

    expect(screen.queryByText("Dune")).toBeNull();
  });

  test("shows no row when Seerr has nothing to add", async () => {
    await renderPage({ movies: [movie], seerrNotInLibrary: [] });

    expect(
      screen.queryByText("seerr.library_search.not_in_your_library"),
    ).toBeNull();
  });
});

// The page used to open on a Library tab with nothing under the search field,
// Discover's rows one tab away.
describe("TV search before anything is typed", () => {
  const sliders = [
    { id: 1, type: 1, order: 0, enabled: true, isBuiltIn: true },
  ] as React.ComponentProps<typeof TVSearchPage>["discoverSliders"];

  test("opens on Discover's rows", async () => {
    await renderPage({
      search: "",
      debouncedSearch: "",
      discoverSliders: sliders,
    });

    expect(mockTVDiscover).toHaveBeenCalledWith(
      expect.objectContaining({ sliders }),
    );
  });

  // The rows come in after the page opened: a first card taking the focus
  // then pulled it out of the search field the user is about to type in.
  test("leaves the focus in the search field", async () => {
    await renderPage({
      search: "",
      debouncedSearch: "",
      discoverSliders: sliders,
    });

    expect(mockTVDiscover).toHaveBeenCalledWith(
      expect.objectContaining({ claimsFocus: false }),
    );
  });

  test("shows what the search found instead once something is typed", async () => {
    await renderPage({
      movies: [movie],
      seerrNotInLibrary: [dune],
      discoverSliders: sliders,
    });

    expect(mockTVDiscover).not.toHaveBeenCalled();
    expect(screen.getByText(movie.Name as string)).toBeTruthy();
    expect(
      screen.getByText("seerr.library_search.not_in_your_library"),
    ).toBeTruthy();
  });
});
