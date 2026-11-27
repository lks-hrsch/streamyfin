import { fireEvent, render, screen } from "@testing-library/react-native";
import { IssueType } from "@/utils/seerr/types";
import { IssueTypePicker } from "./IssueTypePicker";

describe("IssueTypePicker", () => {
  test("shows every type as a radio, in the TV's order", async () => {
    await render(<IssueTypePicker value={undefined} onChange={() => {}} />);

    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(4);
    ["Video", "Audio", "Subtitle", "Other"].forEach((name, index) => {
      expect(options[index]).toHaveAccessibleName(name);
      // Nothing is chosen for the user: the sheet asks for a type.
      expect(options[index]).not.toBeSelected();
    });
  });

  test("marks the chosen type, and only that one", async () => {
    await render(
      <IssueTypePicker value={IssueType.AUDIO} onChange={() => {}} />,
    );

    expect(screen.getByRole("radio", { name: "Audio" })).toBeSelected();
    expect(screen.getByRole("radio", { name: "Video" })).not.toBeSelected();
    expect(screen.getByRole("radio", { name: "Subtitle" })).not.toBeSelected();
    expect(screen.getByRole("radio", { name: "Other" })).not.toBeSelected();
  });

  test("reports the type a tap chose, as Seerr numbers it", async () => {
    const onChange = jest.fn();
    await render(
      <IssueTypePicker value={IssueType.AUDIO} onChange={onChange} />,
    );

    await fireEvent.press(screen.getByRole("radio", { name: "Other" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(IssueType.OTHER);
  });
});
