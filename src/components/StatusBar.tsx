import { useEffect } from "react";
import { listen } from "../bindings";
import { useStore } from "../store/appStore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { commands } from "../bindings";
import { useAgents } from "../hooks/useAgents";
import { Icon } from "./Icon";
import type { AutoCaptureStatus, AudioLevelResponse, TodayStats } from "../bindings";

export default function StatusBar({ typeModeActive }: { typeModeActive?: boolean }) {
  const queryClient = useQueryClient();
  const { audioStatus, audioLevel, attentionItems, setAudioStatus, setAudioLevel, setAttentionItems, todayStats, setTodayStats } = useStore();

  // Auto-capture: react-query with refetchInterval + event-driven cache update
  const { data: acStatus } = useQuery<AutoCaptureStatus>({
    queryKey: ["auto-capture-status"],
    queryFn: () => commands.getAutoCaptureStatus(),
    refetchInterval: 5000,
    staleTime: 4000,
  });

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<AutoCaptureStatus>("auto-capture-status", (e) => {
      queryClient.setQueryData(["auto-capture-status"], e.payload);
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, [queryClient]);

  // Audio status + level: react-query with refetchInterval → sync to Zustand
  const { data: fetchedAudioStatus } = useQuery<{ listening: boolean; mode: string }>({
    queryKey: ["audio-status"],
    queryFn: () => commands.getAudioStatus(),
    refetchInterval: 2000,
    staleTime: 1000,
  });

  const { data: fetchedAudioLevel } = useQuery<AudioLevelResponse>({
    queryKey: ["audio-level"],
    queryFn: () => commands.getAudioLevel(),
    refetchInterval: 2000,
    staleTime: 1000,
  });

  const { data: fetchedTodayStats } = useQuery<TodayStats>({
    queryKey: ["today-stats"],
    queryFn: () => commands.getTodayStats(),
    refetchInterval: 30000,
    staleTime: 25000,
  });

  useEffect(() => { if (fetchedAudioStatus) setAudioStatus(fetchedAudioStatus); }, [fetchedAudioStatus, setAudioStatus]);
  useEffect(() => {
    if (fetchedAudioLevel !== undefined) {
      // Backend clamps rms to 0..1 — use it directly (was divided by 100, meter never lit)
      const level = Math.max(0, Math.min(1, fetchedAudioLevel.rms));
      setAudioLevel(level);
    }
  }, [fetchedAudioLevel, setAudioLevel]);
  useEffect(() => { if (fetchedTodayStats) setTodayStats(fetchedTodayStats); }, [fetchedTodayStats, setTodayStats]);

  const lastCapture = acStatus?.last_capture
    ? new Date(acStatus.last_capture.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  const isListening = audioStatus?.listening ?? false;
  const captureActive = acStatus?.running ?? false;

  // Derive needs-attention from the live react-query agent list (store agents were never populated)
  const { agents } = useAgents();
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
        <span className="status-bar-label">{isListening ? "Listening" : "Mic idle"}</span>
      </div>

      <div className="status-bar-divider" />

      {/* Auto-capture state */}
      <div className="status-bar-item" title={captureActive ? `Auto-capture active${lastCapture ? ` · last capture ${lastCapture}` : ""}` : "Auto-capture off"}>
        <span className={`status-bar-dot ${captureActive ? "status-bar-dot-capture" : ""}`} />
        <Icon name="screen" size={11} />
        <span className="status-bar-label">
          {captureActive ? (lastCapture ? `Capture · ${lastCapture}` : "Capturing…") : "Capture off"}
        </span>
      </div>

      {/* Today stats */}
      {todayStats && (
        <>
          <div className="status-bar-divider" />
          <div className="status-bar-item" title={`Today: ${todayStats.agents_run} agents, ${todayStats.voice_commands} voice`}>
            <Icon name="clock" size={11} />
            <span className="status-bar-label">
              {todayStats.agents_run} agent{todayStats.agents_run === 1 ? "" : "s"} · {todayStats.voice_commands} voice
            </span>
          </div>
        </>
      )}

      {/* Type Mode indicator */}
      {typeModeActive && (
        <>
          <div className="status-bar-divider" />
          <div className="status-bar-item" title="Type mode active — keyboard input will be simulated">
            <Icon name="keyboard" size={11} />
            <span className="status-bar-label type-mode-label">Type mode</span>
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
            <Icon name="warning" size={11} />
            <span className="status-bar-label">
              {errorCount > 0 ? `${errorCount} error${errorCount > 1 ? "s" : ""}` : `${warnCount} warning${warnCount > 1 ? "s" : ""}`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function AudioMeter({ level, active }: { level: number; active: boolean }) {
  const bars = 5;
  const clampedLevel = Math.max(0, Math.min(1, level));
  const filled = active ? Math.round(clampedLevel * bars) : 0;
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
