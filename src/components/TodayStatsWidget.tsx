interface Props {
  agentsRun: number;
  voiceCommands: number;
  itemsForReview: number;
}

function TodayStatsWidget({ agentsRun, voiceCommands, itemsForReview }: Props) {
  return (
    <div className="widget today-stats-widget">
      <h3 className="widget-title">Today's Stats</h3>
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-value">{agentsRun}</span>
          <span className="stat-label">Agents</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{voiceCommands}</span>
          <span className="stat-label">Voice</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{itemsForReview}</span>
          <span className="stat-label">Review</span>
        </div>
      </div>
    </div>
  );
}

export default TodayStatsWidget;
