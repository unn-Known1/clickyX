import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ChatTab from "./ChatTab";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { useAgents } from "../hooks/useAgents";
import { agentStatusColor, agentStatusLabel } from "../utils/agentStatus";
import { useAppContext } from "../context/AppContext";
import { listen } from "../bindings";

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Hi";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// ── Suggestion catalog: known prompts get a matching icon + description ──────
interface SuggestionMeta {
  icon: IconName;
  description: string;
}

const SUGGESTION_CATALOG: Record<string, SuggestionMeta> = {
  "What's on my screen?": {
    icon: "screen",
    description: "Ask about what's visible right now",
  },
  "Summarize this document": {
    icon: "file",
    description: "Get a concise overview",
  },
  "Help me debug this code": {
    icon: "code",
    description: "Find and fix the error",
  },
  "Write a professional email": {
    icon: "mail",
    description: "Draft a polished message",
  },
};

const FALLBACK_SUGGESTION: SuggestionMeta = {
  icon: "sparkle",
  description: "Continue the conversation",
};

function suggestionMeta(prompt: string): SuggestionMeta {
  return SUGGESTION_CATALOG[prompt] ?? FALLBACK_SUGGESTION;
}

const DEFAULT_SUGGESTIONS = [
  "What's on my screen?",
  "Summarize this document",
  "Help me debug this code",
  "Write a professional email",
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

// F-027: Empty-state CTA when no agents exist
function EmptyAgentsCTA({ onCreateAgent }: { onCreateAgent: () => void }) {
  return (
    <div className="empty-agents-cta">
      <div className="empty-icon">✦</div>
      <h3>Create your first agent</h3>
      <p>Agents can automate tasks, answer questions, and control your computer.</p>
      <button className="btn btn-primary" onClick={onCreateAgent}>
        Create Agent
      </button>
    </div>
  );
}

function HomeTab() {
  const [showChat, setShowChat] = useState(false);
  const [initialSuggestion, setInitialSuggestion] = useState<string | null>(null);
  const { agents, loading: agentsLoading } = useAgents();
  const { setActiveTab } = useAppContext();
  const queryClient = useQueryClient();

  // F-003: invalidate today-stats cache when any agent completes/errors so the
  // home card reflects real-time results without waiting for the 30s poll.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen("agent-state-changed", () => {
      void queryClient.invalidateQueries({ queryKey: ["today-stats"] });
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, [queryClient]);

  // F-026: Dynamic suggestions from recent prompts
  const { data: suggestions = DEFAULT_SUGGESTIONS } = useQuery({
    queryKey: ["home-suggestions"],
    queryFn: async (): Promise<string[]> => {
      try {
        const raw = sessionStorage.getItem("recent_prompts");
        if (!raw) return DEFAULT_SUGGESTIONS;
        const recent = JSON.parse(raw);
        if (!Array.isArray(recent) || recent.length === 0) return DEFAULT_SUGGESTIONS;
        return recent
          .filter((s: unknown): s is string => typeof s === "string" && s.length > 0)
          .slice(0, 4);
      } catch {
        return DEFAULT_SUGGESTIONS;
      }
    },
    staleTime: 60_000,
  });

  const handleSuggestion = useCallback((suggestion: string) => {
    setInitialSuggestion(suggestion);
    setShowChat(true);

    // Record this prompt for future suggestions
    try {
      const recent = JSON.parse(sessionStorage.getItem("recent_prompts") || "[]") as string[];
      const updated = [suggestion, ...recent.filter((s) => s !== suggestion)].slice(0, 20);
      sessionStorage.setItem("recent_prompts", JSON.stringify(updated));
    } catch {
      // non-fatal
    }
  }, []);

  if (showChat) {
    return (
      <div className="home-tab home-chat-mode">
        <button className="home-back-btn" onClick={() => setShowChat(false)} aria-label="Back to home">
          <Icon name="chevron-left" size={14} />
          Back
        </button>
        <ChatTab initialText={initialSuggestion ?? undefined} />
      </div>
    );
  }

  return (
    <div className="home-tab">
      <AgentDockStrip />

      {/* F-027: Empty agents CTA */}
      {!agentsLoading && agents.length === 0 && (
        <EmptyAgentsCTA onCreateAgent={() => setActiveTab("agents")} />
      )}

      <div className="hero-card">
        <h1>
          {timeGreeting()}, I'm <span className="hero-brand">ClickyX</span>
        </h1>
        <p>Your AI companion — ask me anything about your screen.</p>
      </div>
      <button className="start-chat-btn" onClick={() => setShowChat(true)}>
        Start a conversation
      </button>

      {/* F-026: Dynamic suggestion chips with icons + descriptions */}
      <div className="suggestions-grid">
        {suggestions.map((s) => {
          const meta = suggestionMeta(s);
          return (
            <button
              key={s}
              type="button"
              className="suggestion-chip"
              onClick={() => handleSuggestion(s)}
              aria-label={`${s} — ${meta.description}`}
            >
              <span className="suggestion-chip-icon" aria-hidden="true">
                <Icon name={meta.icon} size={16} />
              </span>
              <span className="suggestion-chip-text">
                <span className="suggestion-chip-label">{s}</span>
                <span className="suggestion-chip-desc">{meta.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default HomeTab;
