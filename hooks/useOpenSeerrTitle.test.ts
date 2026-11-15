import { renderHook } from "@testing-library/react-native";
import { appRouter } from "@/test-utils/stubModules";
import { MediaStatus, MediaType } from "@/utils/seerr/types";
import { useOpenSeerrTitle } from "./useOpenSeerrTitle";

jest.mock(
  "@/hooks/useAppRouter",
  () => jest.requireActual("@/test-utils/stubModules").appRouterModule,
);
// The route resolver is real; the pressable around it, with its action sheet,
// is not under test.
jest.mock("@/hooks/useItemActionSheet", () => ({
  useItemActionSheet: () => () => {},
}));

const mockSegments = jest.fn(() => ["(auth)", "(tabs)", "(search)"]);
jest.mock("expo-router", () => ({
  ...jest.requireActual("expo-router"),
  useSegments: () => mockSegments(),
}));

const seerrPage = {
  pathname: "/(auth)/(tabs)/(search)/seerr/page",
  params: { id: "1399", mediaType: MediaType.TV },
} as const;

const open = async () =>
  (await renderHook(() => useOpenSeerrTitle())).result.current;

describe("useOpenSeerrTitle", () => {
  it("opens the library series of a series Seerr has in part, not Seerr's page", async () => {
    // The reported case: Game of Thrones from Discover opened Seerr's page,
    // and only its Play button led on to the series it was all along.
    (await open())(
      {
        mediaType: MediaType.TV,
        mediaInfo: {
          jellyfinMediaId: "jf-got",
          status: MediaStatus.PARTIALLY_AVAILABLE,
        },
      },
      seerrPage,
    );

    expect(appRouter.push).toHaveBeenCalledWith({
      pathname: "/series/[id]",
      params: { id: "jf-got" },
    });
  });

  it("opens the library page of a film Seerr reports available", async () => {
    (await open())(
      {
        mediaType: MediaType.MOVIE,
        mediaInfo: {
          jellyfinMediaId: "jf-matrix",
          status: MediaStatus.AVAILABLE,
        },
      },
      seerrPage,
    );

    expect(appRouter.push).toHaveBeenCalledWith({
      pathname: "/items/page",
      params: { id: "jf-matrix" },
    });
  });

  it("opens Seerr's page for a title the library does not have", async () => {
    (await open())({ mediaType: MediaType.MOVIE }, seerrPage);
    (await open())(undefined, seerrPage);

    expect(appRouter.push).toHaveBeenNthCalledWith(1, seerrPage);
    expect(appRouter.push).toHaveBeenNthCalledWith(2, seerrPage);
  });

  it("opens Seerr's page while the title is only on its way", async () => {
    // Seerr keeps a deleted title's Jellyfin id while it fetches it again:
    // that id names an item the library no longer has.
    (await open())(
      {
        mediaType: MediaType.MOVIE,
        mediaInfo: {
          jellyfinMediaId: "jf-gone",
          status: MediaStatus.PROCESSING,
        },
      },
      seerrPage,
    );

    expect(appRouter.push).toHaveBeenCalledWith(seerrPage);
  });
});
