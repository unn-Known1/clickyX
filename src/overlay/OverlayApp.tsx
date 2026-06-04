import { useEffect, useRef, useState, useCallback, Component, ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import "./overlay.css";

const DEFAULT_ACCENT = "#4fc3f7";

// ── Helpers ───────────────────────────────────────────────────────────────────
function withAlpha(hex: string, alpha: number): string {
  if (!hex || !hex.startsWith("#") || hex.length !== 7) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, "0");
  return hex + a;
}

function safeWindowSize() {
  // Safe — called inside components/effects, never at module load
  return { w: window.innerWidth || 800, h: window.innerHeight || 600 };
}

// ── Error Boundary ────────────────────────────────────────────────────────────
class OverlayErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(err: Error) { console.error("[OverlayApp error]", err); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ position: "fixed", bottom: 8, right: 8, background: "rgba(244,67,54,0.85)", color: "#fff", padding: "6px 12px", borderRadius: 6, fontSize: 11, pointerEvents: "none" }}>
          Overlay error: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Interfaces ────────────────────────────────────────────────────────────────
interface CursorState {
  id: string; x: number; y: number; label?: string; accent?: string;
  animation?: string; fromX?: number; fromY?: number; controlX?: number; controlY?: number; state?: string;
}
interface RectState { id: string; x: number; y: number; w: number; h: number; label?: string; state?: string; }
interface ScribbleState { points: [number, number][]; label?: string; state?: string; }
interface CaptionState { text: string; x: number; y: number; state?: string; }
interface GlowState { id: string; x: number; y: number; w: number; h: number; label?: string; }
interface AgentDockItem { slug: string; name: string; status: string; caption?: string; }
interface AgentDockState { items: AgentDockItem[]; position: string; }
interface AnimatedCursor extends CursorState { currentX: number; currentY: number; }
interface StreamingCaption extends CaptionState { revealedChars: number; done: boolean; }
interface CalibrationState { active: boolean; x: number; y: number; w: number; h: number; }

// ── Animation helpers ─────────────────────────────────────────────────────────
function quadraticBezier(t: number, p0: number, p1: number, p2: number): number {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
}

