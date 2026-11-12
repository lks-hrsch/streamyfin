import { fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import type { CardData, CardSlots } from "@/components/cards/CardData";
import type { FilmographyEntry } from "@/utils/seerr/personProfile";
import { MediaStatus, MediaType } from "@/utils/seerr/types";
import { PersonFilmographyRow } from "./PersonFilmographyRow";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useSegments: () => ["(auth)", "(tabs)", "(home)", "persons", "[personId]"],
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: mockPush }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("jotai", () => ({ useAtomValue: () => ({ basePath: "http://jf" }) }));
jest.mock("@/providers/JellyfinProvider", () => ({ apiAtom: {} }));
jest.mock("@/hooks/useSeerr", () => ({
  useSeerr: () => ({
    seerrApi: { imageProxy: (path: string) => `tmdb${path}` },
    seerrUser: { permissions: 0 },
    getTitle: (credit: { title?: string }) => credit.title,
    getYear: (credit: { releaseDate?: string }) =>
      Number(credit.releaseDate?.slice(0, 4)),
  }),
}));
jest.mock("@/components/cards/CardData", () => ({
  buildItemCards: (items: { Id: string; Name: string }[]) =>
    items.map((item) => ({ id: item.Id, title: item.Name })),
}));
jest.mock("@/components/common/TouchableItemRouter", () => ({
  getItemNavigation: (item: { Id: string }) => `/items/page?id=${item.Id}`,
}));
// The row stands in as its cards: each a pressable title, its overlay inside.
jest.mock("@/components/cards/CardRow", () => {
  const { Pressable, Text, View } = jest.requireActual("react-native");
  return {
    CardRow: ({
      cards,
      onPressId,
      slots,
    }: {
      cards: CardData[];
      onPressId: (id: string) => void;
      slots: CardSlots;
    }) => (
      <View>
        {cards.map((card) => (
          <Pressable
            key={card.id}
            accessibilityRole='button'
            onPress={() => onPressId(card.id)}
          >
            <Text>{card.title}</Text>
            {card.subtitle ? <Text>{card.subtitle}</Text> : null}
            {slots.overlay?.(card) as React.ReactNode}
          </Pressable>
        ))}
      </View>
    ),
  };
});

const entries: FilmographyEntry[] = [
  {
    source: "library",
    item: { Id: "jf-603", Name: "The Matrix", ProductionYear: 1999 },
    credit: {
      id: 603,
      mediaType: MediaType.MOVIE,
      roles: [{ character: "Neo" }],
    } as never,
  },
  {
    source: "seerr",
    credit: {
      id: 605,
      mediaType: MediaType.MOVIE,
      title: "The Matrix Revolutions",
      releaseDate: "2003-11-05",
      posterPath: "/rev.jpg",
      mediaInfo: { status: MediaStatus.PENDING },
      roles: [{ character: "Neo" }],
    } as never,
  },
];

beforeEach(() => mockPush.mockClear());

describe("PersonFilmographyRow", () => {
  test("lists the library's titles first, marked, then the rest", async () => {
    await render(<PersonFilmographyRow title='Movies' entries={entries} />);

    const titles = screen
      .getAllByRole("button")
      .map((card) => card.props.children);
    expect(screen.getByText("The Matrix")).toBeTruthy();
    expect(titles).toHaveLength(2);
    expect(screen.getAllByText("person_profile.in_library")).toHaveLength(1);
    expect(screen.getByText("1999 · Neo")).toBeTruthy();
    expect(screen.getByText("2003 · Neo")).toBeTruthy();
  });

  test("opens a library title's page and a Seerr title's Seerr page", async () => {
    await render(<PersonFilmographyRow title='Movies' entries={entries} />);

    await fireEvent.press(screen.getByText("The Matrix"));
    expect(mockPush).toHaveBeenLastCalledWith("/items/page?id=jf-603");

    await fireEvent.press(screen.getByText("The Matrix Revolutions"));
    expect(mockPush).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pathname: "/(auth)/(tabs)/(home)/seerr/page",
        params: expect.objectContaining({ id: "605", mediaType: "movie" }),
      }),
    );
  });
});
