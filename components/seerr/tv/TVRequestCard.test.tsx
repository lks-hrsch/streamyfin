import { fireEvent, render, screen } from "@testing-library/react-native";
import { appRouter } from "@/test-utils/stubModules";
import { type MediaRequest, MediaStatus, MediaType } from "@/utils/seerr/types";
import { TVRequestCard } from "./TVRequestCard";

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
jest.mock(
  "@/constants/TVTypography",
  () => jest.requireActual("@/test-utils/stubModules").emptyTVTypographyModule,
);

// What the card shows comes from Seerr through this hook; the card itself
// decides where a press goes.
const mockCard = jest.fn();
jest.mock("@/hooks/useSeerrRequestCard", () => ({
  useSeerrRequestCard: () => mockCard(),
}));

const cardOf = (mediaInfo: object | undefined) => ({
  details: { id: 1399, name: "Game of Thrones", mediaInfo },
  current: { id: 3, media: mediaInfo },
  mediaType: MediaType.TV,
  badge: { label: "pending", tone: "warning" },
  badgeText: { pending: "Pending" },
  avatar: undefined,
  showRequester: false,
  seasonLabels: [],
  title: "Game of Thrones",
  posterSrc: undefined,
  backdropSrc: undefined,
});

const request = { id: 3, type: MediaType.TV } as unknown as MediaRequest;

describe("TVRequestCard", () => {
  it("opens a request for a library series on the series' own page", async () => {
    // Recent requests is the first row the TV's search shows: the series was
    // a Play press away from its episodes on Seerr's page.
    mockCard.mockReturnValue(
      cardOf({
        jellyfinMediaId: "jf-got",
        status: MediaStatus.PARTIALLY_AVAILABLE,
      }),
    );
    await render(<TVRequestCard request={request} />);
    await fireEvent.press(screen.getByText("Game of Thrones"));

    expect(appRouter.push).toHaveBeenCalledWith({
      pathname: "/series/[id]",
      params: { id: "jf-got" },
    });
  });

  it("opens Seerr's page for a request the library has nothing of yet", async () => {
    mockCard.mockReturnValue(cardOf({ status: MediaStatus.PENDING }));
    await render(<TVRequestCard request={request} />);
    await fireEvent.press(screen.getByText("Game of Thrones"));

    expect(appRouter.push).toHaveBeenCalledWith({
      pathname: "/(auth)/(tabs)/(search)/seerr/page",
      params: { id: "1399", mediaType: MediaType.TV },
    });
  });
});
