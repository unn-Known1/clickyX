import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { listen } from "@tauri-apps/api/event";
import { useTauriEvent } from "./useTauriEvent";

describe("useTauriEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listen).mockResolvedValue(() => {});
  });

  it("subscribes to the named event on mount", async () => {
    const handler = vi.fn();
    renderHook(() => useTauriEvent<string>("my-event", handler));
    await waitFor(() => {
      expect(vi.mocked(listen)).toHaveBeenCalledWith("my-event", expect.any(Function));
    });
  });

  it("forwards events to the handler", async () => {
    const handler = vi.fn();
    renderHook(() => useTauriEvent<string>("my-event", handler));
    await waitFor(() => {
      expect(vi.mocked(listen)).toHaveBeenCalled();
    });
    const cb = vi.mocked(listen).mock.calls[0][1] as (e: unknown) => void;
    const payload = { event: "my-event", payload: "hi" };
    act(() => {
      cb(payload);
    });
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it("unsubscribes on unmount", async () => {
    const unlisten = vi.fn();
    vi.mocked(listen).mockResolvedValue(unlisten);
    const handler = vi.fn();
    const { unmount } = renderHook(() => useTauriEvent<string>("my-event", handler));
    await waitFor(() => {
      expect(vi.mocked(listen)).toHaveBeenCalled();
    });
    unmount();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("tears down a listener that resolves after unmount (no leak)", async () => {
    // H-4 regression: the old pattern missed cleanup when unmount happened
    // while `await listen(...)` was still pending.
    let resolveListen!: (u: () => void) => void;
    vi.mocked(listen).mockImplementation(
      () => new Promise((resolve) => { resolveListen = resolve; }),
    );
    const lateUnlisten = vi.fn();
    const handler = vi.fn();
    const { unmount } = renderHook(() => useTauriEvent<string>("my-event", handler));
    // Unmount BEFORE listen resolves.
    unmount();
    // Now the pending listen resolves — helper must call unlisten immediately.
    await act(async () => {
      resolveListen(lateUnlisten);
    });
    expect(lateUnlisten).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it("uses the latest handler without re-subscribing", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ h }) => useTauriEvent<string>("my-event", h), {
      initialProps: { h: first },
    });
    await waitFor(() => {
      expect(vi.mocked(listen)).toHaveBeenCalledTimes(1);
    });
    rerender({ h: second });
    expect(vi.mocked(listen)).toHaveBeenCalledTimes(1);
    const cb = vi.mocked(listen).mock.calls[0][1] as (e: unknown) => void;
    act(() => {
      cb({ event: "my-event", payload: "x" });
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
