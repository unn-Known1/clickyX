import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useMouseFollowActions,
  ACTION_EFFECT_META,
  MOUSE_ACTIONS,
  SUSTAINED_ACTIONS,
  MAX_ACTIVE_EFFECTS,
  AURA_TRIGGER_MS,
  isSustainedAction,
} from "./useMouseFollowActions";
import { DEFAULT_MOUSE_ANIMATION_SETTINGS } from "./useMouseAnimationSettings";

const cursorAction = vi.fn();
vi.mock("../utils/sounds", () => ({
  Sounds: { cursorAction: () => cursorAction() },
}));

function moveMouse(x: number, y: number) {
  window.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y }));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  // Discard (don't run) pending timers so they can't fire state updates outside act().
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("action metadata", () => {
  it("defines metadata for every action", () => {
    expect(MOUSE_ACTIONS).toHaveLength(9);
    for (const action of MOUSE_ACTIONS) {
      expect(ACTION_EFFECT_META[action]).toBeDefined();
      if (ACTION_EFFECT_META[action].kind === "burst") {
        expect(ACTION_EFFECT_META[action].durationMs).toBeGreaterThan(0);
      }
    }
  });

  it("marks exactly listen and think as sustained", () => {
    expect(SUSTAINED_ACTIONS.sort()).toEqual(["listen", "think"]);
    expect(isSustainedAction("listen")).toBe(true);
    expect(isSustainedAction("think")).toBe(true);
    expect(isSustainedAction("point")).toBe(false);
  });
});

describe("useMouseFollowActions", () => {
  it("starts idle with no effects or auras", () => {
    const { result } = renderHook(() => useMouseFollowActions());
    expect(result.current.effects).toEqual([]);
    expect(result.current.sustained).toEqual([]);
  });

  it("spawns a burst at the current pointer position", () => {
    const { result } = renderHook(() => useMouseFollowActions());

    act(() => moveMouse(320, 140));
    act(() => result.current.trigger("point"));

    expect(result.current.effects).toHaveLength(1);
    expect(result.current.effects[0]).toMatchObject({
      action: "point",
      x: 320,
      y: 140,
      durationMs: ACTION_EFFECT_META.point.durationMs,
    });
  });

  it("spawns at explicit coordinates when given", () => {
    const { result } = renderHook(() => useMouseFollowActions());

    act(() => moveMouse(10, 10));
    act(() => result.current.trigger("click", { x: 500, y: 250 }));

    expect(result.current.effects[0]).toMatchObject({ action: "click", x: 500, y: 250 });
  });

  it("expires burst effects after their animation duration", () => {
    const { result } = renderHook(() => useMouseFollowActions());

    act(() => result.current.trigger("select"));
    expect(result.current.effects).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(ACTION_EFFECT_META.select.durationMs + 1);
    });
    expect(result.current.effects).toHaveLength(0);
  });

  it("gives triggered aura actions a finite burst instead of an endless one", () => {
    const { result } = renderHook(() => useMouseFollowActions());

    act(() => result.current.trigger("think"));
    expect(result.current.effects[0]).toMatchObject({ action: "think", durationMs: AURA_TRIGGER_MS });

    act(() => {
      vi.advanceTimersByTime(AURA_TRIGGER_MS + 1);
    });
    expect(result.current.effects).toHaveLength(0);
  });

  it("toggles sustained auras idempotently", () => {
    const { result } = renderHook(() => useMouseFollowActions());

    act(() => result.current.setSustained("listen", true));
    act(() => result.current.setSustained("listen", true));
    act(() => result.current.setSustained("think", true));
    expect(result.current.sustained).toEqual(["listen", "think"]);

    act(() => result.current.setSustained("listen", false));
    expect(result.current.sustained).toEqual(["think"]);

    act(() => result.current.setSustained("think", false));
    expect(result.current.sustained).toEqual([]);
  });

  it("caps simultaneous effects at the configured maximum", () => {
    const { result } = renderHook(() => useMouseFollowActions());

    act(() => {
      for (let i = 0; i < MAX_ACTIVE_EFFECTS + 10; i++) result.current.trigger("draw");
    });

    expect(result.current.effects.length).toBeLessThanOrEqual(MAX_ACTIVE_EFFECTS);
    expect(result.current.effects.at(-1)?.action).toBe("draw");
  });

  it("clear removes every effect and aura and cancels pending timers", () => {
    const { result } = renderHook(() => useMouseFollowActions());

    act(() => result.current.trigger("speak"));
    act(() => result.current.setSustained("listen", true));
    expect(result.current.effects).toHaveLength(1);

    act(() => result.current.clear());
    expect(result.current.effects).toEqual([]);
    expect(result.current.sustained).toEqual([]);

    // Pending timers must not resurrect cleared effects.
    act(() => {
      vi.advanceTimersByTime(ACTION_EFFECT_META.speak.durationMs + 1);
    });
    expect(result.current.effects).toEqual([]);
  });

  it("cancels pending timers on unmount", () => {
    const { result, unmount } = renderHook(() => useMouseFollowActions());

    act(() => result.current.trigger("guide"));
    unmount();

    expect(() => vi.advanceTimersByTime(ACTION_EFFECT_META.guide.durationMs + 1)).not.toThrow();
  });
});

describe("settings-aware behaviour", () => {
  const base = DEFAULT_MOUSE_ANIMATION_SETTINGS;

  it("spawns nothing when the master switch is off", () => {
    const settings = { ...base, enabled: false };
    const { result } = renderHook(() => useMouseFollowActions(settings));
    act(() => result.current.trigger("point"));
    expect(result.current.effects).toHaveLength(0);
  });

  it("skips a disabled action but still animates the enabled ones", () => {
    const settings = { ...base, actions: { ...base.actions, click: false } };
    const { result } = renderHook(() => useMouseFollowActions(settings));

    act(() => result.current.trigger("click"));
    expect(result.current.effects).toHaveLength(0);

    act(() => result.current.trigger("point"));
    expect(result.current.effects).toHaveLength(1);
  });

  it("does not pin an aura for a disabled action", () => {
    const settings = { ...base, actions: { ...base.actions, listen: false } };
    const { result } = renderHook(() => useMouseFollowActions(settings));

    act(() => result.current.setSustained("listen", true));
    expect(result.current.sustained).toEqual([]);

    act(() => result.current.setSustained("think", true));
    expect(result.current.sustained).toEqual(["think"]);
  });

  it("honours a lower simultaneous-burst cap", () => {
    const settings = { ...base, maxEffects: 8 };
    const { result } = renderHook(() => useMouseFollowActions(settings));

    act(() => {
      for (let i = 0; i < 20; i++) result.current.trigger("draw");
    });
    expect(result.current.effects.length).toBeLessThanOrEqual(8);
  });

  it("plays the action sound only when sounds are enabled", () => {
    cursorAction.mockClear();

    const muted = renderHook(() => useMouseFollowActions({ ...base, sounds: false }));
    act(() => muted.result.current.trigger("point"));
    expect(cursorAction).not.toHaveBeenCalled();

    const loud = renderHook(() => useMouseFollowActions({ ...base, sounds: true }));
    act(() => loud.result.current.trigger("point"));
    expect(cursorAction).toHaveBeenCalledTimes(1);
  });
});
