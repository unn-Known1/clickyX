import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  ANIMATION_PRESETS,
  BURST_SIZE_PX,
  DEFAULT_MOUSE_ANIMATION_SETTINGS,
  FOLLOW_EASE,
  MOUSE_ANIMATION_STORAGE_KEY,
  TRAIL_DOTS,
  matchPreset,
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
    expect(Object.keys(actions)).toHaveLength(12);
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

describe("animation presets", () => {
  it("applies a preset's presentation values", () => {
    const { result } = renderHook(() => useMouseAnimationSettings());
    act(() => result.current.applyPreset("expressive"));

    for (const [key, value] of Object.entries(ANIMATION_PRESETS.expressive)) {
      expect(result.current.settings[key as "trail"]).toBe(value);
    }
    expect(result.current.settings.preset).toBe("expressive");
    expect(matchPreset(result.current.settings)).toBe("expressive");
  });

  it("the 'off' preset disables animations without touching other settings", () => {
    const { result } = renderHook(() => useMouseAnimationSettings());
    act(() => result.current.update({ trail: "long", accent: "#abcdef" }));
    act(() => result.current.applyPreset("off"));

    expect(result.current.settings.enabled).toBe(false);
    // A preset is a starting point, not a reset.
    expect(result.current.settings.trail).toBe("long");
    expect(result.current.settings.accent).toBe("#abcdef");
  });

  it("preserves per-action toggles when a preset is applied", () => {
    const { result } = renderHook(() => useMouseAnimationSettings());
    act(() => result.current.setActionEnabled("scroll", false));
    act(() => result.current.applyPreset("balanced"));
    expect(result.current.settings.actions.scroll).toBe(false);
  });

  it("knocks the label to custom once a tunable is edited away", () => {
    const { result } = renderHook(() => useMouseAnimationSettings());
    act(() => result.current.applyPreset("balanced"));
    expect(result.current.settings.preset).toBe("balanced");

    act(() => result.current.update({ trail: "long" }));
    expect(result.current.settings.preset).toBe("custom");
    expect(matchPreset(result.current.settings)).toBe("custom");
  });

  it("keeps the preset label when only excluded fields change", () => {
    const { result } = renderHook(() => useMouseAnimationSettings());
    act(() => result.current.applyPreset("balanced"));

    // Neither the accent nor per-action toggles take part in the comparison,
    // so tweaking them must not falsely report a custom configuration.
    act(() => result.current.update({ accent: "#ff8800" }));
    expect(matchPreset(result.current.settings)).toBe("balanced");
    act(() => result.current.setActionEnabled("drag", false));
    expect(matchPreset(result.current.settings)).toBe("balanced");
  });

  it("normalises a bogus persisted preset back to custom", () => {
    const parsed = normalizeMouseAnimationSettings({ preset: "wildly-invalid" });
    expect(parsed.preset).toBe("custom");
  });

  it("reports the off preset while animations are disabled", () => {
    const { result } = renderHook(() => useMouseAnimationSettings());
    act(() => result.current.applyPreset("off"));
    // "off" is not a value bundle, so matchPreset must special-case it —
    // otherwise the picker shows "Custom" the moment you choose Off.
    expect(matchPreset(result.current.settings)).toBe("off");

    // Re-enabling by hand is a genuine customisation, so it drops to Custom.
    act(() => result.current.update({ enabled: true }));
    expect(matchPreset(result.current.settings)).toBe("custom");
  });
});