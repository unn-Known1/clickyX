interface ActiveAgent {
  id: string;
  title: string;
  status: "running" | "idle" | "error";
}

interface Props {
  agents: ActiveAgent[];
}

const statusColors: Record<string, string> = {
  running: "#4caf50",
  idle: "#ff9800",
  error: "#f44336",
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
