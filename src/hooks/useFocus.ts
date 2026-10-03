/**
 * useFocus — local-first deep-work session engine (Focus Mode).
 *
 * A genuinely different use case from chat/agents: a Pomodoro-style focus
 * timer with an intention, a distraction "mind dump", and streak stats. All
 * state is user-owned and persisted to localStorage — no server, no telemetry.
 *
 * Timers are anchored to an absolute `endsAt` timestamp rather than counting
 * ticks, so the remaining time stays correct across throttled intervals and
 * app suspension. The interval only drives re-renders.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type FocusPhase = "work" | "break";

export interface FocusSession {
  id: string;
  intention: string;
  endedAt: number;
  /** Focused duration credited to this session, in milliseconds. */
  durationMs: number;
  completed: boolean;
}

export interface ParkedThought {
  id: string;
  text: string;
  createdAt: number;
}

export interface FocusConfig {
  workMinutes: number;
  breakMinutes: number;
}

export interface FocusStats {
  todayMinutes: number;
  todaySessions: number;
  /** Consecutive days (ending today or yesterday) with a completed session. */
  streak: number;
}

export const FOCUS_STORAGE_KEY = "clickyx_focus_v1";
export const DEFAULT_FOCUS_CONFIG: FocusConfig = { workMinutes: 25, breakMinutes: 5 };

const MAX_SESSIONS = 200;
const MAX_PARKED = 100;
const MIN_WORK = 1;
const MAX_WORK = 180;
const MIN_BREAK = 1;
const MAX_BREAK = 60;

interface PersistedFocus {
  config: FocusConfig;
  sessions: FocusSession[];
  parked: ParkedThought[];
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampMinutes(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeConfig(raw: unknown): FocusConfig {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    workMinutes: clampMinutes(o.workMinutes, MIN_WORK, MAX_WORK, DEFAULT_FOCUS_CONFIG.workMinutes),
    breakMinutes: clampMinutes(o.breakMinutes, MIN_BREAK, MAX_BREAK, DEFAULT_FOCUS_CONFIG.breakMinutes),
  };
}

function sanitizeSessions(raw: unknown): FocusSession[] {
  if (!Array.isArray(raw)) return [];
  const out: FocusSession[] = [];
  for (const s of raw) {
    if (typeof s !== "object" || s === null) continue;
    const o = s as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.endedAt !== "number") continue;
    out.push({
      id: o.id,
      intention: typeof o.intention === "string" ? o.intention : "",
      endedAt: o.endedAt,
      durationMs: typeof o.durationMs === "number" ? o.durationMs : 0,
      completed: o.completed !== false,
    });
  }
  return out.slice(-MAX_SESSIONS);
}

function sanitizeParked(raw: unknown): ParkedThought[] {
  if (!Array.isArray(raw)) return [];
  const out: ParkedThought[] = [];
  for (const p of raw) {
    if (typeof p !== "object" || p === null) continue;
    const o = p as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.text !== "string") continue;
    out.push({ id: o.id, text: o.text, createdAt: typeof o.createdAt === "number" ? o.createdAt : Date.now() });
  }
  return out.slice(0, MAX_PARKED);
}

function loadPersisted(): PersistedFocus {
  const empty: PersistedFocus = { config: { ...DEFAULT_FOCUS_CONFIG }, sessions: [], parked: [] };
  try {
    const raw = localStorage.getItem(FOCUS_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      config: sanitizeConfig(parsed.config),
      sessions: sanitizeSessions(parsed.sessions),
      parked: sanitizeParked(parsed.parked),
    };
  } catch {
    return empty;
  }
}

