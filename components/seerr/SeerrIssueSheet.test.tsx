import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import { IssueType } from "@/utils/seerr/types";
import { SeerrIssueSheet } from "./SeerrIssueSheet";

const mockSubmitIssue = jest.fn();
const mockClose = jest.fn();

jest.mock("@/hooks/useSeerr", () => ({
  useSeerr: () => ({ seerrApi: { submitIssue: mockSubmitIssue } }),
}));
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));
jest.mock("@/utils/log", () => ({ writeErrorLog: jest.fn() }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// The sheet is always open here: what is under test is what submitting it
// sends, not how it is presented.
jest.mock("@gorhom/bottom-sheet", () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual("react");
  const { TextInput } = jest.requireActual("react-native");
  return {
    BottomSheetModal: forwardRef(
      (
        { children }: { children: React.ReactNode },
        ref: React.Ref<unknown>,
      ) => {
        useImperativeHandle(ref, () => ({
          present() {},
          close: mockClose,
        }));
        return children;
      },
    ),
    BottomSheetView: ({ children }: { children: React.ReactNode }) => children,
    BottomSheetBackdrop: () => null,
    BottomSheetTextInput: TextInput,
  };
});

const fillIn = async (type: string, message: string) => {
  await fireEvent.press(screen.getByRole("radio", { name: type }));
  await fireEvent.changeText(
    screen.getByPlaceholderText("seerr.issue_details"),
    message,
  );
};
const submit = () => fireEvent.press(screen.getByText("seerr.submit_button"));

describe("SeerrIssueSheet", () => {
  beforeEach(() => {
    mockSubmitIssue.mockReset().mockResolvedValue({ id: 1 });
    mockClose.mockClear();
  });

  // The types used to sit in a dropdown whose iOS menu nested them one level
  // deeper, under a lone "Types" row: two taps before one could be chosen.
  test("offers every issue type at once, one tap to choose", async () => {
    await render(<SeerrIssueSheet mediaId={42} />);

    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(4);
    // The TV's order: the two sheets must not drift apart.
    ["Video", "Audio", "Subtitle", "Other"].forEach((name, index) => {
      expect(options[index]).toHaveAccessibleName(name);
      expect(options[index]).not.toBeSelected();
    });

    await fireEvent.press(screen.getByRole("radio", { name: "Subtitle" }));
    expect(screen.getByRole("radio", { name: "Subtitle" })).toBeSelected();
    expect(screen.getByRole("radio", { name: "Video" })).not.toBeSelected();

    await fireEvent.changeText(
      screen.getByPlaceholderText("seerr.issue_details"),
      "Out of sync",
    );
    await submit();
    expect(mockSubmitIssue).toHaveBeenCalledWith(
      42,
      IssueType.SUBTITLES,
      "Out of sync",
      undefined,
    );
  });

  test("files the issue against the title and closes", async () => {
    await render(<SeerrIssueSheet mediaId={42} />);
    await fillIn("Audio", "No sound");
    await submit();

    // A movie or a whole series names no season: the body is as before.
    expect(mockSubmitIssue).toHaveBeenCalledWith(
      42,
      IssueType.AUDIO,
      "No sound",
      undefined,
    );
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  test("names the episode, and shows what is reported", async () => {
    await render(
      <SeerrIssueSheet
        mediaId={7}
        subject='Breaking Bad · S02E05'
        episode={{ season: 2, episode: 5, name: "Grilled" }}
      />,
    );
    expect(screen.getByText("Breaking Bad · S02E05")).toBeTruthy();
    await fillIn("Video", "Green frames");
    await submit();

    expect(mockSubmitIssue).toHaveBeenCalledWith(
      7,
      IssueType.VIDEO,
      "Green frames",
      { season: 2, episode: 5 },
    );
  });

  test("a second tap while the first is on its way files it once", async () => {
    let answer: (value: unknown) => void = () => {};
    mockSubmitIssue.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    await render(<SeerrIssueSheet mediaId={42} />);
    await fillIn("Audio", "No sound");
    // The second before the first answer is in.
    await submit();
    await submit();
    await act(async () => answer({ id: 1 }));

    expect(mockSubmitIssue).toHaveBeenCalledTimes(1);
  });

  test("sends nothing without a type and a message", async () => {
    await render(<SeerrIssueSheet mediaId={42} />);
    await submit();
    await fireEvent.press(screen.getByRole("radio", { name: "Audio" }));
    await submit();

    expect(mockSubmitIssue).not.toHaveBeenCalled();
  });

  // A title Seerr has never seen has no record to file against, and the
  // Seerr page sends nothing before it knows which title it shows.
  test("sends nothing without a title to file it against", async () => {
    const view = await render(<SeerrIssueSheet mediaId={undefined} />);
    await fillIn("Audio", "No sound");
    await submit();

    await view.rerender(<SeerrIssueSheet mediaId={42} ready={false} />);
    await submit();

    expect(mockSubmitIssue).not.toHaveBeenCalled();
  });
});
