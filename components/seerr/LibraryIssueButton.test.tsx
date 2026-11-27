import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import type { LibraryIssueTarget } from "@/utils/seerr/libraryIssue";
import { LibraryIssueButton } from "./LibraryIssueButton";

let mockTarget: LibraryIssueTarget | undefined;
const mockPresent = jest.fn();
const mockSheetProps = jest.fn();

jest.mock("@/hooks/useLibraryIssue", () => ({
  useLibraryIssue: () => mockTarget,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// The sheet has its own spec: here it only records what it was handed and
// whether it was asked to show.
jest.mock("@/components/seerr/SeerrIssueSheet", () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual("react");
  return {
    SeerrIssueSheet: forwardRef((props: unknown, ref: React.Ref<unknown>) => {
      mockSheetProps(props);
      useImperativeHandle(ref, () => ({ present: mockPresent }));
      return null;
    }),
  };
});

const episode: BaseItemDto = { Id: "e1", Type: "Episode" };

describe("LibraryIssueButton", () => {
  beforeEach(() => {
    mockTarget = {
      mediaId: 7,
      title: "Breaking Bad",
      episode: { season: 2, episode: 5, name: "Grilled" },
    };
    mockPresent.mockClear();
    mockSheetProps.mockClear();
  });

  test("draws nothing where Seerr takes no issue", async () => {
    mockTarget = undefined;
    await render(<LibraryIssueButton item={episode} />);
    expect(screen.queryByLabelText("seerr.report_issue_button")).toBeNull();
    expect(mockSheetProps).not.toHaveBeenCalled();
  });

  test("opens the sheet for the series, naming the episode", async () => {
    await render(<LibraryIssueButton item={episode} />);
    expect(mockSheetProps).toHaveBeenLastCalledWith({
      mediaId: 7,
      subject: "Breaking Bad · S02E05",
      episode: { season: 2, episode: 5, name: "Grilled" },
    });
    expect(mockPresent).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText("seerr.report_issue_button"));
    expect(mockPresent).toHaveBeenCalledTimes(1);
  });
});
