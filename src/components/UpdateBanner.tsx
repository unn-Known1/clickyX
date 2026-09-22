import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { commands, listen } from "../bindings";
import type { UpdateInfo } from "../bindings";
import { message } from "@tauri-apps/plugin-dialog";

/**
 * P0-T3: driven by the custom backend updater (updater.rs), NOT the disabled
 * Tauri plugin-updater. Listens for the backend "update-available" event and
 * checks on mount. Installs only after minisign verification (fail-closed —
 * unsigned artifacts are refused by the backend with an error shown here).
 */
export default function UpdateBanner() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    commands.checkForUpdates()
      .then((update) => {
        if (!cancelled && update?.available && update.download_url) {
          setInfo(update);
        }
      })
      .catch(() => {
        // update server unreachable / updater disabled — silent fail
      });
    let unlisten: (() => void) | undefined;
    listen<UpdateInfo>("update-available", (event) => {
      if (!cancelled && event.payload?.available && event.payload.download_url) {
        setInfo(event.payload);
      }
    }).then((u) => { unlisten = u; }).catch(() => {});
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  const install = useCallback(async () => {
    if (!info?.download_url) return;
    setInstalling(true);
    setError(null);
    try {
      await commands.installUpdate(info.download_url, info.signature ?? null);
      await message(t("updater.installedMsg"), { title: t("updater.installedTitle"), kind: "info" });
      setInfo(null);
      setDismissed(true);
    } catch (e) {
      console.error("Update failed:", e);
      // Fail-closed refusal (e.g. unsigned artifact) surfaces here, not silently.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
  }, [info, t]);

  if (!info || dismissed) return null;

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <span className="update-banner-text">
        {t("updater.available")} <strong>v{info.version ?? "?"}</strong>
      </span>
      {error && (
        <span className="update-banner-text" role="alert">
          {t("updater.refused")} {error}
        </span>
      )}
      <button
        className="update-banner-btn"
        onClick={install}
        disabled={installing}
      >
        {installing ? t("updater.installing") : t("updater.installRestart")}
      </button>
      <button
        className="update-banner-dismiss"
        onClick={() => setDismissed(true)}
        aria-label={t("updater.dismiss")}
      >
        ×
      </button>
    </div>
  );
}
