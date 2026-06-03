import { useState, useCallback } from "react";
import ChatTab from "./ChatTab";
import { useAgents } from "../hooks/useAgents";

const suggestions = [
  "What can you help me with?",
  "Take a screenshot and explain it",
  "Summarize what's on my screen",
  "Open settings",
];

const agentStatusColor: Record<string, string> = {
  idle: "#ff9800",
  created: "#ff9800",
  running: "#4caf50",
  done: "#4fc3f7",
  completed: "#4fc3f7",
  error: "#f44336",
  failed: "#f44336",
  paused: "#a0a0b0",
  archived: "#555",
};

function AgentDockStrip() {
  const { agents, loading } = useAgents();

  if (loading || agents.length === 0) return null;

  return (
    <div className="agent-dock-strip">
      <span className="agent-dock-label">Agents</span>
      <div className="agent-dock-items">
        {agents.slice(0, 6).map((agent) => {
          const status = agent.state.toLowerCase();
          const color = agentStatusColor[status] || "#a0a0b0";
          return (
            <div
              key={agent.slug}
              className="agent-dock-item"
              title={`${agent.name} (${status})`}
            >
              <span
                className="agent-dock-dot"
                style={{ backgroundColor: color }}
              />
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

  const handleSuggestion = useCallback((suggestion: string) => {
    setShowChat(true);
    const input = document.querySelector(".chat-input") as HTMLInputElement;
    if (input) {
      input.value = suggestion;
      input.focus();
    }
  }, []);

  if (showChat) {
    return (
      <div className="home-tab">
        <ChatTab />
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
          <button
            key={s}
            className="suggestion-chip"
            onClick={() => handleSuggestion(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

export default HomeTab;
