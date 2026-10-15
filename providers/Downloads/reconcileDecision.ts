import { MAX_LOST_DOWNLOAD_REENQUEUES } from "@/constants/Downloads";
import type { ActiveDownload } from "@/modules/background-downloader/src/BackgroundDownloader.types";
import type { PendingDownload } from "./pendingDownloads";

export type ReconcileAction =
  | { kind: "restore"; status: "queued" }
  | { kind: "restore"; status: "downloading"; taskId: number }
  | { kind: "rearm-with-headers" }
  | { kind: "finalize" }
  | { kind: "re-enqueue" }
  | { kind: "drop" };

/**
 * What to do with one pending record left behind by a previous JS runtime, given what native and
 * the disk say about it. Kept free of side effects so the policy can be tested on its own; see
 * `useDownloadReconciliation` for how each action is carried out.
 */
export function decideReconcileAction({
  record,
  nativeTask,
  hasCompletedFile,
  hasPlainFileName,
  needsHeaders,
}: {
  record: Pick<PendingDownload, "status" | "lostReenqueues">;
  nativeTask?: Pick<ActiveDownload, "state" | "taskId">;
  hasCompletedFile: boolean;
  /** False for a stored file name carrying a path, which is never written to again. */
  hasPlainFileName: boolean;
  needsHeaders: boolean;
}): ReconcileAction {
  if (nativeTask?.state === "queued") {
    // Custom proxy headers don't survive native queue persistence, so a download that needs them
    // has to be re-armed from here or it would start and get rejected by the gateway.
    return needsHeaders
      ? { kind: "rearm-with-headers" }
      : { kind: "restore", status: "queued" };
  }

  if (nativeTask) {
    // Native may have replaced the task on a retry, so the id it reports now is the one to keep.
    return {
      kind: "restore",
      status: "downloading",
      taskId: nativeTask.taskId,
    };
  }

  if (hasCompletedFile) {
    return { kind: "finalize" };
  }

  // Native lost it: an Android process death, or a failure reported while no JS was listening.
  // Dropping it here used to make the download vanish without a word, so it gets restarted, up to
  // a cap so one that fails every time does not return on every launch.
  if (
    hasPlainFileName &&
    (record.lostReenqueues ?? 0) < MAX_LOST_DOWNLOAD_REENQUEUES
  ) {
    return { kind: "re-enqueue" };
  }

  return { kind: "drop" };
}