function savePersisted(state: PersistedFocus): void {
  try {
    localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable/full — focus mode still works for this session.
  }
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Consecutive-day streak of completed focus sessions ending today or yesterday. */
export function computeStreak(sessions: FocusSession[], now: number = Date.now()): number {
  const days = new Set(sessions.filter((s) => s.completed).map((s) => dayKey(s.endedAt)));
  if (days.size === 0) return 0;
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (days.has(dayKey(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function formatFocusClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function useFocus() {
  const initial = useMemo(loadPersisted, []);
  const [config, setConfig] = useState<FocusConfig>(initial.config);
  const [sessions, setSessions] = useState<FocusSession[]>(initial.sessions);
  const [parked, setParked] = useState<ParkedThought[]>(initial.parked);
  const [phase, setPhase] = useState<FocusPhase>("work");
  const [running, setRunning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(initial.config.workMinutes * 60_000);
  const [intention, setIntention] = useState("");
  const endsAtRef = useRef<number | null>(null);

  // Persist whenever durable state changes (never on the per-tick clock).
  useEffect(() => {
    savePersisted({ config, sessions, parked });
  }, [config, sessions, parked]);

  const completePhase = useCallback(() => {
    const now = Date.now();
    if (phase === "work") {
      const recorded: FocusSession = {
        id: newId(),
        intention: intention.trim(),
        endedAt: now,
        durationMs: config.workMinutes * 60_000,
        completed: true,
      };
      setSessions((prev) => [...prev, recorded].slice(-MAX_SESSIONS));
      const breakMs = config.breakMinutes * 60_000;
      endsAtRef.current = now + breakMs;
      setPhase("break");
      setRemainingMs(breakMs);
      setRunning(true);
    } else {
      endsAtRef.current = null;
      setPhase("work");
      setRemainingMs(config.workMinutes * 60_000);
      setRunning(false);
    }
  }, [phase, intention, config]);

  // Tick loop — drives re-renders; completion is detected from the clock.
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const endsAt = endsAtRef.current;
      if (endsAt === null) return;
      const rem = endsAt - Date.now();
      if (rem <= 0) {
        completePhase();
      } else {
        setRemainingMs(rem);
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [running, completePhase]);

  const start = useCallback(() => {
    if (running) return;
    const phaseTotal = (phase === "work" ? config.workMinutes : config.breakMinutes) * 60_000;
    const ms = remainingMs > 0 ? remainingMs : phaseTotal;
    endsAtRef.current = Date.now() + ms;
    setRemainingMs(ms);
    setRunning(true);
  }, [running, remainingMs, phase, config]);

  const pause = useCallback(() => {
    if (!running) return;
    const endsAt = endsAtRef.current;
    setRemainingMs(Math.max(0, (endsAt ?? Date.now()) - Date.now()));
    endsAtRef.current = null;
    setRunning(false);
  }, [running]);

  const reset = useCallback(() => {
    endsAtRef.current = null;
    setRunning(false);
    setPhase("work");
    setRemainingMs(config.workMinutes * 60_000);
  }, [config]);

  /** Advance to the next phase without crediting the current one. */
  const skip = useCallback(() => {
    const next: FocusPhase = phase === "work" ? "break" : "work";
    endsAtRef.current = null;
    setRunning(false);
    setPhase(next);
    setRemainingMs((next === "work" ? config.workMinutes : config.breakMinutes) * 60_000);
  }, [phase, config]);

  const updateConfig = useCallback(
    (partial: Partial<FocusConfig>) => {
      const next: FocusConfig = {
        workMinutes: clampMinutes(partial.workMinutes ?? config.workMinutes, MIN_WORK, MAX_WORK, config.workMinutes),
        breakMinutes: clampMinutes(partial.breakMinutes ?? config.breakMinutes, MIN_BREAK, MAX_BREAK, config.breakMinutes),
      };
      setConfig(next);
      if (!running) {
        endsAtRef.current = null;
        setRemainingMs((phase === "work" ? next.workMinutes : next.breakMinutes) * 60_000);
      }
    },
    [config, running, phase],
  );

  const addParked = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setParked((prev) => [{ id: newId(), text: trimmed, createdAt: Date.now() }, ...prev].slice(0, MAX_PARKED));
  }, []);

  const removeParked = useCallback((id: string) => {
    setParked((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearParked = useCallback(() => setParked([]), []);

  const stats = useMemo<FocusStats>(() => {
    const now = Date.now();
    const today = dayKey(now);
    const todays = sessions.filter((s) => dayKey(s.endedAt) === today);
    return {
      todayMinutes: Math.round(todays.reduce((acc, s) => acc + s.durationMs, 0) / 60_000),
      todaySessions: todays.length,
      streak: computeStreak(sessions, now),
    };
  }, [sessions]);

  const phaseTotalMs = (phase === "work" ? config.workMinutes : config.breakMinutes) * 60_000;

  return {
    config,
    updateConfig,
    phase,
    running,
    remainingMs,
    phaseTotalMs,
    intention,
    setIntention,
    start,
    pause,
    reset,
    skip,
    sessions,
    stats,
    parked,
    addParked,
    removeParked,
    clearParked,
  };
}
