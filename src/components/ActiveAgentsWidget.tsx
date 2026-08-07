interface ActiveAgent {
  id: string;
  title: string;
  status: "running" | "idle" | "error";
}

interface Props {
  agents: ActiveAgent[];
}

// Colors come from the shared status tokens in theme.css — single source of truth.
const statusColors: Record<string, string> = {
  running: "var(--status-running)",
  idle: "var(--status-idle)",
  error: "var(--status-error)",
};

function ActiveAgentsWidget({ agents }: Props) {
  if (agents.length === 0) {
    return (
      <div className="widget active-agents-widget">
        <h3 className="widget-title">Active Agents</h3>
        <p className="widget-empty">No agents running</p>
      </div>
    );
  }

  return (
    <div className="widget active-agents-widget">
      <h3 className="widget-title">Active Agents</h3>
      <div className="widget-list">
        {agents.map((agent) => (
          <div key={agent.id} className="widget-item">
            <span
              className="status-dot"
              style={{ background: statusColors[agent.status] || "#999" }}
            />
            <span className="widget-item-title">{agent.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ActiveAgentsWidget;
