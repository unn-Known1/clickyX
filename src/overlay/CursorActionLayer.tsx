import { memo, useEffect, useRef } from "react";
import type {
  CursorEffect,
  MouseAction,
  PointerPosition,
  ScrollDirection,
} from "../hooks/useMouseFollowActions";

/** Default per-frame catch-up factor when no follow setting is supplied. */
const DEFAULT_FOLLOW_EASE = 0.35;
/** Default burst diameter (px) when no burst scale setting is supplied. */
const DEFAULT_BURST_SIZE = 44;
/**
 * Per-frame catch-up factor for the drag ghost. Deliberately lower than the
 * aura ease: a ghost should visibly lag the pointer to read as "something is
 * being carried", rather than tracking it exactly.
 */
const DRAG_GHOST_EASE = 0.16;
/** Dashed tether drawn between the pointer and its drag ghost. */
const DRAG_GHOST_MAX_LENGTH = 120;

/**
 * Degrees each scroll direction rotates the ripple axis by, injected as
 * `--scroll-dir`. Ripples are authored pointing "down" and rotated from there.
 */
const SCROLL_ROTATION: Record<ScrollDirection, number> = {
  down: 0,
  up: 180,
  right: -90,
  left: 90,
};

function safeCenter(): PointerPosition {
  if (typeof window === "undefined") return { x: 400, y: 300 };
  return { x: (window.innerWidth || 800) / 2, y: (window.innerHeight || 600) / 2 };
}

export interface CursorActionLayerProps {
  effects: CursorEffect[];
  sustained: MouseAction[];
  /** Live pointer position owned by the engine hook (mousemove + OS fallback). */
  pointerRef: { current: PointerPosition };
  /** Per-frame catch-up factor (0..1). Higher = tighter follow. */
  followEase?: number;
  /** Number of trailing trail dots (0 disables the trail). */
  trailDots?: number;
  /** Burst diameter in px. */
  burstSize?: number;
  /** Render the ambient pointer halo. */
  showHalo?: boolean;
  /** Render the slow ambient pulse ring around the pointer. */
  idlePulse?: boolean;
  /** Accent override; "" inherits the overlay's --accent. */
  accent?: string;
}

/**
 * Renders dynamic cursor-follow animations for the overlay.
 *
 * Burst effects are pinned to the viewport coordinates they were spawned at.
 * The trail dots, sustained auras (listen/think), idle pulse and pointer halo all
 * live inside an anchor whose transform is driven by an internal RAF loop — so
 * the ~60fps follow never re-renders the overlay tree (same isolation as
 * PetLayer). The pointer itself comes from the shared ref (see `useGlobalCursor`),
 * so the follow works even when the click-through window receives no mouse events.
 */