function animateCursorArc(
  cursor: CursorState,
  onFrame: (x: number, y: number) => void,
  onDone: () => void,
  durationMs = 300,
): () => void {
  const fromX = cursor.fromX ?? cursor.x;
  const fromY = cursor.fromY ?? cursor.y;
  const cx = cursor.controlX ?? (fromX + cursor.x) / 2;
  const cy = cursor.controlY ?? Math.min(fromY, cursor.y) - 60;
  const start = performance.now();
  let running = true;
  function frame(now: number) {
    if (!running) return;
    const t = Math.min((now - start) / durationMs, 1);
    const ease = t * (2 - t);
    onFrame(quadraticBezier(ease, fromX, cx, cursor.x), quadraticBezier(ease, fromY, cy, cursor.y));
    if (t < 1) requestAnimationFrame(frame); else onDone();
  }
  requestAnimationFrame(frame);
  return () => { running = false; };
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Spinner({ accent }: { accent: string }) {
  return (
    <div className="processing-spinner">
      <svg width="28" height="28" viewBox="0 0 28 28">
        <circle cx="14" cy="14" r="10" fill="none" stroke={withAlpha(accent, 0.2)} strokeWidth="3" />
        <path d="M14 4 A10 10 0 0 1 24 14" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 14 14" to="360 14 14" dur="0.8s" repeatCount="indefinite" />
        </path>
      </svg>
    </div>
  );
}

function Waveform({ active, accent }: { active: boolean; accent: string }) {
  const [bars, setBars] = useState<number[]>(Array(20).fill(8));
  const frameRef = useRef<number>(0);
  useEffect(() => {
    if (!active) { setBars(Array(20).fill(8)); return; }
    function animate() { setBars(Array(20).fill(0).map(() => 4 + Math.random() * 28)); frameRef.current = requestAnimationFrame(animate); }
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [active]);
  if (!active) return null;
  return (
    <div className="waveform-container">
      {bars.map((h, i) => (
        <div key={i} className="waveform-bar" style={{ height: `${Math.max(4, h)}px`, backgroundColor: accent }} />
      ))}
    </div>
  );
}

/** Active-control glow — 5 concentric rounded rects, pulsing outward */
function GlowOverlay({ glows, accent }: { glows: GlowState[]; accent: string }) {
  if (glows.length === 0) return null;
  return (
    <>
      {glows.map((g) => (
        <div
          key={g.id}
          className="overlay-glow"
          style={{ left: g.x, top: g.y, width: g.w, height: g.h }}
          aria-hidden="true"
        >
          {[0, 1, 2, 3, 4].map((ring) => (
            <div
              key={ring}
              className="overlay-glow-ring"
              style={{
                borderColor: withAlpha(accent, 0.7 - ring * 0.12),
                inset: -(ring * 6),
                animationDelay: `${ring * 0.12}s`,
              }}
            />
          ))}
          {g.label && <span className="overlay-glow-label">{g.label}</span>}
        </div>
      ))}
    </>
  );
}

/** Calibration box — single pulsing rect that replaces avatar during calibration */
function CalibrationBox({ cal, accent }: { cal: CalibrationState; accent: string }) {
  if (!cal.active) return null;
  return (
    <div
      className="overlay-calibration"
      style={{ left: cal.x, top: cal.y, width: cal.w, height: cal.h, borderColor: accent }}
      aria-label="Calibration in progress"
    >
      <span className="calibration-label" style={{ color: accent }}>Calibrating…</span>
      <div className="calibration-corner tl" style={{ borderColor: accent }} />
      <div className="calibration-corner tr" style={{ borderColor: accent }} />
      <div className="calibration-corner bl" style={{ borderColor: accent }} />
      <div className="calibration-corner br" style={{ borderColor: accent }} />
    </div>
  );
}

// ── Main overlay component ────────────────────────────────────────────────────
function OverlayAppInner() {
  const { w, h } = safeWindowSize();

  const [cursors, setCursors] = useState<CursorState[]>([]);
  const [animatedCursors, setAnimatedCursors] = useState<Record<string, AnimatedCursor>>({});
  const [rects, setRects] = useState<RectState[]>([]);
  const [scribbles, setScribbles] = useState<ScribbleState[]>([]);
  const [captions, setCaptions] = useState<CaptionState[]>([]);
  const [streamingCaptions, setStreamingCaptions] = useState<StreamingCaption[]>([]);
  const [glows, setGlows] = useState<GlowState[]>([]);
  const [calibration, setCalibration] = useState<CalibrationState>({ active: false, x: 0, y: 0, w: 0, h: 0 });
  const [dock, setDock] = useState<AgentDockState | null>(null);
  const [processing, setProcessing] = useState(false);
  const [waveformActive, setWaveformActive] = useState(false);
  const [accent, setAccent] = useState<string>(DEFAULT_ACCENT);

  const animRefs = useRef<Record<string, () => void>>({});
  const [petPos, setPetPos] = useState({ x: w / 2, y: h / 2 });
  const petTarget = useRef({ x: w / 2, y: h / 2 });
  const petFrame = useRef<number>(0);
  const streamTimers = useRef<Record<string, number>>({});

  const updatePet = useCallback(() => {
    setPetPos(prev => ({
      x: prev.x + (petTarget.current.x - prev.x) * 0.08,
      y: prev.y + (petTarget.current.y - prev.y) * 0.08,
    }));
    petFrame.current = requestAnimationFrame(updatePet);
  }, []);

  useEffect(() => {
    petFrame.current = requestAnimationFrame(updatePet);
    return () => cancelAnimationFrame(petFrame.current);
  }, [updatePet]);

  const startStreamingCaption = useCallback((cap: CaptionState) => {
    const id = `stream-${Date.now()}-${Math.random()}`;
    const entry: StreamingCaption = { ...cap, revealedChars: 0, done: false };
    setStreamingCaptions(prev => [...prev.slice(-10), entry]);
    let charIndex = 0;

    function revealNext() {
      setStreamingCaptions(prev =>
        prev.map(s => s === entry ? { ...s, revealedChars: Math.min(s.revealedChars + 1, cap.text.length) } : s),
      );
      charIndex++;
      if (charIndex <= cap.text.length) {
        const isWordBoundary = cap.text[charIndex] === " " || cap.text[charIndex] === undefined;
        streamTimers.current[id] = window.setTimeout(revealNext, isWordBoundary ? 200 : 30);
      } else {
        setStreamingCaptions(prev => prev.map(s => s === entry ? { ...s, done: true } : s));
        window.setTimeout(() => setStreamingCaptions(prev => prev.filter(s => s !== entry)), 5000);
      }
    }

    streamTimers.current[id] = window.setTimeout(revealNext, 30);
  }, []);

  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    listen<CursorState>("show-cursor", (e) => {
      const c = e.payload;
      if (c.animation && c.animation !== "none" && c.fromX != null && c.fromY != null) {
        const id = c.id;
        if (animRefs.current[id]) animRefs.current[id]();
        setAnimatedCursors(prev => ({ ...prev, [id]: { ...c, currentX: c.fromX!, currentY: c.fromY! } }));
        animRefs.current[id] = animateCursorArc(
          c,
          (x, y) => setAnimatedCursors(prev => prev[id] ? { ...prev, [id]: { ...prev[id], currentX: x, currentY: y } } : prev),
          () => { setAnimatedCursors(prev => { const n = { ...prev }; delete n[id]; return n; }); delete animRefs.current[id]; },
          350,
        );
      } else {
        setCursors(prev => [...prev.filter(c2 => c2.id !== c.id), c]);
      }
    }).then(fn => unlisteners.push(fn));

    listen("clear-overlays", () => {
      setCursors([]); setAnimatedCursors({}); setRects([]); setScribbles([]);
      setCaptions([]); setStreamingCaptions([]); setGlows([]);
      setDock(null); setProcessing(false); setWaveformActive(false);
      setCalibration({ active: false, x: 0, y: 0, w: 0, h: 0 });
      Object.values(streamTimers.current).forEach(clearTimeout);
      streamTimers.current = {};
      Object.values(animRefs.current).forEach(cancel => cancel());
      animRefs.current = {};
    }).then(fn => unlisteners.push(fn));

    listen<RectState>("show-rect", (e) => {
      setRects(prev => [...prev.filter(r => r.id !== e.payload.id), e.payload]);
    }).then(fn => unlisteners.push(fn));

    listen<ScribbleState>("show-scribble", (e) => {
      setScribbles(prev => [...prev.slice(-50), e.payload]);
    }).then(fn => unlisteners.push(fn));

    listen<CaptionState>("show-caption", (e) => {
      const cap = e.payload;
      if (cap.text && cap.text.length > 10) startStreamingCaption(cap);
      else setCaptions(prev => [...prev.slice(-50), cap]);
    }).then(fn => unlisteners.push(fn));

    // Active-control glow
    listen<GlowState>("show-glow", (e) => {
      setGlows(prev => [...prev.filter(g => g.id !== e.payload.id), e.payload]);
    }).then(fn => unlisteners.push(fn));

    listen<{ id: string }>("hide-glow", (e) => {
      setGlows(prev => prev.filter(g => g.id !== e.payload.id));
    }).then(fn => unlisteners.push(fn));

    // Calibration
    listen<{ x: number; y: number; w: number; h: number }>("calibration-start", (e) => {
      setCalibration({ active: true, ...e.payload });
    }).then(fn => unlisteners.push(fn));

    listen("calibration-end", () => {
      setCalibration({ active: false, x: 0, y: 0, w: 0, h: 0 });
    }).then(fn => unlisteners.push(fn));

    listen<AgentDockState>("show-agent-dock", (e) => { setDock(e.payload); }).then(fn => unlisteners.push(fn));
    listen("hide-agent-dock", () => { setDock(null); }).then(fn => unlisteners.push(fn));

    listen<string>("accent-changed", (e) => {
      if (typeof e.payload === "string" && e.payload.startsWith("#")) setAccent(e.payload);
    }).then(fn => unlisteners.push(fn));

    listen("processing-start", () => setProcessing(true)).then(fn => unlisteners.push(fn));
    listen("processing-end", () => setProcessing(false)).then(fn => unlisteners.push(fn));
    listen("waveform-start", () => setWaveformActive(true)).then(fn => unlisteners.push(fn));
    listen("waveform-end", () => setWaveformActive(false)).then(fn => unlisteners.push(fn));

    listen("lifecycle-event", (e: { payload: { action: string; id: string; state: string } }) => {
      const { id, state } = e.payload;
      if (state === "completed" || state === "missed") {
        setCursors(prev => prev.filter(c => c.id !== id));
        setRects(prev => prev.filter(r => r.id !== id));
        setGlows(prev => prev.filter(g => g.id !== id));
      }
    }).then(fn => unlisteners.push(fn));

    const onMouseMove = (e: MouseEvent) => { petTarget.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", onMouseMove);

    // Update pet position base on window resize
    const onResize = () => {
      const { w: nw, h: nh } = safeWindowSize();
      petTarget.current = { x: nw / 2, y: nh / 2 };
    };
    window.addEventListener("resize", onResize);

    return () => {
      Object.values(streamTimers.current).forEach(clearTimeout);
      streamTimers.current = {};
      Object.values(animRefs.current).forEach(cancel => cancel());
      animRefs.current = {};
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      unlisteners.forEach(fn => fn());
    };
  }, [startStreamingCaption]);

  return (
    <div
      className="overlay-container"
      style={{ ["--accent" as never]: accent } as React.CSSProperties}
    >
      {/* Pet sprite — hidden during calibration */}
      {!calibration.active && (
        <div className="pet-sprite" style={{ left: petPos.x, top: petPos.y - 30 }}>
          <svg width="32" height="32" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="14" fill={withAlpha(accent, 0.35)} stroke={accent} strokeWidth="1.5" />
            <circle cx="12" cy="13" r="2" fill="#fff" />
            <circle cx="20" cy="13" r="2" fill="#fff" />
            <path d="M12 20 Q16 24 20 20" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      )}

      {/* Calibration box */}
      <CalibrationBox cal={calibration} accent={accent} />

      {processing && (
        <div className="processing-indicator" style={{ left: petPos.x + 20, top: petPos.y - 20 }}>
          <Spinner accent={accent} />
        </div>
      )}

      {waveformActive && (
        <div className="waveform-wrapper" style={{ left: petPos.x - 80, top: petPos.y + 20 }}>
          <Waveform active={waveformActive} accent={accent} />
        </div>
      )}

      {/* Active-control glow */}
      <GlowOverlay glows={glows} accent={accent} />

      {rects.map(r => (
        <div
          key={r.id}
          className={`overlay-rect ${r.state === "missed" ? "overlay-rect-missed" : ""} ${r.state === "completed" ? "overlay-rect-completed" : ""}`}
          style={{ left: r.x, top: r.y, width: r.w, height: r.h, borderColor: accent, background: withAlpha(accent, 0.08) }}
        >
          {r.label && <span className="overlay-label">{r.label}</span>}
        </div>
      ))}

      {scribbles.map((s, i) => (
        <svg key={i} className="overlay-scribble" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
          <path d={`M ${s.points.map((p, j) => `${j === 0 ? "" : "L"} ${p[0]} ${p[1]}`).join(" ")}`} stroke={accent} />
          {s.label && <text fill={accent}>{s.label}</text>}
        </svg>
      ))}

      {Object.values(animatedCursors).map(c => (
        <div key={c.id} className="overlay-cursor animated-cursor" style={{ left: c.currentX, top: c.currentY }}>
          <svg width="24" height="24" viewBox="0 0 24 24">
            <polygon points="2,2 20,12 12,14 10,22" fill={c.accent || accent} opacity="0.9" />
          </svg>
          {c.label && <span className="cursor-label">{c.label}</span>}
        </div>
      ))}

      {cursors.map(c => (
        <div key={c.id} className="overlay-cursor" style={{ left: c.x, top: c.y }}>
          <svg width="24" height="24" viewBox="0 0 24 24">
            <polygon points="2,2 20,12 12,14 10,22" fill={c.accent || accent} opacity="0.8" />
          </svg>
          {c.label && <span className="cursor-label">{c.label}</span>}
        </div>
      ))}

      {captions.map((cap, i) => (
        <div key={i} className="overlay-caption" style={{ left: cap.x, top: cap.y }}>
          <div className="caption-bubble"><span>{cap.text}</span></div>
        </div>
      ))}

      {streamingCaptions.map((cap, i) => (
        <div key={i} className={`overlay-caption streaming-caption ${cap.done ? "caption-done" : ""}`} style={{ left: cap.x, top: cap.y }}>
          <div className="caption-bubble">
            <span>{cap.text.slice(0, cap.revealedChars)}<span className="caption-cursor">|</span></span>
          </div>
        </div>
      ))}

      {dock && (
        <div className={`agent-dock agent-dock-${dock.position}`} style={{ borderColor: withAlpha(accent, 0.2) }}>
          <div className="agent-dock-inner">
            {dock.items.map(item => (
              <div key={item.slug} className={`agent-dock-item agent-dock-item-${item.status}`}>
                <div className="agent-dock-avatar">
                  <svg width="28" height="28" viewBox="0 0 28 28">
                    <circle cx="14" cy="10" r="6" fill={withAlpha(accent, 0.3)} stroke={accent} strokeWidth="1.2" />
                    <circle cx="14" cy="24" r="8" fill={withAlpha(accent, 0.15)} stroke={accent} strokeWidth="1" opacity="0.6" />
                    <circle cx="11" cy="9" r="1.2" fill="#fff" />
                    <circle cx="17" cy="9" r="1.2" fill="#fff" />
                    <path d="M11 14 Q14 17 17 14" fill="none" stroke={accent} strokeWidth="1" strokeLinecap="round" />
                  </svg>
                  <span className={`status-dot status-dot-${item.status}`} />
                </div>
                <span className="agent-dock-name">{item.name}</span>
                {item.caption && <span className="agent-dock-caption">{item.caption}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OverlayApp() {
  return (
    <OverlayErrorBoundary>
      <OverlayAppInner />
    </OverlayErrorBoundary>
  );
}
