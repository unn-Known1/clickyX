import { useState, useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { message } from "@tauri-apps/plugin-dialog";

export default function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  const [version, setVersion] = useState("");
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    check()
      .then((update) => {
        if (update?.available) {
          setAvailable(true);
          setVersion(update.version ?? "");
        }
      })
      .catch(() => {
        // updater not configured / no network — silent fail
      });
  }, []);

  if (!available || dismissed) return null;

  const install = async () => {
    setInstalling(true);
    try {
      const update = await check();
      if (update?.available) {
        await update.downloadAndInstall();
        await message("Update installed! Please restart the app.", { title: "ClickyX Update", kind: "info" });
      }
      // Always leave the installing state on every completion path
      setInstalling(false);
      setAvailable(false);
      setDismissed(true);
    } catch (e) {
      console.error("Update failed:", e);
      setInstalling(false);
    }
  };

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <span className="update-banner-text">
        Update available: <strong>v{version}</strong>
      </span>
      <button
        className="update-banner-btn"
        onClick={install}
        disabled={installing}
      >
        {installing ? "Installing…" : "Install & Restart"}
      </button>
      <button
        className="update-banner-dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update notification"
      >
        ×
      </button>
    </div>
  );
}
