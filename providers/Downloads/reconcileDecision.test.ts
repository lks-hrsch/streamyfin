import { MAX_LOST_DOWNLOAD_REENQUEUES } from "@/constants/Downloads";
import { decideReconcileAction } from "./reconcileDecision";

type Input = Parameters<typeof decideReconcileAction>[0];

const decide = (input: Partial<Input> & Pick<Input, "record">) =>
  decideReconcileAction({
    hasCompletedFile: false,
    hasPlainFileName: true,
    needsHeaders: false,
    ...input,
  });

describe("decideReconcileAction", () => {
  test("a download still queued natively is restored as queued", () => {
    expect(
      decide({
        record: { status: "queued" },
        nativeTask: { state: "queued", taskId: -1 },
      }),
    ).toEqual({ kind: "restore", status: "queued" });
  });

  test("a queued download that needs proxy headers is re-armed with them", () => {
    expect(
      decide({
        record: { status: "queued" },
        nativeTask: { state: "queued", taskId: -1 },
        needsHeaders: true,
      }),
    ).toEqual({ kind: "rearm-with-headers" });
  });

  test("a download native still owns is restored with its current task id", () => {
    expect(
      decide({
        record: { status: "downloading" },
        nativeTask: { state: "running", taskId: 42 },
      }),
    ).toEqual({ kind: "restore", status: "downloading", taskId: 42 });
  });

  test("a file on disk without a native task finished while JS was dead", () => {
    expect(
      decide({ record: { status: "downloading" }, hasCompletedFile: true }),
    ).toEqual({ kind: "finalize" });
  });

  test("a started download native lost is re-enqueued instead of dropped", () => {
    expect(decide({ record: { status: "downloading" } })).toEqual({
      kind: "re-enqueue",
    });
  });

  test("a queued download native lost is re-enqueued", () => {
    expect(decide({ record: { status: "queued", lostReenqueues: 1 } })).toEqual(
      { kind: "re-enqueue" },
    );
  });

  test("a lost download is dropped once its re-enqueue budget is spent", () => {
    expect(
      decide({
        record: {
          status: "downloading",
          lostReenqueues: MAX_LOST_DOWNLOAD_REENQUEUES,
        },
      }),
    ).toEqual({ kind: "drop" });
  });

  // A server-chosen name with a path in it is never written to again.
  test("a lost download stored under a name with a path is dropped", () => {
    expect(
      decide({ record: { status: "downloading" }, hasPlainFileName: false }),
    ).toEqual({ kind: "drop" });
  });
});
