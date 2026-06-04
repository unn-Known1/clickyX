import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface OverlayPrefs {
  cursor_accent: string;
  cursor_size: number;
  show_cursor: boolean;
  tutor_mode: boolean;
  agent_dock_position: string;
  accent_presets: string[];
}

interface AppConfig {
  theme: string;
  overlay: OverlayPrefs;
}

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

function GeneralSettings() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [acStatus, setAcStatus] = useState<AutoCaptureStatus | null>(null);
  const [acError, setAcError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    invoke<AppConfig>("get_config")
      .then(setConfig)
      .catch((e) => {
        console.error("Failed to load config:", e);
        setError("Failed to load settings");
      });
  }, []);

  useEffect(() => {
    // Initial fetch
    invoke<AutoCaptureStatus>("get_auto_capture_status")
      .then(setAcStatus)
      .catch((e) => setAcError(String(e)));

    // Event-driven updates — listen for Rust-emitted status changes
    let unlisten: (() => void) | null = null;
    listen<AutoCaptureStatus>("auto-capture-status", (e) => {
      setAcStatus(e.payload);
    }).then((fn) => { unlisten = fn; });

    // Fallback lightweight poll every 5s (not 2s) while event isn't emitted yet
    const id = setInterval(() => {
      invoke<AutoCaptureStatus>("get_auto_capture_status")
        .then(setAcStatus)
        .catch(() => {});
    }, 5000);

    return () => {
      if (unlisten) unlisten();
      clearInterval(id);
    };
  }, []);

  const updateTheme = useCallback(async (theme: string) => {
    try {
      const updated = await invoke<AppConfig>("update_config", { partial: { theme } });
      setConfig(updated);
    } catch (e) {
      console.error("Failed to update theme:", e);
    }
  }, []);

  const updateOverlay = useCallback(async (key: string, value: unknown) => {
    if (!config) return;
    try {
      const updated = await invoke<AppConfig>("update_config", {
        partial: { overlay: { ...config.overlay, [key]: value } },
      });
      setConfig(updated);
    } catch (e) {
      console.error("Failed to update overlay:", e);
    }
  }, [config]);

  const setAccent = useCallback(async (color: string) => {
    try {
      await invoke<string>("set_accent_preset", { color });
      setConfig((prev) => prev ? { ...prev, overlay: { ...prev.overlay, cursor_accent: color } } : prev);
    } catch (e) {
      console.error("Failed to set accent:", e);
    }
  }, []);

  const toggleTutorMode = useCallback(async () => {
    try {
      const newState = await invoke<boolean>("toggle_tutor_mode");
      setConfig((prev) =>
        prev ? { ...prev, overlay: { ...prev.overlay, tutor_mode: newState } } : prev
      );
    } catch (e) {
      console.error("Failed to toggle tutor mode:", e);
    }
  }, []);

  const startAutoCapture = useCallback(async (mode?: string, intervalMs?: number) => {
    try {
      await invoke("start_auto_capture", {
        captureMode: mode,
        intervalMs,
      });
    } catch (e) {
      setAcError(String(e));
    }
  }, []);

  const stopAutoCapture = useCallback(async () => {
    try {
      await invoke("stop_auto_capture");
    } catch (e) {
      setAcError(String(e));
    }
  }, []);

  const clearAutoCapture = useCallback(async () => {
    try {
      await invoke("clear_auto_capture_cache");
    } catch (e) {
      setAcError(String(e));
    }
  }, []);

  const presets = config?.overlay.accent_presets ?? [];

  if (error) {
    return (
      <section className="settings-section">
        <h3>General</h3>
        <div className="settings-error">{error}</div>
      </section>
    );
  }

  if (!config) {
    return (
      <section className="settings-section">
        <h3>General</h3>
        <div className="skeleton-loader" />
      </section>
    );
  }

  return (
    <section className="settings-section">
      <h3>General</h3>
      <div className="setting-row">
        <label>Theme</label>
        <select
          className="setting-select"
          value={config.theme}
          onChange={(e) => updateTheme(e.target.value)}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
      <div className="setting-row">
        <label>Show Cursor Overlay</label>
        <input
          type="checkbox"
          checked={config.overlay.show_cursor}
          onChange={(e) => updateOverlay("show_cursor", e.target.checked)}
        />
      </div>
      <div className="setting-row">
        <label>Tutor Mode</label>
        <input
          type="checkbox"
          checked={config.overlay.tutor_mode}
          onChange={toggleTutorMode}
        />
      </div>
      <div className="setting-row">
        <label>Accent Color</label>
        <div className="accent-presets">
          {presets.map((c) => (
            <button
              key={c}
              type="button"
              className={`accent-swatch ${config.overlay.cursor_accent === c ? "active" : ""}`}
              style={{ backgroundColor: c }}
              onClick={() => setAccent(c)}
              title={c}
              aria-label={`Accent ${c}`}
            />
          ))}
          <input
            type="color"
            className="color-picker"
            value={config.overlay.cursor_accent}
            onChange={(e) => setAccent(e.target.value)}
            title="Custom accent"
          />
        </div>
      </div>
      <div className="setting-row">
        <label>Cursor Size</label>
        <input
          type="range"
          min={16}
          max={64}
          value={config.overlay.cursor_size}
          onChange={(e) => updateOverlay("cursor_size", parseInt(e.target.value))}
        />
        <span className="setting-value">{config.overlay.cursor_size}px</span>
      </div>
      <div className="setting-row">
        <label>Agent Dock Position</label>
        <select
          className="setting-select"
          value={config.overlay.agent_dock_position}
          onChange={(e) => updateOverlay("agent_dock_position", e.target.value)}
        >
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </div>

      <h3 className="settings-subhead">Auto-Capture (Continuous Context)</h3>
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

export default GeneralSettings;

