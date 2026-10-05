import { useCallback, useEffect, useRef } from "react";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";

/** A point in the overlay webview's local CSS-pixel space. */
export interface PointerPosition {
  x: number;
  y: number;
}

/** How often we ask the OS where the cursor is when native mouse events are unavailable. */
export const CURSOR_POLL_MS = 40;
/** If no native `mousemove` arrived within this window, fall back to OS polling. */
export const MOUSEMOVE_STALE_MS = 500;
/** Give up polling after this many consecutive failures (e.g. permission denied). */
export const MAX_POLL_FAILURES = 5;

function viewportCenter(): PointerPosition {
  if (typeof window === "undefined") return { x: 400, y: 300 };
  return { x: (window.innerWidth || 800) / 2, y: (window.innerHeight || 600) / 2 };
}

/**
 * Track the pointer in window-local CSS pixels.
 *
 * `mousemove` is the primary source, but the overlay windows are click-through
 * (`set_ignore_cursor_events(true)`), so on a real desktop they receive no mouse
 * events at all. In that case we fall back to Tauri's `cursorPosition()` command,
 * which reports the cursor in global physical pixels, and convert it into this
 * window's local CSS space using the window origin and the device pixel ratio.
 *
 * The fallback is entirely fail-safe: if the command is unavailable or denied we
 * keep the last known position (native mouse events, if any, still win).
 *
 * Background polling only runs while `active` (the animation layer is showing
 * something), so an idle overlay costs zero IPC. Callers may request a one-shot
 * `refresh()` when a command-driven effect needs the cursor immediately.
 */
export interface GlobalCursorRef {
  /** Mutable window-local CSS coordinates for this overlay's cursor. */
  current: PointerPosition;
  /** Refreshes from the OS cursor even when background polling is inactive. */
  refresh: () => Promise<PointerPosition | null>;
}

export function useGlobalCursor(active: boolean): GlobalCursorRef {
  const pointerRef = useRef<PointerPosition>(viewportCenter());
  const lastMoveRef = useRef(0);
  const originRef = useRef<PointerPosition | null>(null);

  const refresh = useCallback(async (): Promise<PointerPosition | null> => {
    try {
      if (!originRef.current) {
        const origin = await getCurrentWindow().outerPosition();
        originRef.current = { x: origin.x, y: origin.y };
      }
      const p = await cursorPosition();
      const origin = originRef.current;
      const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
      const position = { x: (p.x - origin.x) / dpr, y: (p.y - origin.y) / dpr };
      pointerRef.current = position;
      return position;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
      lastMoveRef.current = Date.now();
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    let timer = 0;
    let failures = 0;

    const tick = async () => {
      if (!alive) return;
      // Only reach for the OS when native mouse events aren't arriving.
      if (Date.now() - lastMoveRef.current > MOUSEMOVE_STALE_MS) {
        if (await refresh()) {
          failures = 0;
        } else {
          // Command unavailable/denied — stop after a few tries and keep native input.
          if (++failures >= MAX_POLL_FAILURES) return;
        }
      }
      if (alive) timer = window.setTimeout(tick, CURSOR_POLL_MS);
    };

    timer = window.setTimeout(tick, CURSOR_POLL_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [active, refresh]);

  return Object.assign(pointerRef, { refresh });
}