export const CursorActionLayer = memo(function CursorActionLayer({
  effects,
  sustained,
  pointerRef,
  followEase = DEFAULT_FOLLOW_EASE,
  trailDots = 0,
  burstSize = DEFAULT_BURST_SIZE,
  showHalo = true,
  idlePulse = false,
  accent = "",
}: CursorActionLayerProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const tetherRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<PointerPosition>(safeCenter());
  const ghostPosRef = useRef<PointerPosition>(safeCenter());
  const bufferRef = useRef<PointerPosition[]>([]);
  const rafRef = useRef(0);
  const hasGhost = sustained.includes("drag");
  const active = effects.length > 0 || sustained.length > 0;

  const ease = Math.min(Math.max(followEase, 0), 1);
  const dots = Math.max(0, Math.min(trailDots, 40));
  // Stable per-render primitives the RAF effect reads.
  const accentVar = accent ? { ["--accent" as never]: accent } : undefined;

  useEffect(() => {
    if (!active) return;
    // Snap onto the pointer when the layer activates instead of sliding in from center.
    posRef.current = { ...pointerRef.current };
    ghostPosRef.current = { ...pointerRef.current };
    bufferRef.current = [];
    let alive = true;
    const frame = () => {
      if (!alive) return;
      const p = posRef.current;
      const target = pointerRef.current;
      p.x += (target.x - p.x) * ease;
      p.y += (target.y - p.y) * ease;
      if (anchorRef.current) {
        anchorRef.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      }

      // Drag ghost: a second, slower-following copy of the pointer, plus a
      // dashed tether back to the real pointer so the lag reads as intentional.
      if (hasGhost) {
        const g = ghostPosRef.current;
        g.x += (target.x - g.x) * DRAG_GHOST_EASE;
        g.y += (target.y - g.y) * DRAG_GHOST_EASE;
        const dx = g.x - p.x;
        const dy = g.y - p.y;
        const len = Math.hypot(dx, dy);
        if (ghostRef.current) {
          ghostRef.current.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        }
        if (tetherRef.current) {
          if (len < 6) {
            tetherRef.current.style.opacity = "0";
          } else {
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            // Fade the tether out over the tail of its length so a fast yank
            // does not draw a hard line across the screen.
            const reach = Math.min(len, DRAG_GHOST_MAX_LENGTH);
            tetherRef.current.style.opacity = String(Math.min(0.5, reach / 240));
            tetherRef.current.style.width = `${reach}px`;
            tetherRef.current.style.transform = `rotate(${angle}deg)`;
          }
        }
      }

      // Trail: keep the last `dots` anchor positions and stagger them behind.
      if (dots > 0) {
        const buf = bufferRef.current;
        buf.push({ x: p.x, y: p.y });
        if (buf.length > dots) buf.shift();
        const nodes = trailRef.current?.children;
        if (nodes) {
          for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i] as HTMLElement;
            const pt = buf[buf.length - 1 - i];
            if (!pt) {
              node.style.opacity = "0";
              continue;
            }
            const falloff = 1 - i / nodes.length;
            node.style.opacity = String(falloff * 0.45);
            node.style.transform = `translate3d(${pt.x - p.x}px, ${pt.y - p.y}px, 0) scale(${falloff})`;
          }
        }
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [active, pointerRef, ease, dots, hasGhost]);

  if (!active) return null;

  return (
    <>
      <div
        ref={anchorRef}
        className="cursor-follow-anchor"
        style={accentVar}
        aria-hidden="true"
      >
        {dots > 0 && (
          <div ref={trailRef} className="cursor-trail">
            {Array.from({ length: dots }, (_, i) => (
              <span key={i} className="cursor-trail-dot" />
            ))}
          </div>
        )}
        {idlePulse && <div className="cursor-idle-pulse" />}
        {showHalo && <div className="cursor-pointer-halo" />}
        {sustained
          .filter((action) => action !== "drag")
          .map((action) => (
            <div key={action} className={`cursor-aura cursor-aura-${action}`} />
          ))}
        {hasGhost && (
          <>
            <div ref={tetherRef} className="cursor-drag-tether" />
            <div ref={ghostRef} className="cursor-drag-ghost" />
          </>
        )}
      </div>
      {effects.map((effect) => (
        <div
          key={effect.id}
          className={`cursor-action cursor-action-${effect.action}`}
          style={
            {
              left: effect.x,
              top: effect.y,
              animationDuration: `${effect.durationMs}ms`,
              "--cursor-burst-size": `${burstSize}px`,
              ...(accent ? { ["--accent" as never]: accent } : {}),
              ...(effect.action === "scroll"
                ? { ["--scroll-dir" as never]: `${SCROLL_ROTATION[effect.direction ?? "down"]}deg` }
                : {}),
            } as React.CSSProperties
          }
          aria-hidden="true"
        >
          {effect.action === "typing" && (
            <>
              <span className="cursor-key cursor-key-1">A</span>
              <span className="cursor-key cursor-key-2">B</span>
              <span className="cursor-key cursor-key-3">C</span>
            </>
          )}
          {effect.action === "scroll" && (
            <>
              <span className="cursor-ripple cursor-ripple-1" />
              <span className="cursor-ripple cursor-ripple-2" />
              <span className="cursor-ripple cursor-ripple-3" />
            </>
          )}
        </div>
      ))}
    </>
  );
});