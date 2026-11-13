import { fireEvent, render, screen } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import { TVSearchSortButtons } from "@/components/search/TVSearchSortButtons";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// The real button pulls the TV focus animation in; the row only needs
// something to press that shows its label and value.
const MockFilterButton = (props: {
  label: string;
  value: string;
  onPress: () => void;
}) => (
  <Pressable onPress={props.onPress}>
    <Text>{`${props.label}|${props.value}`}</Text>
  </Pressable>
);
jest.mock("@/components/tv/TVFilterButton", () => ({
  TVFilterButton: (props: Parameters<typeof MockFilterButton>[0]) =>
    MockFilterButton(props),
}));

const onSortPress = jest.fn();
const onOrderPress = jest.fn();
const sort = {
  sortValue: "Name",
  onSortPress,
  orderValue: "Ascending",
  onOrderPress,
};

describe("TVSearchSortButtons", () => {
  beforeEach(() => {
    onSortPress.mockClear();
    onOrderPress.mockClear();
  });

  // As the TV library page does: one button for the sort, one for the order,
  // each opening its sheet.
  test("shows the sort and the order, each opening its sheet", async () => {
    await render(<TVSearchSortButtons sort={sort} />);

    await fireEvent.press(screen.getByText("library.filters.sort_by|Name"));
    expect(onSortPress).toHaveBeenCalled();
    await fireEvent.press(
      screen.getByText("library.filters.sort_order|Ascending"),
    );
    expect(onOrderPress).toHaveBeenCalled();
  });

  // The search has one set of results now: no Library and Discover tabs
  // beside the sort.
  test("shows no tabs beside the sort", async () => {
    await render(<TVSearchSortButtons sort={sort} />);

    expect(screen.queryByText(/search\.(library|discover)/)).toBeNull();
  });

  test("leaves the order out for a sort that has none", async () => {
    await render(
      <TVSearchSortButtons sort={{ ...sort, orderValue: undefined }} />,
    );

    expect(screen.getByText("library.filters.sort_by|Name")).toBeTruthy();
    expect(screen.queryByText(/library\.filters\.sort_order/)).toBeNull();
  });
});
