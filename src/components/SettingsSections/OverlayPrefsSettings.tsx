import { useCallback } from "react";
import { invoke } from "../../bindings";

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

interface Props {
  config: AppConfig;
  onConfigUpdate: (updated: AppConfig) => void;
}

export function OverlayPrefsSettings({ config, onConfigUpdate }: Props) {
  const updateOverlay = useCallback(async (key: string, value: unknown) => {
    try {
      const updated = await invoke<AppConfig>("update_config", {
        partial: { overlay: { ...config.overlay, [key]: value } },
      });
      onConfigUpdate(updated);
    } catch (e) {
      console.error("Failed to update overlay:", e);
    }
  }, [config, onConfigUpdate]);

  const toggleTutorMode = useCallback(async () => {
    try {
      const newState = await invoke<boolean>("toggle_tutor_mode");
      onConfigUpdate({ ...config, overlay: { ...config.overlay, tutor_mode: newState } });
    } catch (e) {
      console.error("Failed to toggle tutor mode:", e);
    }
  }, [config, onConfigUpdate]);

  return (
    <section className="settings-section elevated-card">
      <h3>Overlay Preferences</h3>

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
