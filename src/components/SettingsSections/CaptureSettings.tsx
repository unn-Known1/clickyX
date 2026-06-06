import { useState, useEffect, useCallback } from "react";
import { commands, listen } from "../../bindings";

interface AutoCaptureConfig {
  enabled: boolean;
  interval_ms: number;
  capture_mode: string;
  diff_threshold: number;
  max_cache: number;
  auto_attach: boolean;
}

interface AutoCaptureStatus {
  running: boolean;
  last_capture: { timestamp: number; region: string; width: number; height: number; size: number } | null;
  config: AutoCaptureConfig;
}

export function CaptureSettings() {
  const [acStatus, setAcStatus] = useState<AutoCaptureStatus | null>(null);
  const [acError, setAcError] = useState<string | null>(null);

  useEffect(() => {
    // Initial fetch
    commands.getAutoCaptureStatus()
      .then(setAcStatus)
      .catch((e) => setAcError(String(e)));

    // Event-driven updates
    let unlisten: (() => void) | null = null;
    listen<AutoCaptureStatus>("auto-capture-status", (e) => {
      setAcStatus(e.payload);
    }).then((fn) => { unlisten = fn; });

    // Lightweight poll every 5s as fallback
    const id = setInterval(() => {
      commands.getAutoCaptureStatus()
        .then(setAcStatus)
        .catch(() => {});
    }, 5000);

    return () => {
      if (unlisten) unlisten();
      clearInterval(id);
    };
  }, []);

  const startAutoCapture = useCallback(async (mode?: string, intervalMs?: number) => {
    try {
      await commands.startAutoCapture(mode, intervalMs);
    } catch (e) {
      setAcError(String(e));
    }
  }, []);

  const stopAutoCapture = useCallback(async () => {
    try {
      await commands.stopAutoCapture();
    } catch (e) {
      setAcError(String(e));
    }
  }, []);

  const clearAutoCapture = useCallback(async () => {
    try {
      await commands.clearAutoCaptureCache();
    } catch (e) {
      setAcError(String(e));
    }
  }, []);

  return (
    <section className="settings-section">
      <h3>Auto-Capture (Continuous Context)</h3>
      {acError && <div className="settings-error">{acError}</div>}

      <div className="setting-row">
        <label>Status</label>
        <span className="setting-value">
          {acStatus?.running ? (
            <span className="status-pill status-pill-active">Capturing</span>
          ) : (
            <span className="status-pill">Stopped</span>
          )}
        </span>
      </div>

      {acStatus?.running && acStatus.last_capture && (
        <div className="setting-row">
          <label>Last Frame</label>
          <span className="setting-value">
            {acStatus.last_capture.width}×{acStatus.last_capture.height} ·{" "}
            {Math.round(acStatus.last_capture.size / 1024)}KB ·{" "}
            {new Date(acStatus.last_capture.timestamp).toLocaleTimeString()}
          </span>
        </div>
      )}

      <div className="setting-row">
        <label>Capture Mode</label>
        <select
          className="setting-select"
          value={acStatus?.config.capture_mode ?? "full"}
          onChange={(e) => startAutoCapture(e.target.value)}
          disabled={!acStatus?.running}
        >
          <option value="full">Full (primary screen)</option>
          <option value="cursor">Cursor (active monitor)</option>
          <option value="focused">Focused window</option>
          <option value="all">All monitors (composite)</option>
        </select>
      </div>

      <div className="setting-row">
        <label>Interval</label>
        <select
          className="setting-select"
          value={acStatus?.config.interval_ms ?? 5000}
          onChange={(e) => startAutoCapture(undefined, parseInt(e.target.value))}
          disabled={!acStatus?.running}
        >
          <option value="1000">1s (Aggressive)</option>
          <option value="3000">3s</option>
          <option value="5000">5s (Default)</option>
          <option value="10000">10s</option>
          <option value="30000">30s (Light)</option>
        </select>
      </div>

      <div className="setting-row">
        <label>Controls</label>
        <div className="setting-actions">
          {acStatus?.running ? (
            <button className="setting-action-btn" onClick={stopAutoCapture}>
              Stop
            </button>
          ) : (
            <button className="setting-action-btn primary" onClick={() => startAutoCapture()}>
              Start
            </button>
          )}
          <button
            className="setting-action-btn"
            onClick={clearAutoCapture}
            disabled={!acStatus?.last_capture}
          >
            Clear Cache
          </button>
        </div>
      </div>
    </section>
  );
}
