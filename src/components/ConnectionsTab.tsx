import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppContext } from "../context/AppContext";

interface McpServer {
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

interface WorkspaceStatus {
  available: boolean;
  authenticated: boolean;
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

function ConnectionsTab() {
  const { showToast } = useAppContext();
  const [workspace, setWorkspace] = useState<WorkspaceStatus | null>(null);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [mcpSearch, setMcpSearch] = useState("");
  const [automationSearch, setAutomationSearch] = useState("");
  const { agents } = useAgents();

  // New MCP state
  const [newMcp, setNewMcp] = useState<McpServer>({
    name: "", command: "", args: [], env: {}, enabled: true,
  });
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvVal, setNewEnvVal] = useState("");

  // New automation state
  const [newAutomation, setNewAutomation] = useState<Automation>({
    id: "", name: "", prompt: "",
    schedule: { type: "interval", seconds: 3600 },
    agent_slug: "", enabled: true,
  });
  const [scheduleType, setScheduleType] = useState<"interval" | "cron">("interval");

  useEffect(() => {
    invoke<WorkspaceStatus>("check_google_workspace")
      .then(setWorkspace)
      .catch(() => setWorkspace({ available: false, authenticated: false }));
    invoke<McpServer[]>("get_mcp_servers")
      .then(setMcpServers)
      .catch((e) => { console.error(e); showToast("Failed to load MCP servers", "error"); });
    invoke<Automation[]>("list_automations")
      .then(setAutomations)
      .catch((e) => { console.error(e); showToast("Failed to load automations", "error"); });
  }, [showToast]);

  /* ── MCP ─────────────────────────────────────────────────────────────────── */
  const addMcpServer = async () => {
    if (!newMcp.name || !newMcp.command) return;
    try {
      const servers = await invoke<McpServer[]>("add_mcp_server", { config: newMcp });
      setMcpServers(servers);
      setNewMcp({ name: "", command: "", args: [], env: {}, enabled: true });
      setNewEnvKey(""); setNewEnvVal("");
      showToast("MCP server added", "success");
    } catch (e) {
      console.error(e); showToast("Failed to add MCP server", "error");
    }
  };

  const removeMcpServer = async (name: string) => {
    try {
      const servers = await invoke<McpServer[]>("remove_mcp_server", { name });
      setMcpServers(servers);
      showToast("MCP server removed", "success");
    } catch (e) {
      console.error(e); showToast("Failed to remove MCP server", "error");
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

  /* ── Automations ─────────────────────────────────────────────────────────── */
  const createAutomation = async () => {
    if (!newAutomation.name || !newAutomation.prompt) return;
    const schedule = scheduleType === "cron"
      ? { type: "cron", expression: newAutomation.schedule.expression || "0 * * * *" }
      : { type: "interval", seconds: newAutomation.schedule.seconds || 3600 };
    try {
      const created = await invoke<Automation>("create_automation", {
        automation: { ...newAutomation, schedule, id: "" },
      });
      setAutomations((prev) => [...prev, created]);
      setNewAutomation({ id: "", name: "", prompt: "", schedule: { type: "interval", seconds: 3600 }, agent_slug: "", enabled: true });
      showToast("Automation created", "success");
    } catch (e) {
      console.error(e); showToast("Failed to create automation", "error");
    }
  };

  const toggleAutomation = async (id: string, enabled: boolean) => {
    try {
      const updated = await invoke<Automation>("toggle_automation", { id, enabled });
      setAutomations((prev) => prev.map((a) => (a.id === id ? updated : a)));
    } catch (e) {
      console.error(e); showToast("Failed to toggle automation", "error");
    }
  };

  const deleteAutomation = async (id: string) => {
    try {
      await invoke<boolean>("delete_automation", { id });
      setAutomations((prev) => prev.filter((a) => a.id !== id));
      showToast("Automation deleted", "success");
    } catch (e) {
      console.error(e); showToast("Failed to delete automation", "error");
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

      {/* Widgets */}
      <section className="widgets-dashboard">
        <ActiveAgentsWidget agents={activeAgents} />
        <TodayStatsWidget agentsRun={runningCount} voiceCommands={0} itemsForReview={idleCount} />
        <NeedsAttentionWidget items={needsAttention} />
      </section>

      {/* Google Workspace */}
      <section className="connections-section">
        <h3>Google Workspace</h3>
        {workspace ? (
          <div className="connection-status">
            <span className={`status-badge ${workspace.available ? "available" : "unavailable"}`}>
              {workspace.available ? "Available" : "Not Available"}
            </span>
            <span className={`status-badge ${workspace.authenticated ? "authenticated" : "unauthenticated"}`}>
              {workspace.authenticated ? "Authenticated" : "Not Authenticated"}
            </span>
            {!workspace.authenticated && workspace.available && (
              <p className="connection-hint">
                Run <code>gogcli auth login</code> in your terminal to authenticate.
              </p>
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
                <button className="btn-small btn-danger" onClick={() => removeMcpServer(server.name)}>
                  Remove
                </button>
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
          <input placeholder="Args (comma separated)" value={newMcp.args.join(", ")}
            onChange={(e) => setNewMcp({ ...newMcp, args: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />

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
            {filteredAuto.map((a) => (
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
                  <button className="btn-small btn-danger" onClick={() => deleteAutomation(a.id)}>Delete</button>
                </div>
              </div>
            ))}
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
    </div>
  );
}

export default ConnectionsTab;
