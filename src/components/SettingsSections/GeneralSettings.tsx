import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface OverlayPrefs {
  cursor_accent: string;
  cursor_size: number;
  show_cursor: boolean;
  tutor_mode: boolean;
  agent_dock_position: string;
}

interface AppConfig {
  theme: string;
  overlay: OverlayPrefs;
}

function GeneralSettings() {
  const [config, setConfig] = useState<AppConfig | null>(null);
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
        <label>Cursor Accent</label>
        <input
          type="color"
          className="color-picker"
          value={config.overlay.cursor_accent}
          onChange={(e) => updateOverlay("cursor_accent", e.target.value)}
        />
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
    </section>
  );
}

export default GeneralSettings;
