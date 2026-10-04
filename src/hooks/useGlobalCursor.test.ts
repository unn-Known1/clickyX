import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { CURSOR_POLL_MS, MAX_POLL_FAILURES, useGlobalCursor } from "./useGlobalCursor";

const cursorPosition = vi.fn(async (_args?: unknown) => ({ x: 0, y: 0 }));
const outerPosition = vi.fn(async () => ({ x: 0, y: 0 }));

vi.mock("@tauri-apps/api/window", () => ({
  cursorPosition: (args?: unknown) => cursorPosition(args),
  getCurrentWindow: () => ({ outerPosition }),
}));

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  cursorPosition.mockReset().mockResolvedValue({ x: 0, y: 0 });
  outerPosition.mockReset().mockResolvedValue({ x: 0, y: 0 });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("useGlobalCursor", () => {
  it("tracks native mousemove in window-local coordinates", () => {
    const { result } = renderHook(() => useGlobalCursor(false));
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 320, clientY: 140 }));
    });
    expect(result.current.current).toEqual({ x: 320, y: 140 });
  });

  it("does not poll the OS while inactive", () => {
    renderHook(() => useGlobalCursor(false));
    act(() => {
      vi.advanceTimersByTime(CURSOR_POLL_MS * 5);
    });
    expect(cursorPosition).not.toHaveBeenCalled();
  });

  it("falls back to cursorPosition() and converts global physical -> window-local CSS", async () => {
    // Global physical cursor 1000,500; window origin (physical) 100,200 → local 900,300 physical.
    cursorPosition.mockResolvedValue({ x: 1000, y: 500 });
    outerPosition.mockResolvedValue({ x: 100, y: 200 });
    const dpr = window.devicePixelRatio || 1;

    const { result } = renderHook(() => useGlobalCursor(true));
    await act(async () => {
      vi.advanceTimersByTime(CURSOR_POLL_MS);
      await flush();
    });

    expect(cursorPosition).toHaveBeenCalled();
    expect(result.current.current.x).toBeCloseTo(900 / dpr, 5);
    expect(result.current.current.y).toBeCloseTo(300 / dpr, 5);
  });

  it("stops polling after repeated failures without throwing", async () => {
    cursorPosition.mockRejectedValue(new Error("not permitted"));
    renderHook(() => useGlobalCursor(true));

    await act(async () => {
      for (let i = 0; i < MAX_POLL_FAILURES + 2; i++) {
        vi.advanceTimersByTime(CURSOR_POLL_MS);
        await flush();
      }
    });

    expect(cursorPosition.mock.calls.length).toBe(MAX_POLL_FAILURES);
  });
});
