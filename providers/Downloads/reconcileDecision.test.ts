import { decideReconcileAction } from "./reconcileDecision";

const decide = (input: Partial<Parameters<typeof decideReconcileAction>[0]>) =>
  decideReconcileAction({
    hasCompletedFile: false,
    hasPlainFileName: true,
    needsHeaders: false,
    ...input,
  });

describe("decideReconcileAction", () => {
  test("a download still queued natively is restored as queued", () => {
    expect(decide({ nativeTask: { state: "queued", taskId: -1 } })).toEqual({
      kind: "restore",
      status: "queued",
    });
  });

  test("a queued download that needs proxy headers is re-armed with them", () => {
    expect(
      decide({
        nativeTask: { state: "queued", taskId: -1 },
        needsHeaders: true,
      }),
    ).toEqual({ kind: "rearm-with-headers" });
  });

  test("a download native still owns is restored with its current task id", () => {
    expect(decide({ nativeTask: { state: "running", taskId: 42 } })).toEqual({
      kind: "restore",
      status: "downloading",
      taskId: 42,
    });
  });

  // A paused download has no transfer, but native keeps its place and its task id.
  test("a download paused natively is restored as paused", () => {
    expect(decide({ nativeTask: { state: "paused", taskId: 42 } })).toEqual({
      kind: "restore",
      status: "paused",
      taskId: 42,
    });
  });

  test("a file on disk without a native task finished while JS was dead", () => {
    expect(decide({ hasCompletedFile: true })).toEqual({ kind: "finalize" });
  });

  // Dropped, it vanished without a word; there is no cap on how often it starts again.
  test("a download native lost is re-enqueued", () => {
    expect(decide({})).toEqual({ kind: "re-enqueue" });
  });

  // A server-chosen name with a path in it is never written to again.
  test("a lost download stored under a name with a path is dropped", () => {
    expect(decide({ hasPlainFileName: false })).toEqual({ kind: "drop" });
  });
});
