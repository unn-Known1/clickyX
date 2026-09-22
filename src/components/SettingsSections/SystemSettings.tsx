import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { commands } from "../../bindings";
import type { BridgeStatus } from "../../bindings";
import { useAppContext } from "../../context/AppContext";
// NOTE (P0-T2/CR-7): the language switcher is hidden until UI strings are
// actually wired to i18n (U6). Shipping a picker that changes nothing is
// worse than shipping English-only.

interface LogEntry {
  timestamp: string;
  level: string;
  target: string;
  message: string;
}

interface Props {
  onOpenAbout?: () => void;
}

function SystemSettings({ onOpenAbout }: Props) {
  const { showToast } = useAppContext();
  const queryClient = useQueryClient();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const [logFilter, setLogFilter] = useState<string>("all");
  const [logSearch, setLogSearch] = useState("");
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [rotatedToken, setRotatedToken] = useState<string | null>(null);

  // P0-T1: bridge auth status — read-only flags, the token itself is never exposed.
  const { data: bridgeStatus } = useQuery<BridgeStatus>({
    queryKey: ["bridge_status"],
    queryFn: () => commands.getBridgeStatus(),
    staleTime: 10_000,
  });

  const refreshBridgeStatus = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["bridge_status"] });
  }, [queryClient]);

  const rotateToken = useCallback(async () => {
    if (!confirm("Generate a new bridge token? The old token stops working immediately.")) return;
    try {
      // Returned ONCE — the backend never reveals it again. Copy it now.
      const token = await commands.rotateBridgeToken();
      setRotatedToken(token);
      refreshBridgeStatus();
      showToast("Bridge token rotated — copy it now", "success");
    } catch (e) {
      console.error("Failed to rotate bridge token:", e);
      showToast("Token rotation failed", "error");
    }
  }, [showToast, refreshBridgeStatus]);

  const toggleBridgeAuth = useCallback(async () => {
    const disabling = !bridgeStatus?.auth_disabled;
    if (disabling && !confirm(
      "Disable bridge authentication for read-only endpoints? Any local process will be able to read screenshots-state, models and overlay endpoints. Computer-use, AI spend and process-spawn endpoints STAY token-gated."
    )) return;
    try {
      await commands.updateConfig({ bridge_auth_disabled: disabling });
      refreshBridgeStatus();
      showToast(disabling ? "Bridge auth disabled (dangerous tier still gated)" : "Bridge auth enabled", disabling ? "error" : "success");
    } catch (e) {
      console.error("Failed to toggle bridge auth:", e);
      showToast("Failed to update bridge auth", "error");
    }
  }, [bridgeStatus, showToast, refreshBridgeStatus]);

  useEffect(() => {
    commands.getAppVersion().then(setAppVersion).catch(console.error);
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const entries = await commands.getLogs(200);
      setLogs(entries);
    } catch (e) {
      console.error("Failed to load logs:", e);
      showToast("Failed to load logs", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const clearLogs = useCallback(async () => {
    try {
      await commands.clearLogs();
      setLogs([]);
      showToast("Logs cleared", "success");
    } catch (e) {
      console.error("Failed to clear logs:", e);
    }
  }, [showToast]);

  const copyLogs = useCallback(() => {
    const text = logs.map((e) => `[${e.timestamp}] [${e.level}] ${e.target}: ${e.message}`).join("\n");
    navigator.clipboard.writeText(text).then(() => showToast("Logs copied", "success")).catch(() => {});
  }, [logs, showToast]);

  const exportConfig = useCallback(async () => {
    try {
      // P0-T2: exports are redacted by default; secrets only with explicit opt-in.
      const json = await commands.exportConfig(includeSecrets);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clickyx-config-${new Date().toISOString().split("T")[0]}${includeSecrets ? "-WITH-SECRETS" : ""}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(includeSecrets ? "Config exported WITH secrets — store it safely" : "Config exported (secrets redacted)", includeSecrets ? "error" : "success");
    } catch (e) {
      console.error("Failed to export config:", e);
      showToast("Export failed", "error");
    }
  }, [showToast, includeSecrets]);

  const importConfig = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        await commands.importConfig(text);
        showToast("Config imported — restart to apply", "success");
      } catch (e) {
        console.error("Failed to import config:", e);
        showToast("Import failed", "error");
      }
    };
    input.click();
  }, [showToast]);

  const resetConfig = useCallback(async () => {
    if (!confirm("Reset all settings to defaults? This cannot be undone.")) return;
    try {
      await commands.resetConfig();
      showToast("Config reset — restart to apply", "info");
    } catch (e) {
      console.error("Failed to reset config:", e);
      showToast("Reset failed", "error");
    }
  }, [showToast]);

  const filteredLogs = logs.filter((e) => {
    const matchLevel = logFilter === "all" || e.level.toLowerCase() === logFilter;
    const matchSearch = !logSearch || e.message.toLowerCase().includes(logSearch.toLowerCase()) || e.target.toLowerCase().includes(logSearch.toLowerCase());
    return matchLevel && matchSearch;
  });

  return (
    <section className="settings-section elevated-card">
      <h3>System & Logs</h3>

      <div className="setting-row">
        <label>App Version</label>
        <span className="setting-value">{appVersion || "loading…"}</span>
      </div>

      <div className="setting-row">
        <label>Local HTTP Bridge <span className="setting-value">127.0.0.1:32123</span></label>
        <div className="bridge-status-block">
          <span className="setting-value">
            Auth: {bridgeStatus ? (bridgeStatus.auth_disabled ? "DISABLED (read-only open)" : bridgeStatus.token_set ? "on (token set)" : "on (no token yet)") : "loading…"}
          </span>
          <div className="system-actions">
            <button className="settings-save-btn" onClick={rotateToken}>Rotate token</button>
            <button className="settings-save-btn danger" onClick={toggleBridgeAuth}>
              {bridgeStatus?.auth_disabled ? "Enable auth" : "Disable auth"}
            </button>
          </div>
          {bridgeStatus?.auth_disabled && (
            <p className="settings-hint danger-text">
              Warning: read-only bridge endpoints are open to any local process.
              Click, screenshots, AI spend and MCP execution stay token-gated.
            </p>
          )}
          {rotatedToken && (
            <p className="settings-hint">
              New token (shown once — copy now): <code className="setting-value">{rotatedToken}</code>
              <button className="settings-save-btn" onClick={() => { navigator.clipboard.writeText(rotatedToken).then(() => showToast("Token copied", "success")).catch(() => {}); }}>Copy</button>
            </p>
          )}
          <p className="settings-hint">
            Clients authenticate with <code>Authorization: Bearer &lt;token&gt;</code>, <code>x-openclicky-token</code> or <code>X-Bridge-Token</code>.
          </p>
        </div>
      </div>

      <div className="system-actions">
        <label className="setting-checkbox">
          <input type="checkbox" checked={includeSecrets} onChange={(e) => setIncludeSecrets(e.target.checked)} />
          Include secrets in export
        </label>
        <button className="settings-save-btn" onClick={exportConfig}>Export Config</button>
        <button className="settings-save-btn" onClick={importConfig}>Import Config</button>
        <button className="settings-save-btn danger" onClick={resetConfig}>Reset to Defaults</button>
        {onOpenAbout && (
          <button className="settings-save-btn" onClick={onOpenAbout}>About ClickyX</button>
        )}
      </div>

      <div className="log-section">
        <div className="log-header">
          <h4>Application Logs</h4>
          <div className="log-actions">
            <button className="settings-save-btn" onClick={loadLogs} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </button>
            <button className="settings-save-btn" onClick={copyLogs} disabled={logs.length === 0} title="Copy all logs to clipboard">
              Copy
            </button>
            <button className="settings-save-btn danger" onClick={clearLogs}>Clear</button>
          </div>
        </div>

        {/* Filter + Search bar */}
        <div className="log-filter-bar">
          <select
            className="setting-select"
            value={logFilter}
            onChange={(e) => setLogFilter(e.target.value)}
            aria-label="Filter log level"
          >
            <option value="all">All levels</option>
            <option value="error">Error</option>
            <option value="warn">Warn</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
          <input
            className="log-search-input"
            placeholder="Search logs…"
            value={logSearch}
            onChange={(e) => setLogSearch(e.target.value)}
            aria-label="Search log messages"
          />
          {(logFilter !== "all" || logSearch) && (
            <span className="log-count">{filteredLogs.length} / {logs.length}</span>
          )}
        </div>

        <div className="log-viewer" role="log" aria-live="off">
          {logs.length === 0 ? (
            <div className="log-empty">No log entries loaded. Click Refresh.</div>
          ) : filteredLogs.length === 0 ? (
            <div className="log-empty">No entries match the current filter.</div>
          ) : (
            filteredLogs.map((entry, i) => (
              <div key={i} className={`log-entry log-level-${entry.level.toLowerCase()}`}>
                <span className="log-timestamp">{entry.timestamp}</span>
                <span className={`log-level-badge ${entry.level.toLowerCase()}`}>{entry.level}</span>
                <span className="log-target">{entry.target}</span>
                <span className="log-message">{entry.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

export default SystemSettings;
