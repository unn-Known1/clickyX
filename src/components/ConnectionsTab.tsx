import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "../context/AppContext";
import { SkeletonList } from "./SkeletonLoader";

interface McpServer {
  id?: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
}

interface Automation {
  id: string;
  name: string;
  prompt: string;
  schedule: { type: string; seconds?: number; expression?: string };
  agent_slug?: string;
  enabled: boolean;
  last_run?: string;
}

interface AutomationRun {
  id: string;
  started_at: string;
  finished_at?: string;
  status: "success" | "error" | "running";
  duration_ms?: number;
  error?: string;
}

interface WorkspaceStatus {
  available: boolean;
  authenticated: boolean;
  email?: string;
  scopes?: string[];
}

import ActiveAgentsWidget from "./ActiveAgentsWidget";
import TodayStatsWidget from "./TodayStatsWidget";
import NeedsAttentionWidget from "./NeedsAttentionWidget";
import { useAgents } from "../hooks/useAgents";

interface ActiveAgent {
  id: string;
  title: string;
  status: "running" | "idle" | "error";
}

interface NeedsAttentionItem {
  type: "warning" | "error" | "info";
  message: string;
}

// P-007: App Usage Logging component
interface AppUsageEntry {
  app: string;
  duration_secs: number;
  last_seen: string;
  interaction_count: number;
}

