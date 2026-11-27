import { render, screen } from "@testing-library/react-native";
import { SeerrBadgeColors, TVTextColors } from "@/constants/Colors";
import type { MissingSeason } from "@/utils/seerr/missingSeasons";
import { TVSeerrMissingSeasons } from "./TVSeerrMissingSeasons";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { season_number?: number }) =>
      options?.season_number === undefined
        ? key
        : `${key}:${options.season_number}`,
  }),
}));
// The request button beside it in the file is the focus engine's business,
// and reaches native storage when it loads.
jest.mock("@/components/tv/TVButton", () => ({ TVButton: () => null }));
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ callout: 18 }),
}));

const season = (
  seasonNumber: number,
  overrides: Partial<MissingSeason> = {},
): MissingSeason => ({
  seasonNumber,
  episodeCount: 10,
  badge: "not_requested",
  requestable: true,
  ...overrides,
});

describe("TVSeerrMissingSeasons", () => {
  test("draws nothing when no season is missing", async () => {
    await render(<TVSeerrMissingSeasons seasons={[]} offersRequest />);

    expect(screen.queryByText("seerr.series_page.missing_seasons")).toBeNull();
  });

  test("names each missing season with where it stands", async () => {
    await render(
      <TVSeerrMissingSeasons
        seasons={[
          season(0),
          season(3, { badge: "requested", requestable: false }),
          season(5, { badge: "failed", requestable: false }),
        ]}
        offersRequest
      />,
    );

    expect(screen.getByText("seerr.series_page.missing_seasons")).toHaveStyle({
      color: TVTextColors.heading,
    });
    expect(screen.getByText("seerr.specials")).toBeTruthy();
    expect(screen.getByText("seerr.season_number:3")).toBeTruthy();
    expect(screen.getByText("seerr.season_badge.not_requested")).toHaveStyle({
      color: TVTextColors.secondary,
    });
    expect(screen.getByText("seerr.season_badge.requested")).toHaveStyle({
      color: TVTextColors.secondary,
    });
    // A failed request stands out, in Seerr's colour for a failure.
    expect(screen.getByText("seerr.request_status.failed")).toHaveStyle({
      color: SeerrBadgeColors.danger.border,
    });
  });
});
