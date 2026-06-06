import { useEffect, useRef, useState, useCallback, Component, ReactNode } from "react";
import { listen } from "../bindings";
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
interface AudioLevelPayload { rms: number; peak: number; bars: number[]; }
// P-005: HIGHLIGHT and SHAPE annotation types
interface HighlightState { id: string; x: number; y: number; w: number; h: number; label?: string; }
interface ShapeState { id: string; shapeType: "arrow" | "curve"; x1: number; y1: number; x2: number; y2: number; label?: string; }

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

// ── P-006: Real waveform data ─────────────────────────────────────────────────
function Waveform({ active, accent }: { active: boolean; accent: string }) {
  const [bars, setBars] = useState<number[]>(Array(20).fill(8));
  const frameRef = useRef<number>(0);
  const lastRealDataRef = useRef<number>(0);
  const fallbackTimerRef = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      setBars(Array(20).fill(8));
      cancelAnimationFrame(frameRef.current);
      clearTimeout(fallbackTimerRef.current);
      return;
    }

    // Listen for real audio level updates from Rust
    let cancelled = false;
    const unlistenRef: { fn: (() => void) | null } = { fn: null };

    (async () => {
      const unsub = await listen<AudioLevelPayload>("audio-level-update", (e) => {
        if (cancelled) return;
        const { bars: realBars } = e.payload;
        if (realBars && realBars.length > 0) {
          lastRealDataRef.current = Date.now();
          // Normalize to 4..32 range
          const maxVal = Math.max(...realBars, 1);
          setBars(realBars.map((v) => 4 + (v / maxVal) * 28));
        }
      });
      if (!cancelled) unlistenRef.fn = unsub;
    })();

    // Fallback: use random animation when no real data for 500ms
    function checkFallback() {
      if (!active || cancelled) return;
      const elapsed = Date.now() - lastRealDataRef.current;
      if (elapsed > 500) {
        // No real data recently — animate randomly
        setBars(Array(20).fill(0).map(() => 4 + Math.random() * 28));
        frameRef.current = requestAnimationFrame(checkFallback);
      } else {
        // Real data is flowing — check again shortly
        fallbackTimerRef.current = window.setTimeout(checkFallback, 100);
      }
    }

    // Start fallback loop immediately (will auto-stop when real data arrives)
    frameRef.current = requestAnimationFrame(checkFallback);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameRef.current);
      clearTimeout(fallbackTimerRef.current);
      if (unlistenRef.fn) unlistenRef.fn();
    };
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

