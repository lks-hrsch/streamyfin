import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type React from "react";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { appRouter } from "@/test-utils/stubModules";
import { MediaStatus, MediaType } from "@/utils/seerr/types";
import { useLeaveForLibraryPage } from "./useLeaveForLibraryPage";

jest.mock(
  "@/utils/atoms/api",
  () => jest.requireActual("@/test-utils/jellyfinProvider").apiAtomsModule,
);
jest.mock(
  "@/hooks/useAppRouter",
  () => jest.requireActual("@/test-utils/stubModules").appRouterModule,
);
// The route resolver is real; the pressable around it, with its action sheet,
// is not under test.
jest.mock("@/hooks/useItemActionSheet", () => ({
  useItemActionSheet: () => () => {},
}));
// The page is on screen: its focus effect runs as it renders.
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    ...jest.requireActual("expo-router"),
    useSegments: () => ["(auth)", "(tabs)", "(home)"],
    useFocusEffect: (effect: () => undefined | (() => void)) =>
      useEffect(effect, [effect]),
  };
});

let client: QueryClient;
// The api the session double holds, to answer the item request with.
const api = (
  jest.requireMock("@/utils/atoms/api") as {
    apiAtom: { init: ReturnType<typeof makeApi> };
  }
).apiAtom.init;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const gameOfThrones = {
  mediaType: MediaType.TV,
  mediaInfo: {
    jellyfinMediaId: "jf-got",
    status: MediaStatus.PARTIALLY_AVAILABLE,
  },
};

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } },
  });
  api.mock.reset();
});

afterEach(() => client.clear());

describe("useLeaveForLibraryPage", () => {
  it("replaces Seerr's page with the library's once the item is found", async () => {
    api.mock
      .onGet(/\/Items\/jf-got/)
      .reply(200, { Id: "jf-got", Type: "Series", Name: "Game of Thrones" });

    const { result } = await renderHook(
      () => useLeaveForLibraryPage(gameOfThrones),
      { wrapper },
    );

    // Nothing of Seerr's page while the item is asked for.
    expect(result.current.toLibrary).toBe(true);
    await waitFor(() =>
      expect(appRouter.replace).toHaveBeenCalledWith({
        pathname: "/series/[id]",
        params: { id: "jf-got" },
      }),
    );
    expect(appRouter.push).not.toHaveBeenCalled();
  });

  it("waits for this visit's answer rather than a cached item", async () => {
    // The item can have been deleted since it was cached: its page would fail.
    client.setQueryData(["seerr", "library-item", "jf-got", "user-1"], {
      Id: "jf-got",
      Type: "Series",
    });
    api.mock.onGet(/\/Items\/jf-got/).reply(404);

    const { result } = await renderHook(
      () => useLeaveForLibraryPage(gameOfThrones),
      { wrapper },
    );

    await waitFor(() => expect(result.current.toLibrary).toBe(false));
    expect(appRouter.replace).not.toHaveBeenCalled();
  });

  it("stays on Seerr's page for an item this user cannot open", async () => {
    // Seerr reads Jellyfin with its own account: the item can be in a library
    // the signed in user does not see.
    api.mock.onGet(/\/Items\/jf-got/).reply(404);

    const { result } = await renderHook(
      () => useLeaveForLibraryPage(gameOfThrones),
      { wrapper },
    );

    await waitFor(() => expect(result.current.toLibrary).toBe(false));
    expect(appRouter.replace).not.toHaveBeenCalled();
  });

  it("stays on Seerr's page for a title the library does not have", async () => {
    const { result } = await renderHook(
      () =>
        useLeaveForLibraryPage({
          mediaType: MediaType.MOVIE,
          mediaInfo: { status: MediaStatus.PENDING },
        }),
      { wrapper },
    );

    expect(result.current.toLibrary).toBe(false);
    expect(api.mock.history.get).toHaveLength(0);
    expect(appRouter.replace).not.toHaveBeenCalled();
  });
});
