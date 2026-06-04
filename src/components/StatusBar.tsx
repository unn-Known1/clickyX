import { useState, useEffect } from "react";
import { invoke, listen } from "../bindings";
import { useStore } from "../store/appStore";
import type { AutoCaptureStatus, TodayStats } from "../bindings";

export default function StatusBar() {
  const { audioStatus, audioLevel, attentionItems, setAudioStatus, setAudioLevel, setAttentionItems, todayStats, setTodayStats } = useStore();
  const [acStatus, setAcStatus] = useState<AutoCaptureStatus | null>(null);

  // Auto-capture: event-driven + fallback poll
  useEffect(() => {
    invoke<AutoCaptureStatus>("get_auto_capture_status").then(setAcStatus).catch(() => {});
    let unlisten: (() => void) | null = null;
    listen<AutoCaptureStatus>("auto-capture-status", (e) => setAcStatus(e.payload))
      .then((fn) => { unlisten = fn; });
    const id = setInterval(() => {
      invoke<AutoCaptureStatus>("get_auto_capture_status").then(setAcStatus).catch(() => {});
    }, 5000);
    return () => { if (unlisten) unlisten(); clearInterval(id); };
  }, []);

  // Audio status + level
  useEffect(() => {
    const refresh = () => {
      invoke<{ listening: boolean; mode: string }>("get_audio_status").then(setAudioStatus).catch(() => {});
      invoke<number>("get_audio_level").then(setAudioLevel).catch(() => {});
    };
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [setAudioStatus, setAudioLevel]);

  // Today stats
  useEffect(() => {
    invoke<TodayStats>("get_today_stats").then(setTodayStats).catch(() => {});
    const id = setInterval(() => {
      invoke<TodayStats>("get_today_stats").then(setTodayStats).catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, [setTodayStats]);

  const lastCapture = acStatus?.last_capture
    ? new Date(acStatus.last_capture.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  const isListening = audioStatus?.listening ?? false;
  const captureActive = acStatus?.running ?? false;

  // Derive needs-attention from store agents
  const agents = useStore(s => s.agents);
  useEffect(() => {
    const items: { type: "warning" | "error" | "info"; message: string }[] = [];
    const errored = agents.filter(a => ["error", "failed"].includes(a.state.toLowerCase()));
    if (errored.length > 0) {
      items.push({ type: "error", message: `${errored.length} agent(s) in error state` });
    }
    setAttentionItems(items);
  }, [agents, setAttentionItems]);

  const errorCount = attentionItems.filter(i => i.type === "error").length;
  const warnCount  = attentionItems.filter(i => i.type === "warning").length;

  return (
    <div className="status-bar" role="status" aria-label="Application status">
      {/* Listening / audio level */}
      <div className="status-bar-item" title={isListening ? `Listening (${audioStatus?.mode})` : "Microphone idle"}>
        <span className={`status-bar-dot ${isListening ? "status-bar-dot-active" : ""}`} />
        <AudioMeter level={audioLevel} active={isListening} />
        <span className="status-bar-label">{isListening ? "Listening" : "Idle"}</span>
      </div>

      <div className="status-bar-divider" />

      {/* Auto-capture state */}
      <div className="status-bar-item" title={captureActive ? `Auto-capture active${lastCapture ? ` · ${lastCapture}` : ""}` : "Auto-capture off"}>
        <span className={`status-bar-dot ${captureActive ? "status-bar-dot-capture" : ""}`} />
        <span className="status-bar-label">
          {captureActive ? (lastCapture ? `Cap ${lastCapture}` : "Capturing") : "No capture"}
        </span>
      </div>

      {/* Today stats */}
      {todayStats && (
        <>
          <div className="status-bar-divider" />
          <div className="status-bar-item" title={`Today: ${todayStats.agents_run} agents, ${todayStats.voice_commands} voice`}>
            <span className="status-bar-label">{todayStats.agents_run}A · {todayStats.voice_commands}V</span>
          </div>
        </>
      )}

      {/* Attention pill — shows globally */}
      {(errorCount > 0 || warnCount > 0) && (
        <>
          <div className="status-bar-divider" />
          <div
            className={`status-bar-item status-bar-attention ${errorCount > 0 ? "attention-error" : "attention-warn"}`}
            title={attentionItems.map(i => i.message).join("; ")}
          >
            <span className="status-bar-label">
              {errorCount > 0 ? `⚠ ${errorCount} error${errorCount > 1 ? "s" : ""}` : `⚠ ${warnCount} warning${warnCount > 1 ? "s" : ""}`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function AudioMeter({ level, active }: { level: number; active: boolean }) {
  const bars = 5;
  const filled = active ? Math.round(level * bars) : 0;
  return (
    <div className="audio-meter" aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <div
          key={i}
          className={`audio-meter-bar ${i < filled ? "audio-meter-bar-active" : ""}`}
          style={{ height: `${40 + i * 12}%` }}
        />
      ))}
    </div>
  );
}