// ── F-014: Always-Listening Indicator ─────────────────────────────────────────
function AlwaysListeningIndicator({ accent }: { accent: string }) {
  return (
    <div
      className="always-listening-indicator"
      aria-label="Always-on voice mode active"
      title="Always-on listening mode active"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="9" y="2" width="6" height="13" rx="3" fill={accent} opacity="0.9" />
        <path
          d="M5 10a7 7 0 0 0 14 0"
          stroke={accent}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <line x1="12" y1="17" x2="12" y2="21" stroke={accent} strokeWidth="2" strokeLinecap="round" />
        <line x1="9" y1="21" x2="15" y2="21" stroke={accent} strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// ── P-005: HighlightOverlay ───────────────────────────────────────────────────
function HighlightOverlay({ highlights, accent }: { highlights: HighlightState[]; accent: string }) {
  if (highlights.length === 0) return null;
  return (
    <>
      {highlights.map((h) => (
        <div
          key={h.id}
          className="highlight-overlay"
          style={{
            left: h.x,
            top: h.y,
            width: h.w,
            height: h.h,
            background: `rgba(255, 220, 0, 0.25)`,
            borderColor: accent,
          }}
          aria-hidden="true"
        >
          {h.label && <span className="overlay-label">{h.label}</span>}
        </div>
      ))}
    </>
  );
}

// ── P-005: ShapeOverlay (arrow / curve) ───────────────────────────────────────
function ShapeOverlay({ shapes, accent }: { shapes: ShapeState[]; accent: string }) {
  if (shapes.length === 0) return null;
  return (
    <svg
      className="shape-overlay-svg"
      style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible", zIndex: 32 }}
      aria-hidden="true"
    >
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill={accent} />
        </marker>
      </defs>
      {shapes.map((s) => {
        if (s.shapeType === "arrow") {
          return (
            <g key={s.id} className="shape-arrow">
              <line
                x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                stroke={accent}
                strokeWidth="2.5"
                strokeLinecap="round"
                markerEnd="url(#arrowhead)"
              />
              {s.label && (
                <text
                  x={(s.x1 + s.x2) / 2 + 6}
                  y={(s.y1 + s.y2) / 2 - 6}
                  fill="#fff"
                  fontSize="11"
                  style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.7)", strokeWidth: 3 }}
                >
                  {s.label}
                </text>
              )}
            </g>
          );
        } else {
          // Bezier curve: control point arcs up between the two endpoints
          const cx = (s.x1 + s.x2) / 2;
          const cy = Math.min(s.y1, s.y2) - 60;
          return (
            <g key={s.id} className="shape-curve">
              <path
                d={`M ${s.x1} ${s.y1} Q ${cx} ${cy} ${s.x2} ${s.y2}`}
                fill="none"
                stroke={accent}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="6 3"
              />
              {s.label && (
                <text
                  x={cx}
                  y={cy - 8}
                  textAnchor="middle"
                  fill="#fff"
                  fontSize="11"
                  style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.7)", strokeWidth: 3 }}
                >
                  {s.label}
                </text>
              )}
            </g>
          );
        }
      })}
    </svg>
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
  const [highlights, setHighlights] = useState<HighlightState[]>([]);
  const [shapes, setShapes] = useState<ShapeState[]>([]);
  const [calibration, setCalibration] = useState<CalibrationState>({ active: false, x: 0, y: 0, w: 0, h: 0 });
  const [dock, setDock] = useState<AgentDockState | null>(null);
  const [processing, setProcessing] = useState(false);
  const [waveformActive, setWaveformActive] = useState(false);
  const [accent, setAccent] = useState<string>(DEFAULT_ACCENT);

  // F-014: always-on voice indicator
  const [alwaysListening, setAlwaysListening] = useState(false);

  const animRefs = useRef<Record<string, () => void>>({});
  const [petPos, setPetPos] = useState({ x: w / 2, y: h / 2 });
  const petTarget = useRef({ x: w / 2, y: h / 2 });
  const petRafRef = useRef<number>(0);
  const streamTimers = useRef<Record<string, number>>({});

  // F-019: streaming caption stale-closure fix
  const streamingRef = useRef<StreamingCaption | null>(null);

  // F-020: RAF-based pet animation with visibility pause
  // Only animate when the pet is actually shown (active state) to save CPU across all monitors
  const isPetActive = processing || waveformActive || cursors.length > 0 || rects.length > 0 || alwaysListening;

  const scheduleNextPetFrame = useCallback(() => {
    petRafRef.current = requestAnimationFrame(() => {
      setPetPos(prev => ({
        x: prev.x + (petTarget.current.x - prev.x) * 0.08,
        y: prev.y + (petTarget.current.y - prev.y) * 0.08,
      }));
      scheduleNextPetFrame();
    });
  }, []);

  useEffect(() => {
    if (!isPetActive) {
      cancelAnimationFrame(petRafRef.current);
      return;
    }
    scheduleNextPetFrame();
    return () => cancelAnimationFrame(petRafRef.current);
  }, [isPetActive, scheduleNextPetFrame]);

  // F-020: Pause RAF when overlay is hidden
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(petRafRef.current);
      } else if (isPetActive) {
        scheduleNextPetFrame();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [scheduleNextPetFrame, isPetActive]);

  // F-019: startStreamingCaption uses ref to avoid stale closure
  const startStreamingCaption = useCallback((cap: CaptionState) => {
    const id = `stream-${Date.now()}-${Math.random()}`;
    const entry: StreamingCaption = { ...cap, revealedChars: 0, done: false };
    streamingRef.current = entry;
    setStreamingCaptions(prev => [...prev.slice(-10), entry]);
    let charIndex = 0;

    function revealNext() {
      // Use the ref to get updated text length rather than captured cap
      const currentCap = streamingRef.current;
      const textLen = currentCap?.text.length ?? cap.text.length;
      setStreamingCaptions(prev =>
        prev.map(s =>
          s === entry ? { ...s, revealedChars: Math.min(s.revealedChars + 1, cap.text.length) } : s,
        ),
      );
      charIndex++;
      if (charIndex <= textLen) {
        const isWordBoundary = cap.text[charIndex] === " " || cap.text[charIndex] === undefined;
        streamTimers.current[id] = window.setTimeout(revealNext, isWordBoundary ? 200 : 30);
      } else {
        setStreamingCaptions(prev => prev.map(s => s === entry ? { ...s, done: true } : s));
        window.setTimeout(() => setStreamingCaptions(prev => prev.filter(s => s !== entry)), 5000);
      }
    }

    streamTimers.current[id] = window.setTimeout(revealNext, 30);
  }, []);

  // F-018: Proper async listener cleanup with cancellation flag
  useEffect(() => {
    let cancelled = false;
    const unlisten: (() => void)[] = [];

    (async () => {
      // show-cursor
      const u1 = await listen<CursorState>("show-cursor", (e) => {
        if (cancelled) return;
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
      });
      if (!cancelled) unlisten.push(u1);

      // clear-overlays
      const u2 = await listen("clear-overlays", () => {
        if (cancelled) return;
        setCursors([]); setAnimatedCursors({}); setRects([]); setScribbles([]);
        setCaptions([]); setStreamingCaptions([]); setGlows([]);
        setHighlights([]); setShapes([]);
        setDock(null); setProcessing(false); setWaveformActive(false);
        setCalibration({ active: false, x: 0, y: 0, w: 0, h: 0 });
        Object.values(streamTimers.current).forEach(clearTimeout);
        streamTimers.current = {};
        Object.values(animRefs.current).forEach(cancel => cancel());
        animRefs.current = {};
      });
      if (!cancelled) unlisten.push(u2);

      // show-rect
      const u3 = await listen<RectState>("show-rect", (e) => {
        if (cancelled) return;
        setRects(prev => [...prev.filter(r => r.id !== e.payload.id), e.payload]);
      });
      if (!cancelled) unlisten.push(u3);

      // show-scribble
      const u4 = await listen<ScribbleState>("show-scribble", (e) => {
        if (cancelled) return;
        setScribbles(prev => [...prev.slice(-50), e.payload]);
      });
      if (!cancelled) unlisten.push(u4);

      // show-caption
      const u5 = await listen<CaptionState>("show-caption", (e) => {
        if (cancelled) return;
        const cap = e.payload;
        if (cap.text && cap.text.length > 10) startStreamingCaption(cap);
        else setCaptions(prev => [...prev.slice(-50), cap]);
      });
      if (!cancelled) unlisten.push(u5);

      // show-glow
      const u6 = await listen<GlowState>("show-glow", (e) => {
        if (cancelled) return;
        setGlows(prev => [...prev.filter(g => g.id !== e.payload.id), e.payload]);
      });
      if (!cancelled) unlisten.push(u6);

      // hide-glow
      const u7 = await listen<{ id: string }>("hide-glow", (e) => {
        if (cancelled) return;
        setGlows(prev => prev.filter(g => g.id !== e.payload.id));
      });
      if (!cancelled) unlisten.push(u7);

      // calibration-start
      const u8 = await listen<{ x: number; y: number; w: number; h: number }>("calibration-start", (e) => {
        if (cancelled) return;
        setCalibration({ active: true, ...e.payload });
      });
      if (!cancelled) unlisten.push(u8);

      // calibration-end
      const u9 = await listen("calibration-end", () => {
        if (cancelled) return;
        setCalibration({ active: false, x: 0, y: 0, w: 0, h: 0 });
      });
      if (!cancelled) unlisten.push(u9);

      // show-agent-dock
      const u10 = await listen<AgentDockState>("show-agent-dock", (e) => {
        if (cancelled) return;
        setDock(e.payload);
      });
      if (!cancelled) unlisten.push(u10);

      // hide-agent-dock
      const u11 = await listen("hide-agent-dock", () => {
        if (cancelled) return;
        setDock(null);
      });
      if (!cancelled) unlisten.push(u11);

      // accent-changed
      const u12 = await listen<string>("accent-changed", (e) => {
        if (cancelled) return;
        if (typeof e.payload === "string" && e.payload.startsWith("#")) setAccent(e.payload);
      });
      if (!cancelled) unlisten.push(u12);

      // processing-start / processing-end
      const u13 = await listen("processing-start", () => { if (!cancelled) setProcessing(true); });
      if (!cancelled) unlisten.push(u13);

      const u14 = await listen("processing-end", () => { if (!cancelled) setProcessing(false); });
      if (!cancelled) unlisten.push(u14);

      // waveform-start / waveform-end
      const u15 = await listen("waveform-start", () => { if (!cancelled) setWaveformActive(true); });
      if (!cancelled) unlisten.push(u15);

      const u16 = await listen("waveform-end", () => { if (!cancelled) setWaveformActive(false); });
      if (!cancelled) unlisten.push(u16);

      // lifecycle-event
      const u17 = await listen("lifecycle-event", (e: { payload: { action: string; id: string; state: string } }) => {
        if (cancelled) return;
        const { id, state } = e.payload;
        if (state === "completed" || state === "missed") {
          setCursors(prev => prev.filter(c => c.id !== id));
          setRects(prev => prev.filter(r => r.id !== id));
          setGlows(prev => prev.filter(g => g.id !== id));
        }
      });
      if (!cancelled) unlisten.push(u17);

      // F-014: always-on-state-changed
      const u18 = await listen<{ active: boolean }>("always-on-state-changed", (e) => {
        if (cancelled) return;
        setAlwaysListening(e.payload.active);
      });
      if (!cancelled) unlisten.push(u18);

      // P-005: show-highlight
      const u19 = await listen<HighlightState>("show-highlight", (e) => {
        if (cancelled) return;
        setHighlights(prev => [...prev.filter(h => h.id !== e.payload.id), e.payload]);
      });
      if (!cancelled) unlisten.push(u19);

      // P-005: hide-highlight
      const u20 = await listen<{ id: string }>("hide-highlight", (e) => {
        if (cancelled) return;
        setHighlights(prev => prev.filter(h => h.id !== e.payload.id));
      });
      if (!cancelled) unlisten.push(u20);

      // P-005: show-shape
      const u21 = await listen<ShapeState>("show-shape", (e) => {
        if (cancelled) return;
        setShapes(prev => [...prev.filter(s => s.id !== e.payload.id), e.payload]);
      });
      if (!cancelled) unlisten.push(u21);

      // P-005: hide-shape
      const u22 = await listen<{ id: string }>("hide-shape", (e) => {
        if (cancelled) return;
        setShapes(prev => prev.filter(s => s.id !== e.payload.id));
      });
      if (!cancelled) unlisten.push(u22);
    })();

    const onMouseMove = (e: MouseEvent) => { petTarget.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", onMouseMove);

    // Update pet position based on window resize
    const onResize = () => {
      const { w: nw, h: nh } = safeWindowSize();
      petTarget.current = { x: nw / 2, y: nh / 2 };
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      Object.values(streamTimers.current).forEach(clearTimeout);
      streamTimers.current = {};
      Object.values(animRefs.current).forEach(cancel => cancel());
      animRefs.current = {};
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      unlisten.forEach(fn => fn());
    };
  }, [startStreamingCaption]);

  return (
    <div
      className="overlay-container"
      style={{ ["--accent" as never]: accent } as React.CSSProperties}
    >
      {/* F-014: Always-listening indicator — top-right corner */}
      {alwaysListening && <AlwaysListeningIndicator accent={accent} />}

      {/* Pet sprite — only shown during active AI operations, hidden during calibration or idle */}
      {!calibration.active && (processing || waveformActive || cursors.length > 0 || rects.length > 0 || alwaysListening) && (
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

      {/* P-005: Highlight overlays */}
      <HighlightOverlay highlights={highlights} accent={accent} />

      {/* P-005: Shape overlays (arrows / curves) */}
      <ShapeOverlay shapes={shapes} accent={accent} />

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
