import { useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { commands } from "../../bindings";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";
import { SkeletonList } from "../SkeletonLoader";
import ConfirmDialog from "../ConfirmDialog";

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

function ConnectionsSettings() {
  const { t } = useTranslation();
  const { showToast } = useAppContext();
  const queryClient = useQueryClient();

  const { data: mcpServers = [], isLoading: mcpLoading } = useQuery<McpServer[]>({
    queryKey: ["mcp-servers"],
    queryFn: () => commands.getMcpServers(),
    staleTime: 30_000,
  });

  const { data: automations = [], isLoading: automationsLoading } = useQuery<Automation[]>({
    queryKey: ["automations"],
    queryFn: () => commands.listAutomations(),
    staleTime: 30_000,
  });

  const initialLoading = mcpLoading || automationsLoading;

  const [mcpSearch, setMcpSearch] = useState("");
  const [automationSearch, setAutomationSearch] = useState("");

  const [newMcp, setNewMcp] = useState<McpServer>({
    name: "", command: "", args: [], env: {}, enabled: true,
  });
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvVal, setNewEnvVal] = useState("");
  const [editingArg, setEditingArg] = useState("");
  const [confirmRemoveMcp, setConfirmRemoveMcp] = useState<string | null>(null);
  const [confirmDeleteAuto, setConfirmDeleteAuto] = useState<string | null>(null);
  const [newAutomation, setNewAutomation] = useState<Automation>({
    id: "", name: "", prompt: "",
    schedule: { type: "interval", seconds: 3600 },
    agent_slug: "", enabled: true,
  });
  const [scheduleType, setScheduleType] = useState<"interval" | "cron">("interval");
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<Record<string, AutomationRun[]>>({});

  const addMcpServer = async () => {
    if (!newMcp.name || !newMcp.command) return;
    try {
      await commands.addMcpServer(newMcp);
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
      await commands.removeMcpServer(name);
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      showToast("MCP server removed", "success");
    } catch (e) {
      console.error(e); showToast("Failed to remove MCP server", "error");
    }
  };

  const testMcpServer = async (server: McpServer) => {
    try {
      await commands.testMcpServer(server.id ?? server.name);
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

  const addArg = () => {
    const trimmed = editingArg.trim();
    if (!trimmed) return;
    setNewMcp((prev) => ({ ...prev, args: [...prev.args, trimmed] }));
    setEditingArg("");
  };

  const removeArg = (index: number) => {
    setNewMcp((prev) => ({ ...prev, args: prev.args.filter((_, i) => i !== index) }));
  };

  const createAutomation = async () => {
    if (!newAutomation.name || !newAutomation.prompt) return;
    const schedule = scheduleType === "cron"
      ? { type: "cron", expression: newAutomation.schedule.expression || "0 * * * *" }
      : { type: "interval", seconds: newAutomation.schedule.seconds || 3600 };
    try {
      await commands.createAutomation({ ...newAutomation, schedule, id: "" });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      setNewAutomation({ id: "", name: "", prompt: "", schedule: { type: "interval", seconds: 3600 }, agent_slug: "", enabled: true });
      showToast("Automation created", "success");
    } catch (e) {
      console.error(e); showToast("Failed to create automation", "error");
    }
  };

  const toggleAutomation = async (id: string, enabled: boolean) => {
    try {
      await commands.toggleAutomation(id, enabled);
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    } catch (e) {
      console.error(e); showToast("Failed to toggle automation", "error");
    }
  };

  const deleteAutomation = async (id: string) => {
    try {
      await commands.deleteAutomation(id);
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      showToast("Automation deleted", "success");
    } catch (e) {
      console.error(e); showToast("Failed to delete automation", "error");
    }
  };

  const runHistoryRef = useRef(runHistory);
  runHistoryRef.current = runHistory;

  const toggleRunHistory = useCallback(async (automationId: string) => {
    if (expandedHistory === automationId) {
      setExpandedHistory(null);
      return;
    }
    setExpandedHistory(automationId);
    if (!runHistoryRef.current[automationId]) {
      try {
        const runs = await commands.getAutomationRuns(automationId);
        setRunHistory((prev) => ({ ...prev, [automationId]: runs }));
      } catch {
        setRunHistory((prev) => ({ ...prev, [automationId]: [] }));
      }
    }
  }, [expandedHistory]);

  const filteredMcp = mcpServers.filter(
    (s) => !mcpSearch || s.name.toLowerCase().includes(mcpSearch.toLowerCase()) || s.command.toLowerCase().includes(mcpSearch.toLowerCase()),
  );
  const filteredAuto = automations.filter(
    (a) => !automationSearch || a.name.toLowerCase().includes(automationSearch.toLowerCase()) || a.prompt.toLowerCase().includes(automationSearch.toLowerCase()),
  );

  return (
    <div className="connections-section-wrapper">
      <h2>{t("connections.title")}</h2>
      <p className="section-hint">{t("connections.hint")}</p>

      {initialLoading && (
        <div className="padded-block">
          <SkeletonList count={2} />
        </div>
      )}

      {/* MCP Servers */}
      <section className="connections-section">
        <h3>{t("connections.mcpServers")}</h3>
        {mcpServers.length > 1 && (
          <input
            className="search-input"
            placeholder={t("connections.searchServers")}
            value={mcpSearch}
            onChange={(e) => setMcpSearch(e.target.value)}
            aria-label="Search MCP servers"
          />
        )}
        {filteredMcp.length === 0 ? (
          <p className="section-empty">{mcpSearch ? t("connections.noServersMatch") : t("connections.noMcp")}</p>
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
                <div className="mcp-item-actions">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => testMcpServer(server)}
                  >
                    {t("connections.test")}
                  </button>
                  <button className="btn btn-small btn-danger" onClick={() => setConfirmRemoveMcp(server.name)}>
                    {t("connections.remove")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add MCP form */}
        <div className="add-form">
          <input placeholder={t("connections.serverName")} value={newMcp.name}
            onChange={(e) => setNewMcp({ ...newMcp, name: e.target.value })} />
          <input placeholder={t("connections.serverCommand")} value={newMcp.command}
            onChange={(e) => setNewMcp({ ...newMcp, command: e.target.value })} />

          <div className="mcp-args-editor">
            <label className="mcp-env-label">{t("connections.arguments")}</label>
            <div className="mcp-args-tags">
              {newMcp.args.map((arg, i) => (
                <span key={i} className="mcp-arg-tag">
                  {arg}
                  <button
                    className="mcp-arg-remove"
                    onClick={() => removeArg(i)}
                    aria-label={`${t("connections.removeArg")} ${arg}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="form-row mcp-arg-add-row">
              <input
                placeholder={t("connections.addArgument")}
                value={editingArg}
                onChange={(e) => setEditingArg(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addArg(); } }}
                className="mcp-arg-input"
                aria-label={t("connections.newArgument")}
              />
              <button className="btn btn-small btn-primary" onClick={addArg} type="button">{t("connections.add")}</button>
            </div>
          </div>

          <div className="mcp-env-editor">
            <label className="mcp-env-label">{t("connections.envVars")}</label>
            {Object.entries(newMcp.env).map(([k, v]) => (
              <div key={k} className="mcp-env-row">
                <span className="mcp-env-key">{k}</span>
                <span className="mcp-env-eq">=</span>
                <span className="mcp-env-val">{v}</span>
                <button className="btn btn-small btn-danger" onClick={() => removeEnvPair(k)} aria-label={`Remove ${k}`}>×</button>
              </div>
            ))}
            <div className="form-row mcp-env-add-row">
              <input placeholder={t("connections.envKey")} value={newEnvKey}
                onChange={(e) => setNewEnvKey(e.target.value)}
                className="mcp-env-input-key"
                aria-label="Env key" />
              <span className="mcp-env-eq">=</span>
              <input placeholder={t("connections.envValue")} value={newEnvVal}
                onChange={(e) => setNewEnvVal(e.target.value)}
                className="mcp-env-input-val"
                aria-label="Env value" />
              <button className="btn btn-small btn-primary" onClick={addEnvPair} type="button">+</button>
            </div>
          </div>

          <button className="btn btn-primary" onClick={addMcpServer}>{t("connections.addServer")}</button>
        </div>
      </section>

      {/* Automations */}
      <section className="connections-section">
        <h3>{t("connections.automations")}</h3>
        {automations.length > 1 && (
          <input
            className="search-input"
            placeholder={t("connections.searchAutomations")}
            value={automationSearch}
            onChange={(e) => setAutomationSearch(e.target.value)}
            aria-label="Search automations"
          />
        )}
        {filteredAuto.length === 0 ? (
          <p className="section-empty">{automationSearch ? t("connections.noAutomationsMatch") : t("connections.noAutomations")}</p>
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
                      {t("connections.enabled")}
                    </label>
                    <button
                      className="btn-small automation-history-btn"
                      onClick={() => toggleRunHistory(a.id)}
                    >
                      {t("connections.history")}{historyRuns.length > 0 ? ` (${historyRuns.length} runs)` : ""}
                    </button>
                    <button className="btn btn-small btn-danger" onClick={() => setConfirmDeleteAuto(a.id)}>{t("connections.delete")}</button>
                  </div>

                  {isHistoryExpanded && (
                    <div className="automation-run-history">
                      {historyRuns.length === 0 ? (
                        <p className="section-empty run-empty">{t("connections.noRuns")}</p>
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

        <div className="add-form">
          <input placeholder={t("connections.automationName")} value={newAutomation.name}
            onChange={(e) => setNewAutomation({ ...newAutomation, name: e.target.value })} />
          <input placeholder={t("connections.automationPrompt")} value={newAutomation.prompt}
            onChange={(e) => setNewAutomation({ ...newAutomation, prompt: e.target.value })} />

          <div className="form-row">
            <label>{t("connections.scheduleType")}</label>
            <select className="setting-select" value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value as "interval" | "cron")}>
              <option value="interval">{t("connections.interval")}</option>
              <option value="cron">{t("connections.cron")}</option>
            </select>
          </div>

          {scheduleType === "interval" ? (
            <div className="form-row">
              <label>{t("connections.intervalSecs")}</label>
              <input type="number" value={newAutomation.schedule.seconds || 3600}
                onChange={(e) => setNewAutomation({
                  ...newAutomation,
                  schedule: { type: "interval", seconds: parseInt(e.target.value) || 3600 },
                })} className="interval-input" />
            </div>
          ) : (
            <div className="form-row">
              <label>{t("connections.cronLabel")}</label>
              <input placeholder="0 * * * *"
                value={newAutomation.schedule.expression || ""}
                onChange={(e) => setNewAutomation({
                  ...newAutomation,
                  schedule: { type: "cron", expression: e.target.value },
                })}
                className="cron-input" />
            </div>
          )}

          <button className="btn btn-primary" onClick={createAutomation}>{t("connections.createAutomation")}</button>
        </div>
      </section>

      {confirmRemoveMcp && (
        <ConfirmDialog
          title={t("connections.removeTitle")}
          message={`"${confirmRemoveMcp}" ${t("connections.removeMsg")}` }
          confirmLabel={t("connections.remove")}
          onConfirm={() => removeMcpServer(confirmRemoveMcp)}
          onCancel={() => setConfirmRemoveMcp(null)}
        />
      )}

      {confirmDeleteAuto && (
        <ConfirmDialog
          title={t("connections.deleteTitle")}
          message={t("connections.deleteMsg")}
          confirmLabel={t("connections.delete")}
          onConfirm={() => deleteAutomation(confirmDeleteAuto)}
          onCancel={() => setConfirmDeleteAuto(null)}
        />
      )}
    </div>
  );
}

export default ConnectionsSettings;
