import { useCallback, useEffect, useRef, useState } from "react";
import { useGlobalCursor, type PointerPosition } from "./useGlobalCursor";
import { Sounds } from "../utils/sounds";
// Type-only import: erased at compile time, so this does not create a runtime
// cycle with useMouseAnimationSettings (which imports MOUSE_ACTIONS from here).
import type { MouseAnimationSettings } from "./useMouseAnimationSettings";

export type { PointerPosition };

/**
 * Distinct overlay actions that each get their own mouse-follow animation.
 * Actions are surfaced by the existing overlay event stream (see OverlayApp).
 */
export type MouseAction =
  | "point" // guiding the user's attention to a target
  | "click" // an AI-driven click
  | "select" // a region/rect selection
  | "highlight" // a highlighted region
  | "draw" // a scribble path
  | "speak" // voice output / caption
  | "guide" // an arrow/curve guidance shape
  | "typing" // keyboard input (type mode / injected text)
  | "drag" // a drag gesture in progress
  | "scroll" // a scroll gesture
  | "listen" // microphone capture (sustained)
  | "think"; // model processing (sustained)

export type CursorEffectKind = "burst" | "aura" | "ghost";

export interface ActionEffectMeta {
  /**
   * How the layer renders this action:
   * - `burst` — a self-expiring one-shot at the spawn point
   * - `aura` — a loop pinned to the pointer while active
   * - `ghost` — a lagging copy of the pointer (a held gesture)
   */
  kind: CursorEffectKind;
  /** Lifetime of a burst in ms (0 for auras and ghosts). */
  durationMs: number;
}

/**
 * Direction carried by a directional effect. Lives on the effect rather than
 * the action so one `scroll` action can ripple in all four directions.
 */
export type ScrollDirection = "up" | "down" | "left" | "right";

export const SCROLL_DIRECTIONS: ScrollDirection[] = ["up", "down", "left", "right"];

/** Per-action animation metadata — the single source of truth for the layer. */
export const ACTION_EFFECT_META: Record<MouseAction, ActionEffectMeta> = {
  point: { kind: "burst", durationMs: 900 },
  click: { kind: "burst", durationMs: 650 },
  select: { kind: "burst", durationMs: 800 },
  highlight: { kind: "burst", durationMs: 1100 },
  draw: { kind: "burst", durationMs: 800 },
  speak: { kind: "burst", durationMs: 1200 },
  guide: { kind: "burst", durationMs: 900 },
  typing: { kind: "burst", durationMs: 900 },
  // A drag is a held gesture, so it renders as a ghost that trails the pointer
  // rather than a self-expiring burst.
  drag: { kind: "ghost", durationMs: 0 },
  scroll: { kind: "burst", durationMs: 750 },
  listen: { kind: "aura", durationMs: 0 },
  think: { kind: "aura", durationMs: 0 },
};

export const MOUSE_ACTIONS = Object.keys(ACTION_EFFECT_META) as MouseAction[];

/** Every sustained (aura or ghost) action, in a stable order. */
export const SUSTAINED_ACTIONS: MouseAction[] = MOUSE_ACTIONS.filter(
  (a) => ACTION_EFFECT_META[a].kind !== "burst",
);

/** Upper bound on simultaneous burst effects, so a fast event stream can't grow unbounded. */
export const MAX_ACTIVE_EFFECTS = 24;

/** Burst lifetime used when `trigger` is called for a sustained (aura) action. */
export const AURA_TRIGGER_MS = 800;

export function isSustainedAction(action: MouseAction): boolean {
  // Matches SUSTAINED_ACTIONS: anything that is not a self-expiring burst.
  return ACTION_EFFECT_META[action].kind !== "burst";
}

export interface CursorEffect {
  id: number;
  action: MouseAction;
  /** Viewport coordinates the burst was spawned at. */
  x: number;
  y: number;
  durationMs: number;
  /** Set for directional actions (scroll); defaults to "down". */
  direction?: ScrollDirection;
}

