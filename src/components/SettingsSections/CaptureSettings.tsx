import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { commands } from "../../bindings";
import type { AutoCaptureStatus } from "../../bindings";
import { useTauriEvent } from "../../hooks/useTauriEvent";

export function CaptureSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [acError, setAcError] = useState<string | null>(null);

  // P1 (H-7): consume the SHARED ["auto-capture-status"] cache entry (same as
  // StatusBar) instead of an independent fetch + 5s setInterval + own listener.
  // Freshness comes from StatusBar's polling and the event below — zero extra IPC.
  const { data: acStatus } = useQuery<AutoCaptureStatus>({
    queryKey: ["auto-capture-status"],
    queryFn: () => commands.getAutoCaptureStatus(),
    staleTime: 4000,
  });

  useTauriEvent<AutoCaptureStatus>("auto-capture-status", (e) => {
    queryClient.setQueryData(["auto-capture-status"], e.payload);
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["auto-capture-status"] });
  }, [queryClient]);

  const startAutoCapture = useCallback(async (mode?: string, intervalMs?: number) => {
    try {
      await commands.startAutoCapture(mode, intervalMs);
      refresh();
    } catch (e) {
      setAcError(String(e));
    }
  }, [refresh]);

  const stopAutoCapture = useCallback(async () => {
    try {
      await commands.stopAutoCapture();
      refresh();
    } catch (e) {
      setAcError(String(e));
    }
  }, [refresh]);

  const clearAutoCapture = useCallback(async () => {
    try {
      await commands.clearAutoCaptureCache();
      refresh();
    } catch (e) {
      setAcError(String(e));
    }
  }, [refresh]);

  return (
    <section className="settings-section elevated-card">
      <h3>{t("capture.title")}</h3>
      {acError && <div className="settings-error">{acError}</div>}

      <div className="setting-row">
        <label>{t("capture.status")}</label>
        <span className="setting-value">
          {acStatus?.running ? (
            <span className="status-pill status-pill-active">{t("capture.capturing")}</span>
          ) : (
            <span className="status-pill">{t("capture.stopped")}</span>
          )}
        </span>
      </div>

      {acStatus?.running && acStatus.last_capture && (
        <div className="setting-row">
          <label>{t("capture.lastFrame")}</label>
          <span className="setting-value">
            {acStatus.last_capture.width}×{acStatus.last_capture.height} ·{" "}
            {Math.round(acStatus.last_capture.size / 1024)}KB ·{" "}
            {new Date(acStatus.last_capture.timestamp).toLocaleTimeString()}
          </span>
        </div>
      )}

      <div className="setting-row">
        <label>{t("capture.mode")}</label>
        <select
          className="setting-select"
          value={acStatus?.config.capture_mode ?? "full"}
          onChange={(e) => startAutoCapture(e.target.value)}
          disabled={!acStatus?.running}
        >
          <option value="full">{t("capture.modeFull")}</option>
          <option value="cursor">{t("capture.modeCursor")}</option>
          <option value="focused">{t("capture.modeFocused")}</option>
          <option value="all">{t("capture.modeAll")}</option>
        </select>
      </div>

      <div className="setting-row">
        <label>{t("capture.interval")}</label>
        <select
          className="setting-select"
          value={acStatus?.config.interval_ms ?? 5000}
          onChange={(e) => startAutoCapture(undefined, parseInt(e.target.value))}
          disabled={!acStatus?.running}
        >
          <option value="1000">{t("capture.int1")}</option>
          <option value="3000">{t("capture.int3")}</option>
          <option value="5000">{t("capture.int5")}</option>
          <option value="10000">{t("capture.int10")}</option>
          <option value="30000">{t("capture.int30")}</option>
        </select>
      </div>

      <div className="setting-row">
        <label>{t("capture.controls")}</label>
        <div className="setting-actions">
          {acStatus?.running ? (
            <button className="setting-action-btn" onClick={stopAutoCapture}>
              {t("capture.stop")}
            </button>
          ) : (
            <button className="setting-action-btn primary" onClick={() => startAutoCapture()}>
              {t("capture.start")}
            </button>
          )}
          <button
            className="setting-action-btn"
            onClick={clearAutoCapture}
            disabled={!acStatus?.last_capture}
          >
            {t("capture.clearCache")}
          </button>
        </div>
      </div>
    </section>
  );
}
