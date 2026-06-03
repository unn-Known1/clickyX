import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import "./overlay.css";

interface CursorState {
  id: string;
  x: number;
  y: number;
  label?: string;
  accent?: string;
  animation?: string;
  fromX?: number;
  fromY?: number;
}

interface RectState {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

interface ScribbleState {
  points: [number, number][];
  label?: string;
}

interface CaptionState {
  text: string;
  x: number;
  y: number;
}

function OverlayApp() {
  const [cursors, setCursors] = useState<CursorState[]>([]);
  const [rects, setRects] = useState<RectState[]>([]);
  const [scribbles, setScribbles] = useState<ScribbleState[]>([]);
  const [captions, setCaptions] = useState<CaptionState[]>([]);

  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    listen<CursorState>("show-cursor", (e) => {
      setCursors(prev => {
        const filtered = prev.filter(c => c.id !== e.payload.id);
        return [...filtered, e.payload];
      });
    }).then(fn => unlisteners.push(fn));

    listen("clear-overlays", () => {
      setCursors([]);
      setRects([]);
      setScribbles([]);
      setCaptions([]);
    }).then(fn => unlisteners.push(fn));

    listen<RectState>("show-rect", (e) => {
      setRects(prev => {
        const filtered = prev.filter(r => r.id !== e.payload.id);
        return [...filtered, e.payload];
      });
    }).then(fn => unlisteners.push(fn));

    listen<ScribbleState>("show-scribble", (e) => {
      setScribbles(prev => [...prev, e.payload]);
    }).then(fn => unlisteners.push(fn));

    listen<CaptionState>("show-caption", (e) => {
      setCaptions(prev => [...prev, e.payload]);
    }).then(fn => unlisteners.push(fn));

    return () => unlisteners.forEach(fn => fn());
  }, []);

  return (
    <div className="overlay-container">
      {rects.map(r => (
        <div key={r.id} className="overlay-rect" style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
          {r.label && <span className="overlay-label">{r.label}</span>}
        </div>
      ))}
      {scribbles.map((s, i) => (
        <svg key={i} className="overlay-scribble" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d={`M ${s.points.map((p, j) => `${j === 0 ? "" : "L"} ${p[0]} ${p[1]}`).join(" ")}`} />
          {s.label && <text>{s.label}</text>}
        </svg>
      ))}
      {cursors.map(c => (
        <div key={c.id} className="overlay-cursor" style={{ left: c.x, top: c.y }}>
          <svg width="24" height="24" viewBox="0 0 24 24">
            <polygon points="2,2 20,12 12,14 10,22" fill={c.accent || "#4fc3f7"} opacity="0.8" />
          </svg>
          {c.label && <span className="cursor-label">{c.label}</span>}
        </div>
      ))}
      {captions.map((cap, i) => (
        <div key={i} className="overlay-caption" style={{ left: cap.x, top: cap.y }}>
          <div className="caption-bubble">
            <span>{cap.text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default OverlayApp;
