import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
    if (!confirm(t("sys.rotateConfirm"))) return;
    try {
      // Returned ONCE — the backend never reveals it again. Copy it now.
      const token = await commands.rotateBridgeToken();
      setRotatedToken(token);
      refreshBridgeStatus();
      showToast(t("sys.rotatedToast"), "success");
    } catch (e) {
      console.error("Failed to rotate bridge token:", e);
      showToast(t("sys.rotateFailed"), "error");
    }
  }, [showToast, refreshBridgeStatus]);

  const toggleBridgeAuth = useCallback(async () => {
    const disabling = !bridgeStatus?.auth_disabled;
    if (disabling && !confirm(t("sys.disableConfirm"))) return;
    try {
      await commands.updateConfig({ bridge_auth_disabled: disabling });
      refreshBridgeStatus();
      showToast(disabling ? t("sys.authDisabledToast") : t("sys.authEnabledToast"), disabling ? "error" : "success");
    } catch (e) {
      console.error("Failed to toggle bridge auth:", e);
      showToast(t("sys.authUpdateFailed"), "error");
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
      showToast(t("sys.logsFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const clearLogs = useCallback(async () => {
    try {
      await commands.clearLogs();
      setLogs([]);
      showToast(t("sys.logsCleared"), "success");
    } catch (e) {
      console.error("Failed to clear logs:", e);
    }
  }, [showToast]);

  const copyLogs = useCallback(() => {
    const text = logs.map((e) => `[${e.timestamp}] [${e.level}] ${e.target}: ${e.message}`).join("\n");
    navigator.clipboard.writeText(text).then(() => showToast(t("sys.logsCopied"), "success")).catch(() => {});
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
      showToast(includeSecrets ? t("sys.exportSecrets") : t("sys.exported"), includeSecrets ? "error" : "success");
    } catch (e) {
      console.error("Failed to export config:", e);
      showToast(t("sys.exportFailed"), "error");
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
        showToast(t("sys.imported"), "success");
      } catch (e) {
        console.error("Failed to import config:", e);
        showToast(t("sys.importFailed"), "error");
      }
    };
    input.click();
  }, [showToast]);

  const resetConfig = useCallback(async () => {
    if (!confirm(t("sys.resetConfirm"))) return;
    try {
      await commands.resetConfig();
      showToast(t("sys.resetToast"), "info");
    } catch (e) {
      console.error("Failed to reset config:", e);
      showToast(t("sys.resetFailed"), "error");
    }
  }, [showToast]);

  const filteredLogs = logs.filter((e) => {
    const matchLevel = logFilter === "all" || e.level.toLowerCase() === logFilter;
    const matchSearch = !logSearch || e.message.toLowerCase().includes(logSearch.toLowerCase()) || e.target.toLowerCase().includes(logSearch.toLowerCase());
    return matchLevel && matchSearch;
  });

  return (
    <section className="settings-section elevated-card">
      <h3>{t("sys.title")}</h3>

      <div className="setting-row">
        <label>{t("sys.appVersion")}</label>
        <span className="setting-value">{appVersion || t("sys.loading")}</span>
      </div>

      <div className="setting-row">
        <label>{t("sys.bridge")} <span className="setting-value">127.0.0.1:32123</span></label>
        <div className="bridge-status-block">
          <span className="setting-value">
            {t("sys.auth")}: {bridgeStatus ? (bridgeStatus.auth_disabled ? t("sys.authDisabled") : bridgeStatus.token_set ? t("sys.authOnToken") : t("sys.authOnNoToken")) : t("sys.loading")}
          </span>
          <div className="system-actions">
            <button className="settings-save-btn" onClick={rotateToken}>{t("sys.rotateToken")}</button>
            <button className="settings-save-btn danger" onClick={toggleBridgeAuth}>
              {bridgeStatus?.auth_disabled ? t("sys.enableAuth") : t("sys.disableAuth")}
            </button>
          </div>
          {bridgeStatus?.auth_disabled && (
            <p className="settings-hint danger-text">
              {t("sys.authDisabledWarn")}
            </p>
          )}
          {rotatedToken && (
            <p className="settings-hint">
              {t("sys.newTokenOnce")} <code className="setting-value">{rotatedToken}</code>
              <button className="settings-save-btn" onClick={() => { navigator.clipboard.writeText(rotatedToken).then(() => showToast(t("sys.tokenCopied"), "success")).catch(() => {}); }}>{t("sys.copy")}</button>
            </p>
          )}
          <p className="settings-hint">
            {t("sys.authHint")} <code>Authorization: Bearer &lt;token&gt;</code>, <code>x-openclicky-token</code> {t("sys.or")} <code>X-Bridge-Token</code>.
          </p>
        </div>
      </div>

      <div className="system-actions">
        <label className="setting-checkbox">
          <input type="checkbox" checked={includeSecrets} onChange={(e) => setIncludeSecrets(e.target.checked)} />
          {t("sys.includeSecrets")}
        </label>
        <button className="settings-save-btn" onClick={exportConfig}>{t("sys.exportConfig")}</button>
        <button className="settings-save-btn" onClick={importConfig}>{t("sys.importConfig")}</button>
        <button className="settings-save-btn danger" onClick={resetConfig}>{t("sys.resetDefaults")}</button>
        {onOpenAbout && (
          <button className="settings-save-btn" onClick={onOpenAbout}>{t("sys.about")}</button>
        )}
      </div>

      <div className="log-section">
        <div className="log-header">
          <h4>{t("sys.appLogs")}</h4>
          <div className="log-actions">
            <button className="settings-save-btn" onClick={loadLogs} disabled={loading}>
              {loading ? t("sys.loading") : t("sys.refresh")}
            </button>
            <button className="settings-save-btn" onClick={copyLogs} disabled={logs.length === 0} title={t("sys.copyLogs")}>
              {t("sys.copy")}
            </button>
            <button className="settings-save-btn danger" onClick={clearLogs}>{t("sys.clear")}</button>
          </div>
        </div>

        {/* Filter + Search bar */}
        <div className="log-filter-bar">
          <select
            className="setting-select"
            value={logFilter}
            onChange={(e) => setLogFilter(e.target.value)}
            aria-label={t("sys.filterLevel")}
          >
            <option value="all">{t("sys.allLevels")}</option>
            <option value="error">Error</option>
            <option value="warn">Warn</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
          <input
            className="log-search-input"
            placeholder={t("sys.searchLogs")}
            value={logSearch}
            onChange={(e) => setLogSearch(e.target.value)}
            aria-label={t("sys.searchMessages")}
          />
          {(logFilter !== "all" || logSearch) && (
            <span className="log-count">{filteredLogs.length} / {logs.length}</span>
          )}
        </div>

        <div className="log-viewer" role="log" aria-live="off">
          {logs.length === 0 ? (
            <div className="log-empty">{t("sys.noLogs")}</div>
          ) : filteredLogs.length === 0 ? (
            <div className="log-empty">{t("sys.noMatch")}</div>
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
