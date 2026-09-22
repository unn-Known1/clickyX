import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConfig } from "../../hooks/useConfig";
import type { AppConfig } from "../../bindings";
import { AppearanceSettings } from "./AppearanceSettings";
import { OverlayPrefsSettings } from "./OverlayPrefsSettings";
import { CaptureSettings } from "./CaptureSettings";

function GeneralSettings() {
  const { config, updateConfig, loading, error } = useConfig();
  const queryClient = useQueryClient();

  // P1 (H-3): SINGLE config write path. Children perform exactly one backend
  // invoke per interaction, then sync the returned state here — the old code
  // invoked update_config and THEN called updateConfig(), writing twice.
  const syncConfigCache = useCallback((updated: AppConfig) => {
    queryClient.setQueryData(["config"], updated);
  }, [queryClient]);

  if (error) {
    return (
      <section className="settings-section elevated-card">
        <h3>General</h3>
        <div className="settings-error">{error}</div>
      </section>
    );
  }

  if (loading || !config) {
    return (
      <section className="settings-section elevated-card">
        <h3>General</h3>
        <div className="skeleton-loader" />
      </section>
    );
  }

  return (
    <>
      <section className="settings-section elevated-card">
        <h3>Startup</h3>
        <div className="setting-row">
          <label>Check for updates on startup</label>
          <input
            type="checkbox"
            checked={config.check_updates_on_startup ?? true}
            onChange={(e) => updateConfig({ check_updates_on_startup: e.target.checked })}
            aria-label="Check for updates on startup"
          />
        </div>
        <p className="settings-hint">
          Version-check traffic only (no identifiers). Disable for a fully offline launch.
        </p>
      </section>
      <AppearanceSettings config={config} onConfigUpdate={syncConfigCache} />
      <OverlayPrefsSettings config={config} onConfigUpdate={syncConfigCache} />
      <CaptureSettings />
    </>
  );
}

export default GeneralSettings;
