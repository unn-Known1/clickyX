import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useConfig } from "../../hooks/useConfig";
import type { AppConfig } from "../../bindings";
import { AppearanceSettings } from "./AppearanceSettings";
import { OverlayPrefsSettings } from "./OverlayPrefsSettings";
import { CaptureSettings } from "./CaptureSettings";
import { SUPPORTED_LOCALES } from "../../i18n";

function GeneralSettings() {
  const { t, i18n } = useTranslation();
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
        <h3>{t("settings.general")}</h3>
        <div className="settings-error">{error}</div>
      </section>
    );
  }

  if (loading || !config) {
    return (
      <section className="settings-section elevated-card">
        <h3>{t("settings.general")}</h3>
        <div className="skeleton-loader" />
      </section>
    );
  }

  return (
    <>
      <section className="settings-section elevated-card">
        <h3>{t("settings.startup")}</h3>
        <div className="setting-row">
          <label>{t("settings.checkUpdates")}</label>
          <input
            type="checkbox"
            checked={config.check_updates_on_startup ?? true}
            onChange={(e) => updateConfig({ check_updates_on_startup: e.target.checked })}
            aria-label={t("settings.checkUpdates")}
          />
        </div>
        <p className="settings-hint">
          {t("settings.startupHint")}
        </p>
      </section>
      <section className="settings-section elevated-card">
        <h3>{t("settings.languageTitle")}</h3>
        <div className="setting-row">
          <label>{t("settings.languageLabel")}</label>
          <select
            className="setting-select"
            value={i18n.language}
            onChange={(e) => void i18n.changeLanguage(e.target.value)}
          >
            {SUPPORTED_LOCALES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
        <p className="settings-hint">
          {t("settings.languageHint")}
        </p>
      </section>
      <AppearanceSettings config={config} onConfigUpdate={syncConfigCache} />
      <OverlayPrefsSettings config={config} onConfigUpdate={syncConfigCache} />
      <CaptureSettings />
    </>
  );
}

export default GeneralSettings;
