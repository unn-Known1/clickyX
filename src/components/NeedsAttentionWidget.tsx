interface NeedsAttentionItem {
  type: "warning" | "error" | "info";
  message: string;
}

interface Props {
  items: NeedsAttentionItem[];
}

const typeIcons: Record<string, string> = {
  warning: "\u26a0",
  error: "\u2716",
  info: "\u2139",
};

const typeColors: Record<string, string> = {
  warning: "#ff9800",
  error: "#f44336",
  info: "#2196f3",
};

function NeedsAttentionWidget({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="widget needs-attention-widget">
        <h3 className="widget-title">Needs Attention</h3>
        <p className="widget-empty">All clear</p>
      </div>
    );
  }

  return (
    <div className="widget needs-attention-widget">
      <h3 className="widget-title">Needs Attention</h3>
      <div className="widget-list">
        {items.map((item, i) => (
          <div key={i} className="widget-item attention-item">
            <span className="attention-icon" style={{ color: typeColors[item.type] || "#999" }}>
              {typeIcons[item.type] || "?"}
            </span>
            <span className="widget-item-title">{item.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default NeedsAttentionWidget;
