import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  BURST_SIZE_PX,
  DEFAULT_MOUSE_ANIMATION_SETTINGS,
  FOLLOW_EASE,
  MOUSE_ANIMATION_STORAGE_KEY,
  TRAIL_DOTS,
  normalizeMouseAnimationSettings,
  useMouseAnimationSettings,
} from "./useMouseAnimationSettings";

function readStored() {
  return window.localStorage.getItem(MOUSE_ANIMATION_STORAGE_KEY);
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("settings tables", () => {
  it("exposes a dot count, follow ease and burst size per option", () => {
    expect(TRAIL_DOTS.off).toBe(0);
    expect(TRAIL_DOTS.long).toBeGreaterThan(TRAIL_DOTS.short);
    expect(FOLLOW_EASE.instant).toBe(1);
    expect(FOLLOW_EASE.smooth).toBeGreaterThan(FOLLOW_EASE.lazy);
    expect(BURST_SIZE_PX.small).toBeLessThan(BURST_SIZE_PX.large);
  });

  it("defaults every action to enabled", () => {
    const actions = DEFAULT_MOUSE_ANIMATION_SETTINGS.actions;
    expect(Object.keys(actions)).toHaveLength(9);
    expect(Object.values(actions).every(Boolean)).toBe(true);
  });
});

describe("normalizeMouseAnimationSettings", () => {
  it("falls back to defaults for a missing or malformed blob", () => {
    expect(normalizeMouseAnimationSettings(null)).toEqual(DEFAULT_MOUSE_ANIMATION_SETTINGS);
    expect(normalizeMouseAnimationSettings("nonsense")).toEqual(DEFAULT_MOUSE_ANIMATION_SETTINGS);
  });

  it("rejects unknown enum values but keeps valid ones", () => {
    const out = normalizeMouseAnimationSettings({ trail: "sideways", follow: "instant" });
    expect(out.trail).toBe("off");
    expect(out.follow).toBe("instant");
  });

  it("only accepts a valid hex accent", () => {
    expect(normalizeMouseAnimationSettings({ accent: "#ff00aa" }).accent).toBe("#ff00aa");
    expect(normalizeMouseAnimationSettings({ accent: "red" }).accent).toBe("");
    expect(normalizeMouseAnimationSettings({ accent: 123 }).accent).toBe("");
  });

  it("keeps per-action booleans and ignores non-boolean entries", () => {
    const out = normalizeMouseAnimationSettings({ actions: { click: false, draw: "yes" } });
    expect(out.actions.click).toBe(false);
    expect(out.actions.draw).toBe(true);
    expect(out.actions.speak).toBe(true);
  });

  it("snaps maxEffects to an allowed option", () => {
    expect(normalizeMouseAnimationSettings({ maxEffects: 16 }).maxEffects).toBe(16);
    expect(normalizeMouseAnimationSettings({ maxEffects: 999 }).maxEffects).toBe(24);
  });
});

describe("useMouseAnimationSettings", () => {
  it("starts from defaults with empty storage", () => {
    const { result } = renderHook(() => useMouseAnimationSettings());
    expect(result.current.settings).toEqual(DEFAULT_MOUSE_ANIMATION_SETTINGS);
  });

  it("persists updates to localStorage", () => {
    const { result } = renderHook(() => useMouseAnimationSettings());
    act(() => result.current.update({ trail: "long", burstScale: "large" }));

    expect(result.current.settings.trail).toBe("long");
    const stored = JSON.parse(readStored()!);
    expect(stored.trail).toBe("long");
    expect(stored.burstScale).toBe("large");
  });

  it("rehydrates persisted settings on mount", () => {
    window.localStorage.setItem(
      MOUSE_ANIMATION_STORAGE_KEY,
      JSON.stringify({ trail: "medium", halo: false, accent: "#123456" }),
    );
    const { result } = renderHook(() => useMouseAnimationSettings());
    expect(result.current.settings.trail).toBe("medium");
    expect(result.current.settings.halo).toBe(false);
    expect(result.current.settings.accent).toBe("#123456");
    // untouched keys still default
    expect(result.current.settings.follow).toBe("smooth");
  });

  it("toggles a single action without disturbing the others", () => {
    const { result } = renderHook(() => useMouseAnimationSettings());
    act(() => result.current.setActionEnabled("speak", false));
    expect(result.current.settings.actions.speak).toBe(false);
    expect(result.current.settings.actions.click).toBe(true);
  });

  it("resets every setting back to defaults", () => {
    const { result } = renderHook(() => useMouseAnimationSettings());
    act(() => result.current.update({ enabled: false, trail: "long" }));
    act(() => result.current.reset());
    expect(result.current.settings).toEqual(DEFAULT_MOUSE_ANIMATION_SETTINGS);
  });
});