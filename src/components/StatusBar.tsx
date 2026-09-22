import { useEffect, useState, useCallback } from "react";
import { useTauriEvent } from "../hooks/useTauriEvent";
import { useStore } from "../store/appStore";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { commands } from "../bindings";
import { useAppContext } from "../context/AppContext";
import { useAgents } from "../hooks/useAgents";
import { Icon } from "./Icon";
import type { AutoCaptureStatus, AudioLevelResponse, TodayStats } from "../bindings";

export default function StatusBar({ typeModeActive }: { typeModeActive?: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showToast } = useAppContext();
  // P1 (H-8): selectors, not whole-store subscription — audio-level ticks
  // (every 2s) must not re-render unrelated subscribers.
  const audioStatus = useStore((s) => s.audioStatus);
  const audioLevel = useStore((s) => s.audioLevel);
  const attentionItems = useStore((s) => s.attentionItems);
  const todayStats = useStore((s) => s.todayStats);
  const setAudioStatus = useStore((s) => s.setAudioStatus);
  const setAudioLevel = useStore((s) => s.setAudioLevel);
  const setAttentionItems = useStore((s) => s.setAttentionItems);
  const setTodayStats = useStore((s) => s.setTodayStats);
  // P1 (H-4): visible hold-to-talk. Recording was hotkey-only — a first-time
  // user could finish onboarding with zero discoverable path to speak.
  const [pttHeld, setPttHeld] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const startHold = useCallback(async () => {
    if (pttHeld || transcribing) return;
    try {
      await commands.startRecording();
      setPttHeld(true);
    } catch (e) {
      console.error("Failed to start recording:", e);
      showToast(t("status.micFailed"), "error");
    }
  }, [pttHeld, transcribing, showToast]);

  const endHold = useCallback(async () => {
    if (!pttHeld || transcribing) return;
    setPttHeld(false);
    setTranscribing(true);
    try {
      const transcript = await commands.stopRecording();
      const text = (transcript ?? "").trim();
      if (text) {
        showToast(`Voice: ${text.slice(0, 80)}${text.length > 80 ? "…" : ""}`, "success");
      }
    } catch (e) {
      console.error("Failed to stop/transcribe:", e);
      showToast(t("status.transcribeFailed"), "error");
    } finally {
      setTranscribing(false);
    }
  }, [pttHeld, transcribing, showToast]);

  // Auto-capture: react-query with refetchInterval + event-driven cache update
  const { data: acStatus } = useQuery<AutoCaptureStatus>({
    queryKey: ["auto-capture-status"],
    queryFn: () => commands.getAutoCaptureStatus(),
    refetchInterval: 5000,
    staleTime: 4000,
  });

  // P1 (H-4): shared listener helper — no unmount race.
  useTauriEvent<AutoCaptureStatus>("auto-capture-status", (e) => {
    queryClient.setQueryData(["auto-capture-status"], e.payload);
  });

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
    <div className="status-bar" role="status" aria-label={t("status.appStatus")}>
      {/* Listening / audio level + hold-to-talk mic button */}
      <button
        className={`status-bar-item status-bar-mic ${pttHeld ? "status-bar-mic-active" : ""}`}
        title={transcribing ? t("status.transcribing") : t("status.holdToTalkTitle")}
        aria-label={transcribing ? t("status.transcribing") : t("status.holdToTalk")}
        aria-pressed={pttHeld}
        disabled={transcribing}
        onPointerDown={(e) => { e.preventDefault(); void startHold(); }}
        onPointerUp={() => { void endHold(); }}
        onPointerLeave={() => { void endHold(); }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className={`status-bar-dot ${isListening || pttHeld ? "status-bar-dot-active" : ""}`} />
        <AudioMeter level={audioLevel} active={isListening || pttHeld} />
        <span className="status-bar-label">
          {transcribing ? t("status.transcribing") : pttHeld ? t("status.listening") : isListening ? t("status.listeningIdle") : t("status.holdToTalk")}
        </span>
      </button>

      <div className="status-bar-divider" />

      {/* Auto-capture state */}
      <div className="status-bar-item" title={captureActive ? (lastCapture ? `${t("status.captureActive")} · ${t("status.captureLabel", { time: lastCapture })}` : t("status.capturing")) : t("status.captureOff")}>
        <span className={`status-bar-dot ${captureActive ? "status-bar-dot-capture" : ""}`} />
        <Icon name="screen" size={11} />
        <span className="status-bar-label">
          {captureActive ? (lastCapture ? t("status.captureLabel", { time: lastCapture }) : t("status.capturing")) : t("status.captureOff")}
        </span>
      </div>

      {/* Today stats */}
      {todayStats && (
        <>
          <div className="status-bar-divider" />
          <div className="status-bar-item" title={t("status.todayTitle", { runs: todayStats.agents_run, cmds: todayStats.voice_commands })}>
            <Icon name="clock" size={11} />
            <span className="status-bar-label">
              {t("status.todayLabel", { runs: todayStats.agents_run, runPlural: todayStats.agents_run === 1 ? "" : t("status.pluralS"), cmds: todayStats.voice_commands })}
            </span>
          </div>
        </>
      )}

      {/* Type Mode indicator */}
      {typeModeActive && (
        <>
          <div className="status-bar-divider" />
          <div className="status-bar-item" title={t("status.typeModeTitle")}>
            <Icon name="keyboard" size={11} />
            <span className="status-bar-label type-mode-label">{t("status.typeMode")}</span>
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
              {errorCount > 0 ? t("status.errorLabel", { count: errorCount, plural: errorCount > 1 ? t("status.errorPlural") : "" }) : t("status.warningLabel", { count: warnCount, plural: warnCount > 1 ? t("status.pluralS") : "" })}
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
