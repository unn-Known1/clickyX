import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "../../bindings";
import type { AppConfig } from "../../bindings";

interface Props {
  config: AppConfig;
  // Cache sync ONLY — the caller never re-invokes. Each handler below
  // performs exactly one backend write (P1/H-3 single-write path).
  onConfigUpdate: (updated: AppConfig) => void;
}

export function OverlayPrefsSettings({ config, onConfigUpdate }: Props) {
  const { t } = useTranslation();
  const updateOverlay = useCallback(async (key: string, value: string | number | boolean) => {
    try {
      const overlay = { ...config.overlay, [key]: value } as AppConfig["overlay"];
      const updated = await commands.updateConfig({ overlay });
      onConfigUpdate(updated);
    } catch (e) {
      console.error("Failed to update overlay:", e);
    }
  }, [config, onConfigUpdate]);

  const toggleTutorMode = useCallback(async () => {
    try {
      // toggle_tutor_mode persists server-side — sync cache, no second write.
      const newState = await commands.toggleTutorMode();
      onConfigUpdate({ ...config, overlay: { ...config.overlay, tutor_mode: newState } });
    } catch (e) {
      console.error("Failed to toggle tutor mode:", e);
    }
  }, [config, onConfigUpdate]);

  return (
    <section className="settings-section elevated-card">
      <h3>{t("overlay.title")}</h3>

      <div className="setting-row">
        <label>{t("overlay.showCursor")}</label>
        <input
          type="checkbox"
          checked={config.overlay.show_cursor}
          onChange={(e) => updateOverlay("show_cursor", e.target.checked)}
        />
      </div>

      <div className="setting-row">
        <label>{t("overlay.tutorMode")}</label>
        <input
          type="checkbox"
          checked={config.overlay.tutor_mode}
          onChange={toggleTutorMode}
        />
      </div>

      <div className="setting-row">
        <label>{t("overlay.cursorSize")}</label>
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
        <label>{t("overlay.dockPosition")}</label>
        <select
          className="setting-select"
          value={config.overlay.agent_dock_position}
          onChange={(e) => updateOverlay("agent_dock_position", e.target.value)}
        >
          <option value="top">{t("overlay.top")}</option>
          <option value="bottom">{t("overlay.bottom")}</option>
          <option value="left">{t("overlay.left")}</option>
          <option value="right">{t("overlay.right")}</option>
        </select>
      </div>
    </section>
  );
}
