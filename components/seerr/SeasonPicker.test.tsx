import { fireEvent, render, screen } from "@testing-library/react-native";
import { SeerrStatusColors, SheetColors } from "@/constants/Colors";
import { SEERR_BLOCKED_OPACITY } from "@/constants/Seerr";
import type { SeasonRow } from "@/utils/seerr/seasons";
import { SeasonPicker } from "./SeasonPicker";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { season_number?: number; count?: number }) =>
      [key, options?.season_number ?? options?.count]
        .filter((part) => part !== undefined)
        .join(":"),
  }),
}));

const row = (
  seasonNumber: number,
  overrides: Partial<SeasonRow> = {},
): SeasonRow => ({
  seasonNumber,
  episodeCount: 8,
  badge: "not_requested",
  locked: false,
  ...overrides,
});

// One row of each kind the request sheet draws: two still to choose, and one
// for each place a season can stand on Seerr.
const rows: SeasonRow[] = [
  row(0),
  row(1),
  row(2, { badge: "pending", locked: true }),
  row(3, { badge: "requested", locked: true }),
  row(4, { badge: "partially_available", locked: true }),
  row(5, { badge: "available", locked: true }),
  // A request that failed: Seerr draws no badge, and it still stands.
  row(6, { badge: undefined, locked: true }),
];

const show = async (
  props: Partial<React.ComponentProps<typeof SeasonPicker>>,
) => {
  const onToggle = jest.fn();
  await render(
    <SeasonPicker rows={rows} selected={[]} onToggle={onToggle} {...props} />,
  );
  return onToggle;
};

const checkbox = (label: string) =>
  screen.getByRole("checkbox", { name: label });

describe("SeasonPicker", () => {
  test("names each season with its episodes, the specials as such", async () => {
    await show({});

    expect(screen.getByText("seerr.specials")).toBeTruthy();
    expect(screen.getByText("seerr.season_number:1")).toBeTruthy();
    expect(screen.getAllByText("seerr.number_episodes:8")).toHaveLength(7);
  });

  test("reads a season that stands somewhere as checked, with where it stands", async () => {
    await show({});

    for (const [season, badge, color] of [
      [2, "pending", SeerrStatusColors.pending],
      [3, "requested", SeerrStatusColors.requested],
      [4, "partially_available", SeerrStatusColors.available],
      [5, "available", SeerrStatusColors.available],
    ] as const) {
      const label = `seerr.season_number:${season}, seerr.number_episodes:8, seerr.season_badge.${badge}`;
      expect(checkbox(label).props.accessibilityState).toEqual({
        checked: true,
        disabled: true,
      });
      expect(
        screen.getByText(`seerr.season_badge.${badge}`, { exact: true }),
      ).toHaveStyle({ color });
    }
  });

  test("gives a failed request no words, but keeps it from being asked again", async () => {
    await show({});

    expect(
      checkbox("seerr.season_number:6, seerr.number_episodes:8").props
        .accessibilityState,
    ).toEqual({ checked: true, disabled: true });
  });

  test("switches a season on and off", async () => {
    const onToggle = await show({ selected: [1] });

    const open = checkbox("seerr.specials, seerr.number_episodes:8");
    const chosen = checkbox("seerr.season_number:1, seerr.number_episodes:8");
    expect(open.props.accessibilityState).toEqual({
      checked: false,
      disabled: false,
    });
    expect(chosen.props.accessibilityState).toEqual({
      checked: true,
      disabled: false,
    });

    await fireEvent.press(open);
    await fireEvent.press(chosen);
    expect(onToggle.mock.calls).toEqual([[0], [1]]);
  });

  test("greys a season once the quota is spent, but not one already chosen", async () => {
    const onToggle = await show({ selected: [1], roomForOneMore: false });

    const open = checkbox("seerr.specials, seerr.number_episodes:8");
    expect(open).toHaveStyle({ opacity: SEERR_BLOCKED_OPACITY });
    expect(open.props.accessibilityState).toEqual({
      checked: false,
      disabled: true,
    });
    expect(
      checkbox("seerr.season_number:1, seerr.number_episodes:8"),
    ).toHaveStyle({ opacity: 1 });

    await fireEvent.press(open);
    expect(onToggle).not.toHaveBeenCalled();
  });

  test("offers nothing to choose on a server that takes whole series", async () => {
    const onToggle = await show({ choosable: false, selected: [0, 1] });

    const all = checkbox("seerr.specials, seerr.number_episodes:8");
    expect(all.props.accessibilityState).toEqual({
      checked: true,
      disabled: true,
    });
    await fireEvent.press(all);
    expect(onToggle).not.toHaveBeenCalled();
  });

  test("draws the secondary text in the sheet's own colour", async () => {
    await show({});

    expect(screen.getAllByText("seerr.number_episodes:8")[0]).toHaveStyle({
      color: SheetColors.secondaryText,
    });
  });
});
