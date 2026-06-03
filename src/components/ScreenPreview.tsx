import { useState } from "react";

interface ScreenPreviewProps {
  data: string;
  width: number;
  height: number;
  monitor_id: number;
  label?: string;
}

function ScreenPreview({ data, width, height, label }: ScreenPreviewProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`screen-preview ${expanded ? "expanded" : ""}`}>
      {label && <div className="screen-preview-label">{label}</div>}
      <img
        src={`data:image/jpeg;base64,${data}`}
        alt={`Screen ${width}x${height}`}
        className="screen-preview-thumb"
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: "pointer", maxWidth: expanded ? "100%" : "200px" }}
      />
      <div className="screen-preview-meta">
        {width}×{height}
      </div>
    </div>
  );
}

export default ScreenPreview;