function AppUsageLog({ showToast }: { showToast: (msg: string, type?: import("../context/AppContext").ToastType) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [clearing, setClearing] = useState(false);

  const { data: usageLog = [], refetch } = useQuery<AppUsageEntry[]>({
    queryKey: ["app-usage-log"],
    queryFn: () => invoke<AppUsageEntry[]>("get_app_usage_log").catch(() => []),
    enabled: expanded,
    staleTime: 10_000,
  });

  const clearLog = async () => {
    setClearing(true);
    try {
      await invoke("clear_app_usage_log");
      refetch();
      showToast("Usage log cleared", "success");
    } catch {
      showToast("Failed to clear log", "error");
    } finally {
      setClearing(false);
    }
  };

  return (
    <section className="connections-section">
      <div
        className="section-header"
        style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
      >
        <span style={{ fontSize: 12, opacity: 0.5 }}>{expanded ? "▾" : "▸"}</span>
        <h3 style={{ margin: 0 }}>App Usage Log</h3>
        {usageLog.length > 0 && (
          <span className="agent-skill-badge" style={{ marginLeft: "auto" }}>
            {usageLog.length} apps
          </span>
        )}
      </div>

      {expanded && (
        <div style={{ marginTop: 8 }}>
          {usageLog.length === 0 ? (
            <p className="empty-state-text">No app usage data collected yet. Usage is tracked when ClickyX detects active applications.</p>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button
                  className="btn-secondary btn-sm"
                  onClick={clearLog}
                  disabled={clearing}
                >
                  {clearing ? "Clearing…" : "Clear Log"}
                </button>
              </div>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ opacity: 0.6, textAlign: "left" }}>
                    <th style={{ padding: "4px 8px" }}>App</th>
                    <th style={{ padding: "4px 8px" }}>Time</th>
                    <th style={{ padding: "4px 8px" }}>Interactions</th>
                    <th style={{ padding: "4px 8px" }}>Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {usageLog.map((entry) => (
                    <tr key={entry.app} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "4px 8px", fontWeight: 500 }}>{entry.app}</td>
                      <td style={{ padding: "4px 8px" }}>
                        {entry.duration_secs >= 3600
                          ? `${(entry.duration_secs / 3600).toFixed(1)}h`
                          : entry.duration_secs >= 60
                          ? `${Math.round(entry.duration_secs / 60)}m`
                          : `${entry.duration_secs}s`}
                      </td>
                      <td style={{ padding: "4px 8px" }}>{entry.interaction_count}</td>
                      <td style={{ padding: "4px 8px", opacity: 0.6 }}>
                        {new Date(entry.last_seen).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function ConnectionsTab() {
  const { showToast } = useAppContext();
  const queryClient = useQueryClient();

  // F-030: use react-query for server-fetched state — no useState+useEffect raw fetchers
  const { data: mcpServers = [], isLoading: mcpLoading } = useQuery<McpServer[]>({
    queryKey: ["mcp-servers"],
    queryFn: () => invoke<McpServer[]>("get_mcp_servers"),
    staleTime: 30_000,
  });

  const { data: automations = [], isLoading: automationsLoading } = useQuery<Automation[]>({
    queryKey: ["automations"],
    queryFn: () => invoke<Automation[]>("list_automations"),
    staleTime: 30_000,
  });

  const { data: workspace } = useQuery<WorkspaceStatus>({
    queryKey: ["google-workspace"],
    queryFn: () => invoke<WorkspaceStatus>("check_google_workspace")
      .catch(() => ({ available: false, authenticated: false })),
    staleTime: 60_000,
  });

  const initialLoading = mcpLoading || automationsLoading;

  const [mcpSearch, setMcpSearch] = useState("");
  const [automationSearch, setAutomationSearch] = useState("");
  const { agents } = useAgents();

  // New MCP state
  const [newMcp, setNewMcp] = useState<McpServer>({
    name: "", command: "", args: [], env: {}, enabled: true,
  });
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvVal, setNewEnvVal] = useState("");

  // F-024: Args array editor state
  const [editingArg, setEditingArg] = useState("");

  // New automation state
  const [newAutomation, setNewAutomation] = useState<Automation>({
    id: "", name: "", prompt: "",
    schedule: { type: "interval", seconds: 3600 },
    agent_slug: "", enabled: true,
  });
  const [scheduleType, setScheduleType] = useState<"interval" | "cron">("interval");

  // F-023: Run history state
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<Record<string, AutomationRun[]>>({});

  // F-012: Google Workspace OAuth state
  const [workspaceConnecting, setWorkspaceConnecting] = useState(false);
  const [showGoogleGuide, setShowGoogleGuide] = useState(false);

  /* ── MCP ─────────────────────────────────────────────────────────────────── */
  const addMcpServer = async () => {
    if (!newMcp.name || !newMcp.command) return;
    try {
      await invoke<McpServer[]>("add_mcp_server", { config: newMcp });
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      setNewMcp({ name: "", command: "", args: [], env: {}, enabled: true });
      setNewEnvKey(""); setNewEnvVal(""); setEditingArg("");
      showToast("MCP server added", "success");
    } catch (e) {
      console.error(e); showToast("Failed to add MCP server", "error");
    }
  };

  const removeMcpServer = async (name: string) => {
    try {
      await invoke<McpServer[]>("remove_mcp_server", { name });
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      showToast("MCP server removed", "success");
    } catch (e) {
      console.error(e); showToast("Failed to remove MCP server", "error");
    }
  };

  // F-011: MCP test button
  const testMcpServer = async (server: McpServer) => {
    try {
      await invoke("test_mcp_server", { serverId: server.id ?? server.name });
      showToast(`${server.name}: connected`, "success");
    } catch (e) {
      showToast(`Test failed: ${e}`, "error");
    }
  };

  const addEnvPair = () => {
    if (!newEnvKey.trim()) return;
    setNewMcp((prev) => ({ ...prev, env: { ...prev.env, [newEnvKey.trim()]: newEnvVal } }));
    setNewEnvKey(""); setNewEnvVal("");
  };

  const removeEnvPair = (key: string) => {
    setNewMcp((prev) => {
      const env = { ...prev.env };
      delete env[key];
      return { ...prev, env };
    });
  };

  // F-024: Args array management
  const addArg = () => {
    const trimmed = editingArg.trim();
    if (!trimmed) return;
    setNewMcp((prev) => ({ ...prev, args: [...prev.args, trimmed] }));
    setEditingArg("");
  };

  const removeArg = (index: number) => {
    setNewMcp((prev) => ({ ...prev, args: prev.args.filter((_, i) => i !== index) }));
  };

  /* ── Automations ─────────────────────────────────────────────────────────── */
  const createAutomation = async () => {
    if (!newAutomation.name || !newAutomation.prompt) return;
    const schedule = scheduleType === "cron"
      ? { type: "cron", expression: newAutomation.schedule.expression || "0 * * * *" }
      : { type: "interval", seconds: newAutomation.schedule.seconds || 3600 };
    try {
      await invoke<Automation>("create_automation", {
        automation: { ...newAutomation, schedule, id: "" },
      });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      setNewAutomation({ id: "", name: "", prompt: "", schedule: { type: "interval", seconds: 3600 }, agent_slug: "", enabled: true });
      showToast("Automation created", "success");
    } catch (e) {
      console.error(e); showToast("Failed to create automation", "error");
    }
  };

  const toggleAutomation = async (id: string, enabled: boolean) => {
    try {
      await invoke<Automation>("toggle_automation", { id, enabled });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    } catch (e) {
      console.error(e); showToast("Failed to toggle automation", "error");
    }
  };

  const deleteAutomation = async (id: string) => {
    try {
      await invoke<boolean>("delete_automation", { id });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      showToast("Automation deleted", "success");
    } catch (e) {
      console.error(e); showToast("Failed to delete automation", "error");
    }
  };

  // F-023: Toggle and fetch run history
  const toggleRunHistory = useCallback(async (automationId: string) => {
    if (expandedHistory === automationId) {
      setExpandedHistory(null);
      return;
    }
    setExpandedHistory(automationId);
    if (!runHistory[automationId]) {
      try {
        const runs = await invoke<AutomationRun[]>("get_automation_runs", { automationId });
        setRunHistory((prev) => ({ ...prev, [automationId]: runs }));
      } catch {
        setRunHistory((prev) => ({ ...prev, [automationId]: [] }));
      }
    }
  }, [expandedHistory, runHistory]);

  /* ── F-012: Google Workspace auth ────────────────────────────────────────── */
  const startGoogleAuth = async () => {
    setWorkspaceConnecting(true);
    try {
      await invoke("google_workspace_auth_start");
      queryClient.invalidateQueries({ queryKey: ["google-workspace"] });
      showToast("Google Workspace connected", "success");
    } catch (e) {
      showToast(`Google auth failed: ${e}`, "error");
    } finally {
      setWorkspaceConnecting(false);
    }
  };

  const disconnectGoogle = async () => {
    try {
      await invoke("google_workspace_auth_revoke");
      queryClient.invalidateQueries({ queryKey: ["google-workspace"] });
      showToast("Google Workspace disconnected", "success");
    } catch (e) {
      showToast(`Disconnect failed: ${e}`, "error");
    }
  };

  /* ── Widget data ─────────────────────────────────────────────────────────── */
  const activeAgents: ActiveAgent[] = agents.map((a) => ({
    id: a.id,
    title: a.name,
    status: (["running", "idle", "error"].includes(a.state.toLowerCase())
      ? a.state.toLowerCase() : "idle") as "running" | "idle" | "error",
  }));

  const runningCount = activeAgents.filter((a) => a.status === "running").length;
  const idleCount   = activeAgents.filter((a) => a.status === "idle").length;

  const needsAttention: NeedsAttentionItem[] = [];
  if (workspace && !workspace.authenticated)
    needsAttention.push({ type: "warning", message: "Google Workspace not authenticated" });
  if (agents.some((a) => ["error", "failed"].includes(a.state.toLowerCase())))
    needsAttention.push({
      type: "error",
      message: `${agents.filter((a) => ["error", "failed"].includes(a.state.toLowerCase())).length} agent(s) in error state`,
    });
  if (mcpServers.length === 0)
    needsAttention.push({ type: "info", message: "No MCP servers configured" });

  const filteredMcp = mcpServers.filter(
    (s) => !mcpSearch || s.name.toLowerCase().includes(mcpSearch.toLowerCase()) || s.command.toLowerCase().includes(mcpSearch.toLowerCase()),
  );
  const filteredAuto = automations.filter(
    (a) => !automationSearch || a.name.toLowerCase().includes(automationSearch.toLowerCase()) || a.prompt.toLowerCase().includes(automationSearch.toLowerCase()),
  );

  return (
    <div className="connections-tab">
      <h2>Connections &amp; Integrations</h2>

      {initialLoading && (
        <div style={{ padding: 12 }}>
          <SkeletonList count={2} />
        </div>
      )}

      {/* Widgets */}
      <section className="widgets-dashboard">
        <ActiveAgentsWidget agents={activeAgents} />
        <TodayStatsWidget agentsRun={runningCount} voiceCommands={0} itemsForReview={idleCount} />
        <NeedsAttentionWidget items={needsAttention} />
      </section>

      {/* F-012: Google Workspace */}
      <section className="connections-section">
        <h3>Google Workspace</h3>
        {workspace ? (
          <div className="google-workspace-panel">
            <div className="connection-status">
              <span className={`status-badge ${workspace.available ? "available" : "unavailable"}`}>
                {workspace.available ? "Available" : "Not Available"}
              </span>
              <span className={`status-badge ${workspace.authenticated ? "authenticated" : "unauthenticated"}`}>
                {workspace.authenticated ? "Connected" : "Not Connected"}
              </span>
              {workspace.authenticated && workspace.email && (
                <span className="google-email-badge">{workspace.email}</span>
              )}
            </div>

            {workspace.authenticated ? (
              <div className="google-connected-panel">
                {workspace.scopes && workspace.scopes.length > 0 && (
                  <div className="google-scopes">
                    <span className="google-scopes-label">Scopes:</span>
                    {workspace.scopes.map((scope) => (
                      <span key={scope} className="google-scope-badge">{scope}</span>
                    ))}
                  </div>
                )}
                <button className="btn-small btn-danger" onClick={disconnectGoogle}>
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="google-auth-options">
                <button
                  className="btn-primary google-oauth-btn"
                  onClick={startGoogleAuth}
                  disabled={workspaceConnecting}
                >
                  {workspaceConnecting ? "Connecting…" : "Connect with Google"}
                </button>
                <span className="google-or-sep">or</span>
                <button
                  className="btn-small"
                  onClick={() => setShowGoogleGuide((v) => !v)}
                >
                  {showGoogleGuide ? "Hide guide" : "Use gogcli"}
                </button>
                {showGoogleGuide && (
                  <div className="google-guide">
                    <ol className="google-guide-steps">
                      <li>Install gogcli: <code>npm install -g gogcli</code></li>
                      <li>Run: <code>gogcli auth login</code></li>
                      <li>Follow the browser prompt to authorize</li>
                      <li>Return here and refresh</li>
                    </ol>
                    <button
                      className="btn-small"
                      style={{ marginTop: 8 }}
                      onClick={() => {
                        invoke<WorkspaceStatus>("check_google_workspace")
                          .then((result) => queryClient.setQueryData(["google-workspace"], result))
                          .catch(() => {});
                      }}
                    >
                      Refresh status
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="section-empty">Checking…</p>
        )}
      </section>

      {/* MCP Servers */}
      <section className="connections-section">
        <h3>MCP Servers</h3>
        {mcpServers.length > 1 && (
          <input
            className="search-input"
            placeholder="Search MCP servers…"
            value={mcpSearch}
            onChange={(e) => setMcpSearch(e.target.value)}
            aria-label="Search MCP servers"
          />
        )}
        {filteredMcp.length === 0 ? (
          <p className="section-empty">{mcpSearch ? "No servers match." : "No MCP servers configured"}</p>
        ) : (
          <div className="mcp-list">
            {filteredMcp.map((server) => (
              <div key={server.name} className="mcp-item">
                <div className="mcp-item-header">
                  <span className={`status-dot ${server.enabled ? "enabled" : "disabled"}`} />
                  <strong>{server.name}</strong>
                  <span className="mcp-command">{server.command} {server.args.join(" ")}</span>
                </div>
                {Object.keys(server.env).length > 0 && (
                  <div className="mcp-env-list">
                    {Object.entries(server.env).map(([k]) => (
                      <span key={k} className="mcp-env-badge">{k}=***</span>
                    ))}
                  </div>
                )}
                {/* F-011: Test button */}
                <div className="mcp-item-actions">
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => testMcpServer(server)}
                  >
                    Test
                  </button>
                  <button className="btn-small btn-danger" onClick={() => removeMcpServer(server.name)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add MCP form */}
        <div className="add-form">
          <input placeholder="Server name" value={newMcp.name}
            onChange={(e) => setNewMcp({ ...newMcp, name: e.target.value })} />
          <input placeholder="Command (e.g. npx)" value={newMcp.command}
            onChange={(e) => setNewMcp({ ...newMcp, command: e.target.value })} />

          {/* F-024: Args array editor */}
          <div className="mcp-args-editor">
            <label className="mcp-env-label">Arguments</label>
            <div className="mcp-args-tags">
              {newMcp.args.map((arg, i) => (
                <span key={i} className="mcp-arg-tag">
                  {arg}
                  <button
                    className="mcp-arg-remove"
                    onClick={() => removeArg(i)}
                    aria-label={`Remove arg ${arg}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="form-row mcp-arg-add-row">
              <input
                placeholder="Add argument…"
                value={editingArg}
                onChange={(e) => setEditingArg(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addArg(); } }}
                className="mcp-arg-input"
                aria-label="New argument"
              />
              <button className="btn-small btn-primary" onClick={addArg} type="button">Add</button>
            </div>
          </div>

          {/* Env vars editor */}
          <div className="mcp-env-editor">
            <label className="mcp-env-label">Environment Variables</label>
            {Object.entries(newMcp.env).map(([k, v]) => (
              <div key={k} className="mcp-env-row">
                <span className="mcp-env-key">{k}</span>
                <span className="mcp-env-eq">=</span>
                <span className="mcp-env-val">{v}</span>
                <button className="btn-small btn-danger" onClick={() => removeEnvPair(k)} aria-label={`Remove ${k}`}>×</button>
              </div>
            ))}
            <div className="form-row mcp-env-add-row">
              <input placeholder="KEY" value={newEnvKey}
                onChange={(e) => setNewEnvKey(e.target.value)}
                className="mcp-env-input-key"
                aria-label="Env key" />
              <span className="mcp-env-eq">=</span>
              <input placeholder="value" value={newEnvVal}
                onChange={(e) => setNewEnvVal(e.target.value)}
                className="mcp-env-input-val"
                aria-label="Env value" />
              <button className="btn-small btn-primary" onClick={addEnvPair} type="button">+</button>
            </div>
          </div>

          <button className="btn-primary" onClick={addMcpServer}>Add MCP Server</button>
        </div>
      </section>

      {/* Automations */}
      <section className="connections-section">
        <h3>Automations</h3>
        {automations.length > 1 && (
          <input
            className="search-input"
            placeholder="Search automations…"
            value={automationSearch}
            onChange={(e) => setAutomationSearch(e.target.value)}
            aria-label="Search automations"
          />
        )}
        {filteredAuto.length === 0 ? (
          <p className="section-empty">{automationSearch ? "No automations match." : "No automations configured"}</p>
        ) : (
          <div className="automation-list">
            {filteredAuto.map((a) => {
              const historyRuns = runHistory[a.id] ?? [];
              const isHistoryExpanded = expandedHistory === a.id;
              return (
                <div key={a.id} className="automation-item">
                  <div className="automation-header">
                    <strong>{a.name}</strong>
                    <span className="automation-schedule">
                      {a.schedule.type === "interval"
                        ? `Every ${a.schedule.seconds}s`
                        : `Cron: ${a.schedule.expression}`}
                    </span>
                  </div>
                  <p className="automation-prompt">{a.prompt}</p>
                  <div className="automation-controls">
                    <label className="toggle-label">
                      <input type="checkbox" checked={a.enabled}
                        onChange={(e) => toggleAutomation(a.id, e.target.checked)} />
                      Enabled
                    </label>
                    {/* F-023: Run history toggle */}
                    <button
                      className="btn-small automation-history-btn"
                      onClick={() => toggleRunHistory(a.id)}
                    >
                      History{historyRuns.length > 0 ? ` (${historyRuns.length} runs)` : ""}
                    </button>
                    <button className="btn-small btn-danger" onClick={() => deleteAutomation(a.id)}>Delete</button>
                  </div>

                  {/* F-023: Collapsible run history */}
                  {isHistoryExpanded && (
                    <div className="automation-run-history">
                      {historyRuns.length === 0 ? (
                        <p className="section-empty" style={{ padding: "6px 0" }}>No runs yet.</p>
                      ) : (
                        historyRuns.slice(0, 10).map((run) => (
                          <div key={run.id} className={`automation-run-item run-${run.status}`}>
                            <span className={`run-status-badge run-status-${run.status}`}>
                              {run.status}
                            </span>
                            <span className="run-timestamp">
                              {new Date(run.started_at).toLocaleString()}
                            </span>
                            {run.duration_ms != null && (
                              <span className="run-duration">{run.duration_ms}ms</span>
                            )}
                            {run.error && (
                              <span className="run-error" title={run.error}>
                                {run.error.slice(0, 60)}{run.error.length > 60 ? "…" : ""}
                              </span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Add Automation form */}
        <div className="add-form">
          <input placeholder="Automation name" value={newAutomation.name}
            onChange={(e) => setNewAutomation({ ...newAutomation, name: e.target.value })} />
          <input placeholder="Prompt for the agent" value={newAutomation.prompt}
            onChange={(e) => setNewAutomation({ ...newAutomation, prompt: e.target.value })} />

          {/* Schedule type toggle */}
          <div className="form-row">
            <label>Schedule type:</label>
            <select className="setting-select" value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value as "interval" | "cron")}>
              <option value="interval">Interval</option>
              <option value="cron">Cron expression</option>
            </select>
          </div>

          {scheduleType === "interval" ? (
            <div className="form-row">
              <label>Interval (seconds):</label>
              <input type="number" value={newAutomation.schedule.seconds || 3600}
                onChange={(e) => setNewAutomation({
                  ...newAutomation,
                  schedule: { type: "interval", seconds: parseInt(e.target.value) || 3600 },
                })} style={{ width: 90 }} />
            </div>
          ) : (
            <div className="form-row">
              <label>Cron:</label>
              <input placeholder="0 * * * *"
                value={newAutomation.schedule.expression || ""}
                onChange={(e) => setNewAutomation({
                  ...newAutomation,
                  schedule: { type: "cron", expression: e.target.value },
                })}
                style={{ flex: 1 }} />
            </div>
          )}

          <button className="btn-primary" onClick={createAutomation}>Create Automation</button>
        </div>
      </section>

      {/* P-007: App Usage Logging surface */}
      <AppUsageLog showToast={showToast} />
    </div>
  );
}

export default ConnectionsTab;
