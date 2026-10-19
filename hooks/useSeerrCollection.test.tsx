import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type React from "react";
import {
  type CollectionDetails,
  MediaStatus,
  MediaType,
  type MovieResult,
} from "@/utils/seerr/types";
import { useSeerrCollectionMissing } from "./useSeerrCollection";

const mockCollectionDetails = jest.fn();
const mockGetItems = jest.fn();
let mockSeerrApi:
  | { collectionDetails: typeof mockCollectionDetails }
  | undefined;

jest.mock("@/hooks/useSeerr", () => ({
  useSeerr: () => ({ seerrApi: mockSeerrApi }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "http://server" }),
    userAtom: atom({ Id: "user-1" }),
  };
});
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getItemsApi: () => ({ getItems: mockGetItems }),
}));

// The Matrix Collection as a live Jellyfin 12.2 serves it: the BoxSet keeps
// the TMDB collection number under "Tmdb", each film its own number, with the
// collection's beside it.
const matrixCollection: BaseItemDto = {
  Id: "boxset-1",
  Type: "BoxSet",
  ProviderIds: { Tmdb: "2344" },
};
const theMatrix: BaseItemDto = {
  Id: "movie-1",
  Type: "Movie",
  ProviderIds: { Tmdb: "603", TmdbCollection: "2344" },
};

const film = (id: number, status?: MediaStatus): MovieResult => ({
  id,
  title: `Film ${id}`,
  mediaType: MediaType.MOVIE,
  mediaInfo:
    status === undefined
      ? undefined
      : { id: id * 10, tmdbId: id, status, mediaType: MediaType.MOVIE },
});

// The Matrix in the library and in the collection, Reloaded available
// elsewhere, Revolutions requested, Resurrections unknown to Seerr.
const matrixParts: CollectionDetails = {
  id: 2344,
  name: "The Matrix Collection",
  parts: [
    film(603),
    film(604, MediaStatus.AVAILABLE),
    film(605, MediaStatus.PENDING),
    film(624860),
  ],
};

const newClient = () =>
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });

const renderMissing = (collection: BaseItemDto, client = newClient()) => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSeerrCollectionMissing(collection), { wrapper });
};

const ids = (parts: MovieResult[]) => parts.map((part) => part.id);

beforeEach(() => {
  mockSeerrApi = { collectionDetails: mockCollectionDetails };
  mockCollectionDetails.mockReset().mockResolvedValue(matrixParts);
  mockGetItems.mockReset().mockResolvedValue({ data: { Items: [theMatrix] } });
});

describe("useSeerrCollectionMissing", () => {
  test("lists the collection's films the library lacks", async () => {
    const { result } = await renderMissing(matrixCollection);

    await waitFor(() => expect(ids(result.current)).toEqual([605, 624860]));
    expect(mockCollectionDetails).toHaveBeenCalledWith(2344);
    expect(mockGetItems).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: "boxset-1",
        fields: ["ProviderIds"],
      }),
    );
  });

  test("asks nothing without Seerr", async () => {
    mockSeerrApi = undefined;
    const { result } = await renderMissing(matrixCollection);
    await act(async () => {});

    expect(result.current).toEqual([]);
    expect(mockCollectionDetails).not.toHaveBeenCalled();
    expect(mockGetItems).not.toHaveBeenCalled();
  });

  test("asks nothing for a collection without a TMDB match", async () => {
    const { result } = await renderMissing({
      Id: "boxset-2",
      Type: "BoxSet",
      ProviderIds: {},
    });
    await act(async () => {});

    expect(result.current).toEqual([]);
    expect(mockCollectionDetails).not.toHaveBeenCalled();
    expect(mockGetItems).not.toHaveBeenCalled();
  });

  // Seerr alone would list The Matrix, which the collection shows above.
  test("lists nothing until the collection's own films have answered", async () => {
    let answer: (value: unknown) => void = () => {};
    mockGetItems.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const client = newClient();
    const { result } = await renderMissing(matrixCollection, client);

    // Seerr has answered, and the hook has seen it.
    await waitFor(() =>
      expect(client.getQueryData(["seerr", "collection", 2344])).toBeDefined(),
    );
    await act(async () => {});
    expect(result.current).toEqual([]);

    await act(async () => answer({ data: { Items: [theMatrix] } }));
    await waitFor(() => expect(ids(result.current)).toEqual([605, 624860]));
  });
});
