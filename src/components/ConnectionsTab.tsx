import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import ActiveAgentsWidget from "./ActiveAgentsWidget";
import TodayStatsWidget from "./TodayStatsWidget";
import NeedsAttentionWidget from "./NeedsAttentionWidget";
import { useAgents } from "../hooks/useAgents";

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
  const [workspace, setWorkspace] = useState<WorkspaceStatus | null>(null);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const { agents } = useAgents();

  const [newMcp, setNewMcp] = useState<McpServer>({
    name: "",
    command: "",
    args: [],
    env: {},
    enabled: true,
  });
  const [newAutomation, setNewAutomation] = useState<Automation>({
    id: "",
    name: "",
    prompt: "",
    schedule: { type: "interval", seconds: 3600 },
    agent_slug: "",
    enabled: true,
    last_run: undefined,
  });

  const showToast = (text: string, type: "success" | "error" | "info" = "info") => {
    window.__showToast?.(text, type);
  };

  useEffect(() => {
    invoke<WorkspaceStatus>("check_google_workspace")
      .then(setWorkspace)
      .catch(() => setWorkspace({ available: false, authenticated: false }));
    invoke<McpServer[]>("get_mcp_servers")
      .then(setMcpServers)
      .catch((e) => {
        console.error("Failed to load MCP servers:", e);
        showToast("Failed to load MCP servers", "error");
      });
    invoke<Automation[]>("list_automations")
      .then(setAutomations)
      .catch((e) => {
        console.error("Failed to load automations:", e);
        showToast("Failed to load automations", "error");
      });
  }, []);

  const addMcpServer = async () => {
    if (!newMcp.name || !newMcp.command) return;
    try {
      const servers = await invoke<McpServer[]>("add_mcp_server", {
        config: newMcp,
      });
      setMcpServers(servers);
      setNewMcp({ name: "", command: "", args: [], env: {}, enabled: true });
      showToast("MCP server added", "success");
    } catch (e) {
      console.error("Failed to add MCP server:", e);
      showToast("Failed to add MCP server", "error");
    }
  };

  const removeMcpServer = async (name: string) => {
    try {
      const servers = await invoke<McpServer[]>("remove_mcp_server", { name });
      setMcpServers(servers);
      showToast("MCP server removed", "success");
    } catch (e) {
      console.error("Failed to remove MCP server:", e);
      showToast("Failed to remove MCP server", "error");
    }
  };

  const createAutomation = async () => {
    if (!newAutomation.name || !newAutomation.prompt) return;
    try {
      const created = await invoke<Automation>("create_automation", {
        automation: { ...newAutomation, id: "" },
      });
      setAutomations(prev => [...prev, created]);
      setNewAutomation({
        id: "",
        name: "",
        prompt: "",
        schedule: { type: "interval", seconds: 3600 },
        agent_slug: "",
        enabled: true,
        last_run: undefined,
      });
      showToast("Automation created", "success");
    } catch (e) {
      console.error("Failed to create automation:", e);
      showToast("Failed to create automation", "error");
    }
  };

  const toggleAutomation = async (id: string, enabled: boolean) => {
    try {
      const updated = await invoke<Automation>("toggle_automation", {
        id,
        enabled,
      });
      setAutomations(
        prev => prev.map((a) => (a.id === id ? updated : a)),
      );
    } catch (e) {
      console.error("Failed to toggle automation:", e);
      showToast("Failed to toggle automation", "error");
    }
  };

  const deleteAutomation = async (id: string) => {
    try {
      await invoke<boolean>("delete_automation", { id });
      setAutomations(prev => prev.filter((a) => a.id !== id));
      showToast("Automation deleted", "success");
    } catch (e) {
      console.error("Failed to delete automation:", e);
      showToast("Failed to delete automation", "error");
    }
  };

  const activeAgents: ActiveAgent[] = agents.map((a) => ({
    id: a.id,
    title: a.name,
    status: (["running", "idle", "error"].includes(a.state.toLowerCase())
      ? a.state.toLowerCase()
      : "idle") as "running" | "idle" | "error",
  }));

  const runningCount = activeAgents.filter((a) => a.status === "running").length;
  const idleCount = activeAgents.filter((a) => a.status === "idle").length;

  const needsAttention: NeedsAttentionItem[] = [];
  if (workspace && !workspace.authenticated) {
    needsAttention.push({
      type: "warning",
      message: "Google Workspace not authenticated",
    });
  }
  if (agents.some((a) => a.state.toLowerCase() === "error" || a.state.toLowerCase() === "failed")) {
    needsAttention.push({
      type: "error",
      message: `${agents.filter((a) => a.state.toLowerCase() === "error" || a.state.toLowerCase() === "failed").length} agent(s) in error state`,
    });
  }
  if (mcpServers.length === 0) {
    needsAttention.push({
      type: "info",
      message: "No MCP servers configured — add one to extend capabilities",
    });
  }

  return (
    <div className="connections-tab">
      <h2>Connections & Integrations</h2>

      <section className="widgets-dashboard">
        <ActiveAgentsWidget agents={activeAgents} />
        <TodayStatsWidget agentsRun={runningCount} voiceCommands={0} itemsForReview={idleCount} />
        <NeedsAttentionWidget items={needsAttention} />
      </section>

      <section className="connections-section">
        <h3>Google Workspace</h3>
        {workspace ? (
          <div className="connection-status">
            <span
              className={`status-badge ${workspace.available ? "available" : "unavailable"}`}
            >
              {workspace.available ? "Available" : "Not Available"}
            </span>
            <span
              className={`status-badge ${workspace.authenticated ? "authenticated" : "unauthenticated"}`}
            >
              {workspace.authenticated ? "Authenticated" : "Not Authenticated"}
            </span>
            {!workspace.authenticated && workspace.available && (
              <p className="connection-hint">
                Run <code>gogcli auth login</code> in your terminal to authenticate.
              </p>
            )}
          </div>
        ) : (
          <p>Checking...</p>
        )}
      </section>

      <section className="connections-section">
        <h3>MCP Servers</h3>
        {mcpServers.length === 0 ? (
          <p className="section-empty">No MCP servers configured</p>
        ) : (
          <div className="mcp-list">
            {mcpServers.map((server) => (
              <div key={server.name} className="mcp-item">
                <div className="mcp-item-header">
                  <span
                    className={`status-dot ${server.enabled ? "enabled" : "disabled"}`}
                  />
                  <strong>{server.name}</strong>
                  <span className="mcp-command">{server.command}</span>
                </div>
                <button
                  className="btn-small btn-danger"
                  onClick={() => removeMcpServer(server.name)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="add-form">
          <input
            placeholder="Server name"
            value={newMcp.name}
            onChange={(e) => setNewMcp({ ...newMcp, name: e.target.value })}
          />
          <input
            placeholder="Command (e.g., npx)"
            value={newMcp.command}
            onChange={(e) => setNewMcp({ ...newMcp, command: e.target.value })}
          />
          <input
            placeholder="Args (comma separated)"
            value={newMcp.args.join(", ")}
            onChange={(e) =>
              setNewMcp({
                ...newMcp,
                args: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              })
            }
          />
          <button className="btn-primary" onClick={addMcpServer}>
            Add MCP Server
          </button>
        </div>
      </section>

      <section className="connections-section">
        <h3>Automations</h3>
        {automations.length === 0 ? (
          <p className="section-empty">No automations configured</p>
        ) : (
          <div className="automation-list">
            {automations.map((a) => (
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
                    <input
                      type="checkbox"
                      checked={a.enabled}
                      onChange={(e) =>
                        toggleAutomation(a.id, e.target.checked)
                      }
                    />
                    Enabled
                  </label>
                  <button
                    className="btn-small btn-danger"
                    onClick={() => deleteAutomation(a.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="add-form">
          <input
            placeholder="Automation name"
            value={newAutomation.name}
            onChange={(e) =>
              setNewAutomation({ ...newAutomation, name: e.target.value })
            }
          />
          <input
            placeholder="Prompt for the agent"
            value={newAutomation.prompt}
            onChange={(e) =>
              setNewAutomation({ ...newAutomation, prompt: e.target.value })
            }
          />
          <div className="form-row">
            <label>
              Interval (seconds):
              <input
                type="number"
                value={newAutomation.schedule.seconds || 3600}
                onChange={(e) =>
                  setNewAutomation({
                    ...newAutomation,
                    schedule: {
                      type: "interval",
                      seconds: parseInt(e.target.value) || 3600,
                    },
                  })
                }
              />
            </label>
          </div>
          <button className="btn-primary" onClick={createAutomation}>
            Create Automation
          </button>
        </div>
      </section>
    </div>
  );
}

export default ConnectionsTab;
