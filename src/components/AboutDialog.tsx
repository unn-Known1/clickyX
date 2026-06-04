import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  onClose: () => void;
}

export default function AboutDialog({ onClose }: Props) {
  const [version, setVersion] = useState("…");

  useEffect(() => {
    invoke<string>("get_app_version").then(setVersion).catch(() => setVersion("unknown"));
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="About ClickyX" onClick={onClose}>
      <div className="dialog-box about-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="dialog-close" onClick={onClose} aria-label="Close">×</button>
        <div className="about-logo">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="#0f3460" />
            <polygon points="10,38 24,10 38,38" fill="#4fc3f7" opacity="0.9" />
            <polygon points="18,38 24,22 30,38" fill="#29b6f6" opacity="0.6" />
          </svg>
        </div>
        <h2 className="about-name">ClickyX</h2>
        <p className="about-version">Version {version}</p>
        <p className="about-desc">
          Cross-platform AI companion with voice, screen context, agent mode,
          cursor overlay, and integrations.
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
        <p className="about-build-info">Built with Tauri · React · Rust</p>
      </div>
    </div>
  );
}
