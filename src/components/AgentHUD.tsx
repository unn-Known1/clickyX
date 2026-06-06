/**
 * AgentHUD — Floating agent monitoring window
 * Opens as a separate Tauri WebView window via open_agent_hud command.
 * Reads agent slug from URL ?agent=<slug> param.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { commands } from "../bindings";
import { agentStatusColor, agentStatusLabel } from "../utils/agentStatus";
import type { AgentInfo } from "../bindings";
import "../styles/theme.css";

// ── Activity Timeline item ────────────────────────────────────────────────────
interface TimelineItem {
  time: string;
  event: string;
  type: "info" | "success" | "error" | "warning";
}

// ── Activity Timeline ─────────────────────────────────────────────────────────
function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="hud-timeline">
      {items.length === 0 ? (
        <p className="hud-empty">No activity yet.</p>
      ) : (
        items.map((item, i) => (
          <div key={i} className={`hud-timeline-item hud-tl-${item.type}`}>
            <span className="hud-tl-time">{item.time}</span>
            <span className="hud-tl-event">{item.event}</span>
          </div>
        ))
      )}
    </div>
  );
}

// ── Main HUD component ────────────────────────────────────────────────────────
export default function AgentHUD() {
  // Read slug from global var set by Tauri initialization script
  const slug = (window as any).__AGENT_SLUG || new URLSearchParams(window.location.search).get("agent") || "";
  const [activeSection, setActiveSection] = useState<"transcript" | "diff" | "timeline">("transcript");
  const [minimized, setMinimized] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Poll agent data
  const { data: agents = [], isLoading } = useQuery<AgentInfo[]>({
    queryKey: ["agents"],
    queryFn: () => commands.listAgents(),
    refetchInterval: 3000,
    enabled: !!slug,
  });

  const agent = agents.find((a) => a.slug === slug) ?? null;

  // Build timeline from transcript changes
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const prevTranscriptLen = useRef(0);

  useEffect(() => {
    if (!agent) return;
    const newLen = agent.transcript.length;
    if (newLen > prevTranscriptLen.current) {
      const newMsgs = agent.transcript.slice(prevTranscriptLen.current);
      const now = new Date().toLocaleTimeString();
      setTimeline((prev) => [
        ...prev,
        ...newMsgs.map((m) => ({
          time: now,
          event: `[${m.role}] ${m.content.slice(0, 80)}${m.content.length > 80 ? "…" : ""}`,
          type: m.role === "assistant" ? "success" : ("info" as TimelineItem["type"]),
        })),
      ]);
      prevTranscriptLen.current = newLen;
    }
    // Track state changes
    const statusLabel = agentStatusLabel(agent.state);
    setTimeline((prev) => {
      const last = prev.at(-1);
      if (last?.event.includes(`state: ${statusLabel}`)) return prev;
      return [
        ...prev,
        {
          time: new Date().toLocaleTimeString(),
          event: `State changed: ${statusLabel}`,
          type: statusLabel === "error" ? "error" : statusLabel === "running" ? "info" : "success",
        },
      ];
    });
  }, [agent?.state, agent?.transcript.length]);

  // Auto-scroll transcript
  useEffect(() => {
    if (activeSection === "transcript") {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [agent?.transcript.length, activeSection]);

  const closeWindow = useCallback(() => {
    window.close();
  }, []);

  if (!slug) {
    return (
      <div className="hud-error">
        <p>No agent slug provided. Open via the Agents tab.</p>
      </div>
    );
  }

  const statusColor = agent ? agentStatusColor(agent.state) : "#888";
  const statusLabel = agent ? agentStatusLabel(agent.state) : "unknown";

  return (
    <div className="agent-hud" data-tauri-drag-region="">
      {/* Title bar */}
      <div className="hud-titlebar" data-tauri-drag-region="">
        <div className="hud-title-left">
          <div
            className="hud-status-dot"
            style={{ backgroundColor: statusColor }}
            title={statusLabel}
          />
          <span className="hud-title">{agent?.name ?? slug}</span>
          <span className="hud-status-label">{statusLabel}</span>
        </div>
        <div className="hud-title-actions">
          <button
            className="hud-btn"
            onClick={() => setMinimized((v) => !v)}
            title={minimized ? "Restore" : "Minimize"}
            aria-label={minimized ? "Restore HUD" : "Minimize HUD"}
          >
            {minimized ? "▲" : "▼"}
          </button>
          <button
            className="hud-btn hud-btn-close"
            onClick={closeWindow}
            title="Close HUD"
            aria-label="Close Agent HUD"
          >
            ×
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Meta info */}
          {agent && (
            <div className="hud-meta">
              <span>Slug: {agent.slug}</span>
              <span>Updated: {new Date(Number(agent.updated_at) * 1000).toLocaleTimeString()}</span>
              <span>Skills: {agent.skills.join(", ") || "none"}</span>
            </div>
          )}

          {isLoading && !agent && (
            <div className="hud-loading">Loading agent data…</div>
          )}
          {!isLoading && !agent && (
            <div className="hud-error">Agent "{slug}" not found.</div>
          )}

          {/* Section tabs */}
          {agent && (
            <>
              <div className="hud-tabs" role="tablist">
                {(["transcript", "diff", "timeline"] as const).map((sec) => (
                  <button
                    key={sec}
                    role="tab"
                    aria-selected={activeSection === sec}
                    className={`hud-tab ${activeSection === sec ? "active" : ""}`}
                    onClick={() => setActiveSection(sec)}
                  >
                    {sec.charAt(0).toUpperCase() + sec.slice(1)}
                    {sec === "transcript" && agent.transcript.length > 0 && (
                      <span className="hud-badge">{agent.transcript.length}</span>
                    )}
                    {sec === "timeline" && timeline.length > 0 && (
                      <span className="hud-badge">{timeline.length}</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="hud-content">
                {activeSection === "transcript" && (
                  <div className="hud-transcript" role="log" aria-live="polite">
                    {agent.transcript.length === 0 ? (
                      <p className="hud-empty">No messages yet.</p>
                    ) : (
                      agent.transcript.map((msg, i) => (
                        <div key={i} className={`hud-msg hud-msg-${msg.role}`}>
                          <span className="hud-msg-role">{msg.role}</span>
                          <p className="hud-msg-content">{msg.content}</p>
                        </div>
                      ))
                    )}
                    <div ref={transcriptEndRef} />
                  </div>
                )}

                {activeSection === "diff" && (
                  <div className="hud-diff-view">
                    <p className="hud-empty">
                      File diffs will appear here when the agent modifies files.
                    </p>
                  </div>
                )}

                {activeSection === "timeline" && (
                  <Timeline items={timeline} />
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
