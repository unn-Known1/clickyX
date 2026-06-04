import { useState, useCallback } from "react";
import ChatTab from "./ChatTab";
import { useAgents } from "../hooks/useAgents";
import { agentStatusColor, agentStatusLabel } from "../utils/agentStatus";
import { useAppContext } from "../context/AppContext";

const suggestions = [
  "What can you help me with?",
  "Take a screenshot and explain it",
  "Summarize what's on my screen",
  "Open settings",
];

function AgentDockStrip() {
  const { agents, loading } = useAgents();
  const { setActiveTab } = useAppContext();

  if (loading || agents.length === 0) return null;

  return (
    <div className="agent-dock-strip" role="list" aria-label="Active agents">
      <span className="agent-dock-label">Agents</span>
      <div className="agent-dock-items">
        {agents.slice(0, 6).map((agent) => {
          const label = agentStatusLabel(agent.state);
          const color = agentStatusColor(agent.state);
          return (
            <div
              key={agent.slug}
              className="agent-dock-item"
              title={`${agent.name} (${label})`}
              role="listitem"
              onClick={() => setActiveTab("agents")}
              style={{ cursor: "pointer" }}
            >
              <span className="agent-dock-dot" style={{ backgroundColor: color }} />
              <span className="agent-dock-name">{agent.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HomeTab() {
  const [showChat, setShowChat] = useState(false);
  const [initialSuggestion, setInitialSuggestion] = useState<string | null>(null);

  const handleSuggestion = useCallback((suggestion: string) => {
    setInitialSuggestion(suggestion);
    setShowChat(true);
  }, []);

  if (showChat) {
    return (
      <div className="home-tab">
        <button className="home-back-btn" onClick={() => setShowChat(false)} aria-label="Back to home">
          ← Back
        </button>
        <ChatTab initialText={initialSuggestion ?? undefined} />
      </div>
    );
  }

  return (
    <div className="home-tab">
      <AgentDockStrip />
      <div className="hero-card">
        <h1>Hi, I'm ClickyX</h1>
        <p>Your AI companion — ask me anything about your screen.</p>
      </div>
      <button className="start-chat-btn" onClick={() => setShowChat(true)}>
        Start a conversation
      </button>
      <div className="suggestions-grid">
        {suggestions.map((s) => (
          <button key={s} className="suggestion-chip" onClick={() => handleSuggestion(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

export default HomeTab;
