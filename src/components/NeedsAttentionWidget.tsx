import { Icon } from "./Icon";
import type { IconName } from "./Icon";

interface NeedsAttentionItem {
  type: "warning" | "error" | "info";
  message: string;
}

interface Props {
  items: NeedsAttentionItem[];
}

const typeIcons: Record<string, IconName> = {
  warning: "warning",
  error: "error",
  info: "info",
};

const typeColors: Record<string, string> = {
  warning: "var(--color-warning)",
  error: "var(--color-danger)",
  info: "var(--color-info)",
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
            <span className="attention-icon" style={{ color: typeColors[item.type] || "var(--text-secondary)" }}>
              <Icon name={typeIcons[item.type] ?? "info"} size={14} />
            </span>
            <span className="widget-item-title">{item.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default NeedsAttentionWidget;
