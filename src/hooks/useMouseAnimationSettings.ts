import { useCallback, useEffect, useRef, useState } from "react";
import { MOUSE_ACTIONS, type MouseAction } from "./useMouseFollowActions";

/** How many trailing dots the cursor trail renders. */
export type TrailSetting = "off" | "short" | "medium" | "long";
/** How tightly the aura anchor tracks the pointer. */
export type FollowSetting = "instant" | "smooth" | "lazy";
/** Overall size of a burst effect. */
export type BurstScale = "small" | "normal" | "large";

export interface MouseAnimationSettings {
  /** Feature 1 — master switch for every mouse animation. */
  enabled: boolean;
  /** Feature 2 — cursor trail. */
  trail: TrailSetting;
  /** Feature 3 — follow responsiveness. */
  follow: FollowSetting;
  /** Feature 4 — burst size. */
  burstScale: BurstScale;
  /** Feature 5 — per-action enable toggles. */
  actions: Record<MouseAction, boolean>;
  /** Feature 6 — sound effects on burst actions. */
  sounds: boolean;
  /** Feature 7 — ambient idle pulse around the pointer. */
  idlePulse: boolean;
  /** Feature 8 — pointer halo. */
  halo: boolean;
  /** Feature 9 — cap on simultaneous bursts. */
  maxEffects: number;
  /** Feature 10 — accent override ("" inherits the app accent). */
  accent: string;
}

/** Trail dot counts per setting. */
export const TRAIL_DOTS: Record<TrailSetting, number> = {
  off: 0,
  short: 6,
  medium: 12,
  long: 20,
};

/** Per-frame catch-up factor (0..1) per follow setting. */
export const FOLLOW_EASE: Record<FollowSetting, number> = {
  instant: 1,
  smooth: 0.35,
  lazy: 0.12,
};

/** Burst diameter in px per scale setting. */
export const BURST_SIZE_PX: Record<BurstScale, number> = {
  small: 32,
  normal: 44,
  large: 60,
};

/** Selectable cap values. */
export const MAX_EFFECT_OPTIONS = [8, 16, 24] as const;

export const DEFAULT_MOUSE_ANIMATION_SETTINGS: MouseAnimationSettings = {
  enabled: true,
  trail: "off",
  follow: "smooth",
  burstScale: "normal",
  actions: MOUSE_ACTIONS.reduce(
    (acc, a) => {
      acc[a] = true;
      return acc;
    },
    {} as Record<MouseAction, boolean>,
  ),
  sounds: false,
  idlePulse: false,
  halo: true,
  maxEffects: 24,
  accent: "",
};

export const MOUSE_ANIMATION_STORAGE_KEY = "clickyx.mouseAnimations.v1";

const TRAIL_VALUES: TrailSetting[] = ["off", "short", "medium", "long"];
const FOLLOW_VALUES: FollowSetting[] = ["instant", "smooth", "lazy"];
const SCALE_VALUES: BurstScale[] = ["small", "normal", "large"];

function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
}

/**
 * Coerce an arbitrary persisted blob into a valid settings object.
 * Unknown/missing keys fall back to defaults, so a stale or hand-edited
 * localStorage entry can never produce an invalid configuration.
 */
export function normalizeMouseAnimationSettings(raw: unknown): MouseAnimationSettings {
  const d = DEFAULT_MOUSE_ANIMATION_SETTINGS;
  if (!raw || typeof raw !== "object") return { ...d, actions: { ...d.actions } };
  const o = raw as Record<string, unknown>;

  const actions = { ...d.actions };
  if (o.actions && typeof o.actions === "object") {
    for (const a of MOUSE_ACTIONS) {
      const v = (o.actions as Record<string, unknown>)[a];
      if (typeof v === "boolean") actions[a] = v;
    }
  }

  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : d.enabled,
    trail: TRAIL_VALUES.includes(o.trail as TrailSetting) ? (o.trail as TrailSetting) : d.trail,
    follow: FOLLOW_VALUES.includes(o.follow as FollowSetting) ? (o.follow as FollowSetting) : d.follow,
    burstScale: SCALE_VALUES.includes(o.burstScale as BurstScale)
      ? (o.burstScale as BurstScale)
      : d.burstScale,
    actions,
    sounds: typeof o.sounds === "boolean" ? o.sounds : d.sounds,
    idlePulse: typeof o.idlePulse === "boolean" ? o.idlePulse : d.idlePulse,
    halo: typeof o.halo === "boolean" ? o.halo : d.halo,
    maxEffects: (MAX_EFFECT_OPTIONS as readonly number[]).includes(o.maxEffects as number)
      ? (o.maxEffects as number)
      : d.maxEffects,
    accent: isHexColor(o.accent) ? o.accent : "",
  };
}

function readStored(): MouseAnimationSettings {
  try {
    const raw = window.localStorage.getItem(MOUSE_ANIMATION_STORAGE_KEY);
    if (!raw) return normalizeMouseAnimationSettings(null);
    return normalizeMouseAnimationSettings(JSON.parse(raw));
  } catch {
    return normalizeMouseAnimationSettings(null);
  }
}

export interface UseMouseAnimationSettingsResult {
  settings: MouseAnimationSettings;
  /** Shallow-merge a partial patch (persisted immediately). */
  update: (patch: Partial<MouseAnimationSettings>) => void;
  /** Toggle a single action's animation. */
  setActionEnabled: (action: MouseAction, enabled: boolean) => void;
  /** Restore every setting to its default. */
  reset: () => void;
}

/**
 * Mouse-animation settings (local-first).
 *
 * Persisted to `localStorage` like `useFocus`: these are pure presentation
 * preferences for the overlay window, so they need no backend round-trip and
 * are available synchronously to the overlay at mount.
 */
export function useMouseAnimationSettings(): UseMouseAnimationSettingsResult {
  const [settings, setSettings] = useState<MouseAnimationSettings>(readStored);
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    try {
      window.localStorage.setItem(MOUSE_ANIMATION_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage unavailable (private mode / quota) — settings stay in memory.
    }
  }, [settings]);

  const update = useCallback((patch: Partial<MouseAnimationSettings>) => {
    setSettings((prev) => normalizeMouseAnimationSettings({ ...prev, ...patch }));
  }, []);

  const setActionEnabled = useCallback((action: MouseAction, enabled: boolean) => {
    setSettings((prev) =>
      normalizeMouseAnimationSettings({ ...prev, actions: { ...prev.actions, [action]: enabled } }),
    );
  }, []);

  const reset = useCallback(() => {
    setSettings(normalizeMouseAnimationSettings(null));
  }, []);

  return { settings, update, setActionEnabled, reset };
}