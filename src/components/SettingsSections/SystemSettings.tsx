import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppContext } from "../../context/AppContext";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES } from "../../i18n/index";

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
  const { i18n } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const [logFilter, setLogFilter] = useState<string>("all");
  const [logSearch, setLogSearch] = useState("");

  useEffect(() => {
    invoke<string>("get_app_version").then(setAppVersion).catch(console.error);
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const entries = await invoke<LogEntry[]>("get_logs", { count: 200 });
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
      await invoke("clear_logs");
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
      const json = await invoke<string>("export_config");
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clickyx-config-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Config exported", "success");
    } catch (e) {
      console.error("Failed to export config:", e);
      showToast("Export failed", "error");
    }
  }, [showToast]);

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
      await invoke("reset_config");
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
    <section className="settings-section">
      <h3>System & Logs</h3>

      <div className="setting-row">
        <label>App Version</label>
        <span className="setting-value">{appVersion || "loading…"}</span>
      </div>

      <div className="setting-row">
        <label>Language</label>
        <div className="lang-selector-row">
          {SUPPORTED_LOCALES.map(({ code, label }) => (
            <button
              key={code}
              className={`hotkey-preset-chip ${i18n.language === code ? "active" : ""}`}
              onClick={() => i18n.changeLanguage(code)}
              title={label}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="system-actions">
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
