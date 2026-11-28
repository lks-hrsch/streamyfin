import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner-native";
import { useSeerr } from "@/hooks/useSeerr";
import { writeErrorLog } from "@/utils/log";
import { hasPermission, Permission } from "@/utils/seerr/permissions";
import {
  type MediaRequest,
  MediaRequestStatus,
  type MovieDetails,
  type TvDetails,
} from "@/utils/seerr/types";
import { createSubmission } from "@/utils/submission";

/**
 * The request of a title that waits for a decision, for those who may make
 * it (MANAGE_REQUESTS), with Seerr's approve and decline. Undefined for
 * anyone else, and when nothing waits. One for the Seerr pages and the
 * library pages alike: whichever page a title opens, the decision is there.
 */
export const useSeerrPendingRequest = (
  details: MovieDetails | TvDetails | undefined,
  /** Called once Seerr took the decision, for the page to read the title again. */
  onDecided?: () => void,
) => {
  const { t } = useTranslation();
  const { seerrApi, seerrUser, refreshAfterRequest } = useSeerr();
  // One decision at a time: a double tap, or the second press Android TV can
  // deliver in the same batch, would send it again, and Seerr's refusal of
  // the second would read as the first failing.
  const submission = useRef(createSubmission()).current;

  const canManage =
    !!seerrUser &&
    hasPermission(Permission.MANAGE_REQUESTS, seerrUser.permissions);
  const request = useMemo(
    () =>
      details?.mediaInfo?.requests?.find(
        (r: MediaRequest) => r.status === MediaRequestStatus.PENDING,
      ),
    [details],
  );

  const decide = useCallback(
    async (approve: boolean) => {
      if (!request?.id || !submission.start()) return;
      try {
        await (approve
          ? seerrApi?.approveRequest(request.id)
          : seerrApi?.declineRequest(request.id));
        toast.success(
          t(
            approve
              ? "seerr.toasts.request_approved"
              : "seerr.toasts.request_declined",
          ),
        );
        onDecided?.();
        // The cards and rows that show the request; the title itself comes
        // again through onDecided or, on a library page, with these.
        refreshAfterRequest(
          details && request.type
            ? { mediaType: request.type, mediaId: details.id }
            : undefined,
        );
      } catch (error) {
        toast.error(
          t(
            approve
              ? "seerr.toasts.failed_to_approve_request"
              : "seerr.toasts.failed_to_decline_request",
          ),
        );
        writeErrorLog(
          `Failed to ${approve ? "approve" : "decline"} Seerr request`,
          error,
        );
      } finally {
        submission.finish();
      }
    },
    [request, seerrApi, onDecided, refreshAfterRequest, details, t, submission],
  );
  const approve = useCallback(() => decide(true), [decide]);
  const decline = useCallback(() => decide(false), [decide]);

  if (!canManage || !request) return undefined;
  return {
    request,
    requestedBy:
      request.requestedBy?.displayName ||
      request.requestedBy?.username ||
      request.requestedBy?.jellyfinUsername ||
      t("seerr.unknown_user"),
    approve,
    decline,
  };
};
