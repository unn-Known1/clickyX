import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "../bindings";

interface Props {
  onClose: () => void;
}

export default function AboutDialog({ onClose }: Props) {
  const { t } = useTranslation();
  const [version, setVersion] = useState("…");

  useEffect(() => {
    let cancelled = false;
    commands.getAppVersion().then((v) => { if (!cancelled) setVersion(v); }).catch(() => { if (!cancelled) setVersion(t("about.unknown")); });
    return () => { cancelled = true; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={t("about.label")} onClick={onClose}>
      <div className="dialog-box about-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="dialog-close" onClick={onClose} aria-label={t("about.close")}>×</button>
        <div className="about-logo">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="#0f3460" />
            <polygon points="10,38 24,10 38,38" fill="#4fc3f7" opacity="0.9" />
            <polygon points="18,38 24,22 30,38" fill="#29b6f6" opacity="0.6" />
          </svg>
        </div>
        <h2 className="about-name">ClickyX</h2>
        <p className="about-version">{t("about.version", { v: version })}</p>
        <p className="about-desc">
          {t("about.desc")}
        </p>
        <div className="about-links">
          <a
            href="https://github.com/unn-Known1/clickyX"
            target="_blank"
            rel="noopener noreferrer"
            className="about-link"
          >
            GitHub
          </a>
          <span className="about-sep">·</span>
          <span className="about-copy">© 2026 ClickyX Contributors</span>
        </div>
        <p className="about-build-info">{t("about.builtWith")}</p>
      </div>
    </div>
  );
}
