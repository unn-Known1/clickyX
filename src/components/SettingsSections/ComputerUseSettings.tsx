import { useState, useEffect, useCallback } from "react";
import { invoke } from "../../bindings";
import { useAppContext } from "../../context/AppContext";

interface ComputerUseConfig {
  pointing_model: string;
  cua_backend: string;
  native_cua: boolean;
}

const DEFAULT_CONFIG: ComputerUseConfig = {
  pointing_model: "claude-sonnet-4-20250514",
  cua_backend: "anthropic",
  native_cua: false,
};

function ComputerUseSettings() {
  const { showToast } = useAppContext();
  const [config, setConfig] = useState<ComputerUseConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    invoke<{ computer_use: ComputerUseConfig }>("get_config")
      .then((cfg) => { setConfig(cfg.computer_use || DEFAULT_CONFIG); setLoading(false); })
      .catch((e) => { console.error(e); setError("Failed to load settings"); setLoading(false); });
  }, []);

  const updateField = useCallback(async (key: string, value: unknown) => {
    if (!config) return;
    const updated = { ...config, [key]: value };
    setConfig(updated);
    setSaving(true);
    setError(null);
    try {
      await invoke("update_config", { partial: { computer_use: updated } });
    } catch (e) {
      console.error(e);
      setError("Failed to save");
      showToast("Failed to save computer use settings", "error");
    } finally {
      setSaving(false);
    }
  }, [config, showToast]);

  if (error && !config) {
    return (
      <section className="settings-section">
        <h3>Computer Use</h3>
        <div className="settings-error">{error}</div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="settings-section">
        <h3>Computer Use</h3>
        <div className="skeleton-loader" />
      </section>
    );
  }

  return (
    <section className="settings-section">
      <h3>
        Computer Use{" "}
        {saving && <span className="saving-indicator">saving…</span>}
      </h3>
      <div className="setting-row">
        <label>Screen Pointing Model</label>
        <select className="setting-select"
          value={config?.pointing_model || DEFAULT_CONFIG.pointing_model}
          onChange={(e) => updateField("pointing_model", e.target.value)}>
          <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
          <option value="claude-opus-4-20250514">Claude Opus 4</option>
          <option value="gpt-4o">GPT-4o</option>
        </select>
      </div>
      <div className="setting-row">
        <label>CUA Backend</label>
        <select className="setting-select"
          value={config?.cua_backend || DEFAULT_CONFIG.cua_backend}
          onChange={(e) => updateField("cua_backend", e.target.value)}>
          <option value="anthropic">Anthropic CUA</option>
          <option value="openai">OpenAI CUA</option>
        </select>
      </div>
      <div className="setting-row">
        <label>Native CUA</label>
        <input type="checkbox"
          checked={config?.native_cua ?? DEFAULT_CONFIG.native_cua}
          onChange={(e) => updateField("native_cua", e.target.checked)} />
      </div>
      {error && <div className="settings-error">{error}</div>}
    </section>
  );
}

export default ComputerUseSettings;
