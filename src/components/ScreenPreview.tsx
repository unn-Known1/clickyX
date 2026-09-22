import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";

interface ScreenPreviewProps {
  data: string;
  width: number;
  height: number;
  label?: string;
}

function toDataUrl(data: string): string {
  if (data.startsWith("data:")) return data;
  return `data:image/jpeg;base64,${data}`;
}

function ScreenPreview({ data, width, height, label }: ScreenPreviewProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [broken, setBroken] = useState(false);

  const handleError = useCallback(() => setBroken(true), []);

  if (broken) {
    return (
      <div className={`screen-preview ${expanded ? "expanded" : ""}`}>
        {label && <div className="screen-preview-label">{label}</div>}
        <div className="screen-preview-placeholder">
          <span>{t("misc.imageUnavailable")}</span>
        </div>
        <div className="screen-preview-meta">{width}×{height}</div>
      </div>
    );
  }

  return (
    <div className={`screen-preview ${expanded ? "expanded" : ""}`}>
      {label && <div className="screen-preview-label">{label}</div>}
      <img
        src={toDataUrl(data)}
        alt={`Screen capture ${width}×${height}`}
        className="screen-preview-thumb"
        onClick={() => setExpanded((v) => !v)}
        onError={handleError}
        style={{ cursor: "pointer", maxWidth: expanded ? "100%" : "200px" }}
      />
      <div className="screen-preview-meta">{width}×{height}</div>
    </div>
  );
}

export default ScreenPreview;