export interface UseMouseFollowActionsResult {
  /** Currently animating burst effects (each self-expires). */
  effects: CursorEffect[];
  /** Actions whose aura is pinned to the pointer while active. */
  sustained: MouseAction[];
  /** Live pointer position (shared with the render layer for the follow loop). */
  pointerRef: { current: PointerPosition };
  /** Sample the OS cursor immediately, for effects triggered by input commands. */
  refreshPointer: () => Promise<PointerPosition | null>;
  /** Spawn a burst; defaults to the current pointer position. */
  trigger: (
    action: MouseAction,
    at?: PointerPosition,
    direction?: ScrollDirection,
  ) => void;
  /** Toggle a sustained (aura) action on/off. */
  setSustained: (action: MouseAction, active: boolean) => void;
  /** Remove every effect and aura (used by clear-overlays). */
  clear: () => void;
}

/**
 * Tracks the real cursor and turns overlay "actions" into short-lived
 * mouse-follow animations. Pointer movement is kept in a ref (never state) so
 * the overlay tree doesn't re-render on every mouse move — the visual layer
 * owns its own RAF loop, mirroring the PetLayer isolation strategy.
 *
 * `settings` is optional; when omitted every action is enabled with the
 * default burst cap and no sound, which is the pre-settings behaviour.
 *
 * `externalPointer` lets a caller share one cursor poller between several
 * consumers (the overlay's cursor layer and the pet sprite both follow the
 * pointer). Polling costs an IPC round-trip, so one shared ref is cheaper than
 * one poller per consumer — and guarantees they agree on the position.
 * When omitted, this hook owns a private poller as before.
 */
export function useMouseFollowActions(
  settings?: MouseAnimationSettings,
  externalPointer?: { current: PointerPosition },
  keepCursorActive = false,
): UseMouseFollowActionsResult {
  const [effects, setEffects] = useState<CursorEffect[]>([]);
  const [sustained, setSustainedState] = useState<MouseAction[]>([]);

  // The layer is "active" whenever it has something to draw; only then do we pay
  // for cursor-position polling.
  const active = keepCursorActive || effects.length > 0 || sustained.length > 0;
  const ownPointer = useGlobalCursor(active && !externalPointer);
  const pointerRef = externalPointer ?? ownPointer;
  const refreshPointer = useCallback(async () => {
    const position = await ownPointer.refresh();
    if (position && externalPointer) externalPointer.current = position;
    return position;
  }, [ownPointer, externalPointer]);
  const nextIdRef = useRef(1);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const enabled = settings ? settings.enabled : true;
  const actionEnabled = settings?.actions;
  const maxEffects = settings ? settings.maxEffects : MAX_ACTIVE_EFFECTS;
  const sounds = settings ? settings.sounds : false;

  const isEnabled = useCallback(
    (action: MouseAction) => enabled && actionEnabled?.[action] !== false,
    [enabled, actionEnabled],
  );

  const trigger = useCallback(
    (
      action: MouseAction,
      at?: PointerPosition,
      direction: ScrollDirection = "down",
    ) => {
      if (!isEnabled(action)) return;
      const meta = ACTION_EFFECT_META[action];
      const pos = at ?? pointerRef.current;
      const durationMs = meta.kind === "burst" ? meta.durationMs : AURA_TRIGGER_MS;
      const id = nextIdRef.current++;
      const effect: CursorEffect = {
        id,
        action,
        x: pos.x,
        y: pos.y,
        durationMs,
        ...(action === "scroll" ? { direction } : {}),
      };

      setEffects((prev) => [...prev.slice(-(maxEffects - 1)), effect]);

      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setEffects((prev) => prev.filter((e) => e.id !== id));
      }, durationMs);
      timersRef.current.set(id, timer);

      if (sounds) void Sounds.cursorAction();
    },
    [isEnabled, maxEffects, pointerRef, sounds],
  );

  const setSustained = useCallback(
    (action: MouseAction, active: boolean) => {
      // A disabled action must not keep (or gain) a sustained aura.
      const want = active && isEnabled(action);
      setSustainedState((prev) => {
        const has = prev.includes(action);
        if (want && !has) return [...prev, action];
        if (!want && has) return prev.filter((a) => a !== action);
        return prev;
      });
    },
    [isEnabled],
  );

  const clear = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current.clear();
    setEffects([]);
    setSustainedState([]);
  }, []);

  // Cancel any pending expiry timers on unmount.
  useEffect(
    () => () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    },
    [],
  );

  return { effects, sustained, pointerRef, refreshPointer, trigger, setSustained, clear };
}
