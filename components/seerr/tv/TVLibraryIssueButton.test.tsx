import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { TVIssueModalState } from "@/utils/atoms/tvIssueModal";
import type { LibraryIssueTarget } from "@/utils/seerr/libraryIssue";
import { TVLibraryIssueButton } from "./TVLibraryIssueButton";

let mockTarget: LibraryIssueTarget | undefined;
const mockShowIssueModal = jest.fn<void, [NonNullable<TVIssueModalState>]>();
const mockRequestFocus = jest.fn();

jest.mock("@/hooks/useLibraryIssue", () => ({
  useLibraryIssue: () => mockTarget,
}));
jest.mock("@/hooks/useTVIssueModal", () => ({
  useTVIssueModal: () => ({ showIssueModal: mockShowIssueModal }),
}));
// The button is the focus engine's business. It stands in as a pressable
// with a label, and hands its handle a way to record being asked for focus.
jest.mock("@/components/tv/TVButton", () => {
  const { useEffect } = jest.requireActual("react");
  const { Pressable } = jest.requireActual("react-native");
  return {
    TVButton: ({
      onPress,
      refSetter,
    }: {
      onPress: () => void;
      refSetter?: (ref: unknown) => void;
    }) => {
      useEffect(() => {
        refSetter?.({ requestTVFocus: () => mockRequestFocus() });
      }, [refSetter]);
      return <Pressable accessibilityLabel='report' onPress={onPress} />;
    },
  };
});

const episode: BaseItemDto = { Id: "e1", Type: "Episode" };

describe("TVLibraryIssueButton", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockTarget = {
      mediaId: 7,
      title: "Breaking Bad",
      episode: { season: 2, episode: 5 },
    };
    mockShowIssueModal.mockClear();
    mockRequestFocus.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  test("draws nothing where Seerr takes no issue", async () => {
    mockTarget = undefined;
    await render(<TVLibraryIssueButton item={episode} />);
    expect(screen.queryByLabelText("report")).toBeNull();
  });

  test("opens the sheet for the title and the episode", async () => {
    await render(<TVLibraryIssueButton item={episode} />);
    await fireEvent.press(screen.getByLabelText("report"));
    expect(mockShowIssueModal).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaId: 7,
        title: "Breaking Bad",
        episode: { season: 2, episode: 5 },
      }),
    );
  });

  // A closed sheet left Android TV with nothing focused, and the next Back
  // then left the page.
  test("takes the focus back once the sheet has closed", async () => {
    await render(<TVLibraryIssueButton item={episode} />);
    await fireEvent.press(screen.getByLabelText("report"));
    await act(async () => jest.runAllTimers());
    expect(mockRequestFocus).not.toHaveBeenCalled();

    const { onClose } = mockShowIssueModal.mock.calls[0][0];
    await act(async () => onClose?.());
    expect(mockRequestFocus).not.toHaveBeenCalled();
    // Only once the sheet's route has left the screen.
    await act(async () => jest.runAllTimers());
    expect(mockRequestFocus).toHaveBeenCalledTimes(1);
  });
});
