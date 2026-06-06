import { useConfig } from "../../hooks/useConfig";
import { AppearanceSettings } from "./AppearanceSettings";
import { OverlayPrefsSettings } from "./OverlayPrefsSettings";
import { CaptureSettings } from "./CaptureSettings";

function GeneralSettings() {
  const { config, updateConfig, loading, error } = useConfig();

  if (error) {
    return (
      <section className="settings-section">
        <h3>General</h3>
        <div className="settings-error">{error}</div>
      </section>
    );
  }

  if (loading || !config) {
    return (
      <section className="settings-section">
        <h3>General</h3>
        <div className="skeleton-loader" />
      </section>
    );
  }

  return (
    <>
      <AppearanceSettings config={config} onConfigUpdate={(updated) => updateConfig(updated as any)} />
      <OverlayPrefsSettings config={config} onConfigUpdate={(updated) => updateConfig(updated as any)} />
      <CaptureSettings />
    </>
  );
}

export default GeneralSettings;
