import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface LogEntry {
  timestamp: string;
  level: string;
  target: string;
  message: string;
}

function SystemSettings() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    invoke<string>("get_app_version").then(setAppVersion).catch(console.error);
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const entries = await invoke<LogEntry[]>("get_logs", { count: 50 });
      setLogs(entries);
    } catch (e) {
      console.error("Failed to load logs:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearLogs = useCallback(async () => {
    try {
      await invoke("clear_logs");
      setLogs([]);
    } catch (e) {
      console.error("Failed to clear logs:", e);
    }
  }, []);

  const exportConfig = useCallback(async () => {
    try {
      const json = await invoke<string>("export_config");
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clickyx-config-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to export config:", e);
    }
  }, []);

  const importConfig = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        await invoke("import_config", { json: text });
        alert("Config imported successfully. Restart the app for changes to take full effect.");
      } catch (e) {
        console.error("Failed to import config:", e);
        alert("Failed to import config. Check the console for details.");
      }
    };
    input.click();
  }, []);

  const resetConfig = useCallback(async () => {
    if (!confirm("Are you sure you want to reset all settings to defaults?")) return;
    try {
      await invoke("reset_config");
      alert("Config reset to defaults. Restart the app.");
    } catch (e) {
      console.error("Failed to reset config:", e);
    }
  }, []);

  return (
    <section className="settings-section">
      <h3>System & Logs</h3>

      <div className="setting-row">
        <label>App Version</label>
        <span className="setting-value">{appVersion || "loading..."}</span>
      </div>

      <div className="setting-row">
        <label>Google Workspace</label>
        <span className="setting-value">Not connected</span>
      </div>

      <div className="setting-row">
        <label>MCP Servers</label>
        <span className="setting-value">Not configured</span>
      </div>

      <div className="system-actions">
        <button className="settings-save-btn" onClick={exportConfig}>Export Config</button>
        <button className="settings-save-btn" onClick={importConfig}>Import Config</button>
        <button className="settings-save-btn danger" onClick={resetConfig}>Reset to Defaults</button>
      </div>

      <div className="log-section">
        <div className="log-header">
          <h4>Application Logs</h4>
          <div className="log-actions">
            <button className="settings-save-btn" onClick={loadLogs} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
            <button className="settings-save-btn danger" onClick={clearLogs}>Clear</button>
          </div>
        </div>
        <div className="log-viewer">
          {logs.length === 0 ? (
            <div className="log-empty">No log entries loaded. Click Refresh.</div>
          ) : (
            logs.map((entry, i) => (
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
