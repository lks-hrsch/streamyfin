import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { toast } from "sonner-native";
import { Permission } from "@/utils/seerr/permissions";
import {
  MediaRequestStatus,
  MediaType,
  type TvDetails,
} from "@/utils/seerr/types";
import { SeerrPendingRequest } from "./SeerrPendingRequest";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { user?: string }) =>
      values?.user ? `${key}:${values.user}` : key,
  }),
}));

// Seerr's client and session are the boundary: who the user is, and the
// decision that reaches Seerr.
const mockApprove = jest.fn();
const mockDecline = jest.fn();
const mockRefresh = jest.fn();
let mockPermissions = Permission.MANAGE_REQUESTS;
jest.mock("@/hooks/useSeerr", () => ({
  useSeerr: () => ({
    seerrApi: { approveRequest: mockApprove, declineRequest: mockDecline },
    seerrUser: { id: 1, permissions: mockPermissions },
    refreshAfterRequest: mockRefresh,
  }),
}));

const gameOfThrones = {
  id: 1399,
  mediaInfo: {
    requests: [
      {
        id: 3,
        type: MediaType.TV,
        status: MediaRequestStatus.PENDING,
        requestedBy: { displayName: "streamyfin-test" },
      },
    ],
  },
} as unknown as TvDetails;

beforeEach(() => {
  mockPermissions = Permission.MANAGE_REQUESTS;
  mockApprove.mockReset().mockResolvedValue({});
  mockDecline.mockReset().mockResolvedValue({});
});

describe("SeerrPendingRequest", () => {
  it("lets a manager approve a waiting request, and reads the title again", async () => {
    const onDecided = jest.fn();
    await render(
      <SeerrPendingRequest details={gameOfThrones} onDecided={onDecided} />,
    );

    expect(screen.getByText("seerr.requested_by:streamyfin-test")).toBeTruthy();
    await fireEvent.press(screen.getByText("seerr.approve"));

    await waitFor(() => expect(onDecided).toHaveBeenCalled());
    expect(mockApprove).toHaveBeenCalledWith(3);
    expect(toast.success).toHaveBeenCalledWith("seerr.toasts.request_approved");
    // The detail query the library page shares with Seerr's page.
    expect(mockRefresh).toHaveBeenCalledWith({
      mediaType: MediaType.TV,
      mediaId: 1399,
    });
  });

  it("declines, and says so when Seerr refuses", async () => {
    mockDecline.mockRejectedValue(new Error("403"));
    await render(<SeerrPendingRequest details={gameOfThrones} />);
    await fireEvent.press(screen.getByText("seerr.decline"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "seerr.toasts.failed_to_decline_request",
      ),
    );
    expect(mockDecline).toHaveBeenCalledWith(3);
  });

  it("sends one decision for a double press", async () => {
    // Android TV can deliver one press twice; Seerr refuses the second, and
    // its error read as the approval failing.
    let resolve: (value: unknown) => void = () => {};
    mockApprove.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    await render(<SeerrPendingRequest details={gameOfThrones} />);
    await fireEvent.press(screen.getByText("seerr.approve"));
    await fireEvent.press(screen.getByText("seerr.approve"));
    resolve({});

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "seerr.toasts.request_approved",
      ),
    );
    expect(mockApprove).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows nothing to someone who may not decide", async () => {
    mockPermissions = Permission.REQUEST;
    await render(<SeerrPendingRequest details={gameOfThrones} />);

    expect(screen.queryByText("seerr.approve")).toBeNull();
  });

  it("shows nothing when no request waits", async () => {
    await render(
      <SeerrPendingRequest
        details={{ ...gameOfThrones, mediaInfo: { requests: [] } } as never}
      />,
    );

    expect(screen.queryByText("seerr.approve")).toBeNull();
  });
});
