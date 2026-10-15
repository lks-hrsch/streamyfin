import type { ActiveDownload } from "@/modules/background-downloader/src/BackgroundDownloader.types";

export type ReconcileAction =
  | { kind: "restore"; status: "queued" }
  | { kind: "restore"; status: "downloading" | "paused"; taskId: number }
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
  nativeTask,
  hasCompletedFile,
  hasPlainFileName,
  needsHeaders,
}: {
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
    // Native replaces the task when a paused download goes on, so the id it reports now is the
    // one to keep.
    return {
      kind: "restore",
      status: nativeTask.state === "paused" ? "paused" : "downloading",
      taskId: nativeTask.taskId,
    };
  }

  if (hasCompletedFile) {
    return { kind: "finalize" };
  }

  // Native lost it: an Android process death, or a failure reported while no JS was listening.
  // Dropping it here made the download vanish without a word, so it starts again; on iOS an
  // outage pauses it rather than failing it.
  return hasPlainFileName ? { kind: "re-enqueue" } : { kind: "drop" };
}
