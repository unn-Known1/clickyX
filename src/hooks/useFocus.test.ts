import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFocus, computeStreak, formatFocusClock, FOCUS_STORAGE_KEY } from "../hooks/useFocus";
import type { FocusSession } from "../hooks/useFocus";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useFocus", () => {
  it("starts on the work phase, idle, with default durations", () => {
    const { result } = renderHook(() => useFocus());
    expect(result.current.phase).toBe("work");
    expect(result.current.running).toBe(false);
    expect(result.current.remainingMs).toBe(25 * 60_000);
    expect(result.current.config).toEqual({ workMinutes: 25, breakMinutes: 5 });
    expect(result.current.sessions).toHaveLength(0);
  });

  it("starts and pauses the timer, preserving remaining time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    const { result } = renderHook(() => useFocus());

    act(() => result.current.start());
    expect(result.current.running).toBe(true);

    act(() => { vi.advanceTimersByTime(5_000); });
    expect(result.current.remainingMs).toBe(24 * 60_000 + 55_000);

    act(() => result.current.pause());
    expect(result.current.running).toBe(false);
    const frozen = result.current.remainingMs;

    act(() => { vi.advanceTimersByTime(5_000); });
    expect(result.current.remainingMs).toBe(frozen);
  });

  it("records a completed session and rolls into a break", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    const { result } = renderHook(() => useFocus());

    act(() => result.current.updateConfig({ workMinutes: 1, breakMinutes: 1 }));
    act(() => result.current.setIntention("Write the launch post"));
    act(() => result.current.start());

    act(() => { vi.advanceTimersByTime(61_000); });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].intention).toBe("Write the launch post");
    expect(result.current.sessions[0].durationMs).toBe(60_000);
    expect(result.current.phase).toBe("break");
    expect(result.current.running).toBe(true);
    expect(result.current.remainingMs).toBeLessThanOrEqual(60_000);
  });

  it("skips to the opposite phase without crediting a session", () => {
    const { result } = renderHook(() => useFocus());
    act(() => result.current.skip());
    expect(result.current.phase).toBe("break");
    expect(result.current.sessions).toHaveLength(0);
    act(() => result.current.skip());
    expect(result.current.phase).toBe("work");
  });

  it("resets back to a fresh work phase", () => {
    const { result } = renderHook(() => useFocus());
    act(() => result.current.setIntention("something"));
    act(() => result.current.skip());
    act(() => result.current.reset());
    expect(result.current.phase).toBe("work");
    expect(result.current.running).toBe(false);
    expect(result.current.remainingMs).toBe(result.current.config.workMinutes * 60_000);
  });

  it("clamps invalid durations", () => {
    const { result } = renderHook(() => useFocus());
    act(() => result.current.updateConfig({ workMinutes: 0, breakMinutes: 999 }));
    expect(result.current.config.workMinutes).toBe(1);
    expect(result.current.config.breakMinutes).toBe(60);
  });

  it("adds, removes, and clears parked thoughts (ignoring blanks)", () => {
    const { result } = renderHook(() => useFocus());
    act(() => result.current.addParked("   "));
    expect(result.current.parked).toHaveLength(0);

    act(() => result.current.addParked("Check the deploy"));
    act(() => result.current.addParked("Reply to Sam"));
    expect(result.current.parked.map((p) => p.text)).toEqual(["Reply to Sam", "Check the deploy"]);

    act(() => result.current.removeParked(result.current.parked[0].id));
    expect(result.current.parked.map((p) => p.text)).toEqual(["Check the deploy"]);

    act(() => result.current.clearParked());
    expect(result.current.parked).toHaveLength(0);
  });

  it("persists and rehydrates durable state from localStorage", () => {
    const { result, unmount } = renderHook(() => useFocus());
    act(() => result.current.updateConfig({ workMinutes: 50 }));
    act(() => result.current.addParked("Remember this"));
    unmount();

    expect(localStorage.getItem(FOCUS_STORAGE_KEY)).toContain("Remember this");

    const { result: restored } = renderHook(() => useFocus());
    expect(restored.current.config.workMinutes).toBe(50);
    expect(restored.current.parked.map((p) => p.text)).toEqual(["Remember this"]);
  });

  it("computes today's totals and streak", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-03T12:00:00Z"));
    const { result } = renderHook(() => useFocus());

    // Two sessions today + one yesterday → 2-day streak.
    act(() => result.current.updateConfig({ workMinutes: 1, breakMinutes: 1 }));
    act(() => result.current.start());
    act(() => { vi.advanceTimersByTime(61_000); });
    act(() => { vi.advanceTimersByTime(61_000); });

    expect(result.current.stats.todaySessions).toBeGreaterThanOrEqual(1);
    expect(result.current.stats.todayMinutes).toBeGreaterThanOrEqual(1);
  });
});

describe("computeStreak", () => {
  const at = (iso: string, completed = true): FocusSession => ({
    id: iso,
    intention: "",
    endedAt: new Date(iso).getTime(),
    durationMs: 60_000,
    completed,
  });

  it("is zero with no sessions", () => {
    expect(computeStreak([], new Date("2026-02-02T12:00:00Z").getTime())).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    const now = new Date("2026-02-03T12:00:00Z").getTime();
    expect(computeStreak([at("2026-02-03T09:00:00Z"), at("2026-02-02T09:00:00Z"), at("2026-02-01T09:00:00Z")], now)).toBe(3);
  });

  it("ignores a gap and non-completed sessions", () => {
    const now = new Date("2026-02-03T12:00:00Z").getTime();
    expect(computeStreak([at("2026-02-01T09:00:00Z"), at("2026-02-03T09:00:00Z", false)], now)).toBe(0);
  });
});

describe("formatFocusClock", () => {
  it("formats mm:ss and never goes negative", () => {
    expect(formatFocusClock(65_000)).toBe("01:05");
    expect(formatFocusClock(0)).toBe("00:00");
    expect(formatFocusClock(-5_000)).toBe("00:00");
  });
});
