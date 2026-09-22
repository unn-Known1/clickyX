import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ChatTab from "./ChatTab";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { useAgents } from "../hooks/useAgents";
import { agentStatusColor, agentStatusLabel } from "../utils/agentStatus";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../context/AppContext";
import { useTauriEvent } from "../hooks/useTauriEvent";

function timeGreeting(t: (k: string) => string): string {
  const h = new Date().getHours();
  if (h < 5) return t("home.greetHi");
  if (h < 12) return t("home.greetMorning");
  if (h < 18) return t("home.greetAfternoon");
  return t("home.greetEvening");
}

// ── Suggestion catalog: known prompts get a matching icon + description ──────
// Prompts are keyed by stable id and resolved through i18n so the starter
// chips follow the interface language. User-typed recents stay as typed.
interface SuggestionDef {
  id: "screen" | "doc" | "debug" | "email";
  icon: IconName;
  promptKey: string;
  descKey: string;
}

const SUGGESTION_DEFS: SuggestionDef[] = [
  { id: "screen", icon: "screen", promptKey: "home.sugScreen", descKey: "home.sugScreenDesc" },
  { id: "doc",    icon: "file",   promptKey: "home.sugDoc",    descKey: "home.sugDocDesc" },
  { id: "debug",  icon: "code",   promptKey: "home.sugDebug",   descKey: "home.sugDebugDesc" },
  { id: "email",  icon: "mail",   promptKey: "home.sugEmail",   descKey: "home.sugEmailDesc" },
];

function AgentDockStrip() {
  const { t } = useTranslation();
  const { agents, loading } = useAgents();
  const { setActiveTab } = useAppContext();

  if (loading || agents.length === 0) return null;

  return (
    <div className="agent-dock-strip" role="list" aria-label={t("home.dockAria")}>
      <span className="agent-dock-label">{t("home.dockLabel")}</span>
      <div className="agent-dock-items">
        {agents.slice(0, 6).map((agent) => {
          const label = agentStatusLabel(agent.state);
          const color = agentStatusColor(agent.state);
          return (
            <div
              key={agent.slug}
              className="agent-dock-item clickable"
              title={`${agent.name} (${label})`}
              role="listitem"
              onClick={() => setActiveTab("agents")}
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
  const { t } = useTranslation();
  return (
    <div className="empty-agents-cta">
      <div className="empty-icon">✦</div>
      <h3>{t("home.emptyTitle")}</h3>
      <p>{t("home.emptyBody")}</p>
      <button className="btn btn-primary" onClick={onCreateAgent}>
        {t("agents.createAgent")}
      </button>
    </div>
  );
}

function HomeTab() {
  const { t } = useTranslation();
  const [showChat, setShowChat] = useState(false);
  const [initialSuggestion, setInitialSuggestion] = useState<string | null>(null);
  const { agents, loading: agentsLoading } = useAgents();
  const { setActiveTab } = useAppContext();
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();

  // F-003: invalidate today-stats cache when any agent completes/errors so the
  // home card reflects real-time results without waiting for the 30s poll.
  // P1 (H-4): shared listener helper — no unmount race.
  useTauriEvent("agent-state-changed", () => {
    void queryClient.invalidateQueries({ queryKey: ["today-stats"] });
  });

  // Translated starter prompts (recomputed when the language changes).
  const defaultSuggestions = [
    t("home.sugScreen"),
    t("home.sugDoc"),
    t("home.sugDebug"),
    t("home.sugEmail"),
  ];
  // prompt text -> { icon, description } for the starters above.
  const metaByPrompt = new Map(
    SUGGESTION_DEFS.map((d) => [t(d.promptKey), { icon: d.icon, description: t(d.descKey) }]),
  );

  // F-026: Dynamic suggestions from recent prompts
  const { data: suggestions = defaultSuggestions } = useQuery({
    queryKey: ["home-suggestions", i18n.language],
    queryFn: async (): Promise<string[]> => {
      try {
        const raw = sessionStorage.getItem("recent_prompts");
        if (!raw) return defaultSuggestions;
        const recent = JSON.parse(raw);
        if (!Array.isArray(recent) || recent.length === 0) return defaultSuggestions;
        return recent
          .filter((s: unknown): s is string => typeof s === "string" && s.length > 0)
          .slice(0, 4);
      } catch {
        return defaultSuggestions;
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
        <button className="home-back-btn" onClick={() => setShowChat(false)} aria-label={t("home.backAria")}>
          <Icon name="chevron-left" size={14} />
          {t("home.back")}
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
          {timeGreeting(t)}, I'm <span className="hero-brand">ClickyX</span>
        </h1>
        <p>{t("home.subtitle")}</p>
      </div>
      <button className="start-chat-btn" onClick={() => setShowChat(true)}>
        {t("home.startChat")}
      </button>

      {/* F-026: Dynamic suggestion chips with icons + descriptions */}
      <div className="suggestions-grid">
        {suggestions.map((s) => {
          const meta = metaByPrompt.get(s) ?? { icon: "sparkle" as IconName, description: t("home.sugFallbackDesc") };
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
