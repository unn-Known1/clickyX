import { useState, useEffect } from "react";
import { invoke } from "../../bindings";
import { AppearanceSettings } from "./AppearanceSettings";
import { OverlayPrefsSettings } from "./OverlayPrefsSettings";
import { CaptureSettings } from "./CaptureSettings";

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
    <>
      <AppearanceSettings config={config} onConfigUpdate={setConfig} />
      <OverlayPrefsSettings config={config} onConfigUpdate={setConfig} />
      <CaptureSettings />
    </>
  );
}

export default GeneralSettings;
