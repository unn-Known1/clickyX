import { memo, useEffect, useRef } from "react";
import type { CursorEffect, MouseAction, PointerPosition } from "../hooks/useMouseFollowActions";

/** Default per-frame catch-up factor when no follow setting is supplied. */
const DEFAULT_FOLLOW_EASE = 0.35;
/** Default burst diameter (px) when no burst scale setting is supplied. */
const DEFAULT_BURST_SIZE = 44;

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
  const posRef = useRef<PointerPosition>(safeCenter());
  const bufferRef = useRef<PointerPosition[]>([]);
  const rafRef = useRef(0);
  const active = effects.length > 0 || sustained.length > 0;

  const ease = Math.min(Math.max(followEase, 0), 1);
  const dots = Math.max(0, Math.min(trailDots, 40));
  // Stable per-render primitives the RAF effect reads.
  const accentVar = accent ? { ["--accent" as never]: accent } : undefined;

  useEffect(() => {
    if (!active) return;
    // Snap onto the pointer when the layer activates instead of sliding in from center.
    posRef.current = { ...pointerRef.current };
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
  }, [active, pointerRef, ease, dots]);

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
        {sustained.map((action) => (
          <div key={action} className={`cursor-aura cursor-aura-${action}`} />
        ))}
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
            } as React.CSSProperties
          }
          aria-hidden="true"
        />
      ))}
    </>
  );
});