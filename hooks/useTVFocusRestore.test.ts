import { act, renderHook } from "@testing-library/react-native";
import type { ViewInstance } from "react-native";
import { TVSheetTiming } from "@/constants/TVSheet";
import { useTVFocusRestore } from "./useTVFocusRestore";

/** A view that records being asked for the focus. */
const focusable = () => {
  const requestTVFocus = jest.fn();
  return {
    view: { requestTVFocus } as unknown as ViewInstance,
    requestTVFocus,
  };
};

const setup = async () => {
  const hook = await renderHook(() => useTVFocusRestore());
  return hook;
};

describe("useTVFocusRestore", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  // Android TV leaves nothing focused once a sheet's route is gone, and the
  // next Back then leaves the page: the page asks for the focus, but only
  // once the route has left the screen.
  test("hands the focus back once the sheet's route has left", async () => {
    const button = focusable();
    const { result } = await setup();

    await act(async () => {
      result.current(() => button.view);
    });
    await act(async () =>
      jest.advanceTimersByTime(TVSheetTiming.focusRestoreMs - 1),
    );
    expect(button.requestTVFocus).not.toHaveBeenCalled();

    await act(async () => jest.advanceTimersByTime(1));
    expect(button.requestTVFocus).toHaveBeenCalledTimes(1);
  });

  test("asks for the view that is there when the wait is over", async () => {
    const button = focusable();
    const fallback = focusable();
    let target: ViewInstance | null = button.view;
    const { result } = await setup();

    await act(async () => {
      result.current(() => target ?? fallback.view);
    });
    // The request left nothing to ask for, and its button went with it.
    target = null;
    await act(async () => jest.runAllTimers());

    expect(button.requestTVFocus).not.toHaveBeenCalled();
    expect(fallback.requestTVFocus).toHaveBeenCalledTimes(1);
  });

  test("asks once when a second sheet closes before the first wait is over", async () => {
    const first = focusable();
    const second = focusable();
    const { result } = await setup();

    await act(async () => {
      result.current(() => first.view);
      result.current(() => second.view);
    });
    await act(async () => jest.runAllTimers());

    expect(first.requestTVFocus).not.toHaveBeenCalled();
    expect(second.requestTVFocus).toHaveBeenCalledTimes(1);
  });

  test("asks nothing once cancelled", async () => {
    const button = focusable();
    const { result } = await setup();

    await act(async () => {
      const cancel = result.current(() => button.view);
      cancel();
    });
    await act(async () => jest.runAllTimers());

    expect(button.requestTVFocus).not.toHaveBeenCalled();
  });

  test("asks nothing once the page is gone", async () => {
    const button = focusable();
    const { result, unmount } = await setup();

    await act(async () => {
      result.current(() => button.view);
    });
    await unmount();
    await act(async () => jest.runAllTimers());

    expect(button.requestTVFocus).not.toHaveBeenCalled();
  });

  test("keeps one function across renders, for an effect to depend on", async () => {
    const { result, rerender } = await setup();
    const first = result.current;
    await rerender({});

    expect(result.current).toBe(first);
  });
});
