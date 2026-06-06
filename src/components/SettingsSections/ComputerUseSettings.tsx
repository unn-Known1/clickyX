import { useCallback, useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { useConfig } from "../../hooks/useConfig";

function ComputerUseSettings() {
  const { showToast } = useAppContext();
  const { config, updateConfig, loading, error } = useConfig();
  const [saving, setSaving] = useState(false);

  const updateField = useCallback(async (key: string, value: unknown) => {
    if (!config) return;
    const updated = { ...config.computer_use, [key]: value };
    setSaving(true);
    try {
      await updateConfig({ computer_use: updated });
    } catch (e) {
      console.error(e);
      showToast("Failed to save computer use settings", "error");
    } finally {
      setSaving(false);
    }
  }, [config, updateConfig, showToast]);

  if (error && !config) {
    return (
      <section className="settings-section elevated-card">
        <h3>Computer Use</h3>
        <div className="settings-error">{error}</div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="settings-section elevated-card">
        <h3>Computer Use</h3>
        <div className="skeleton-loader" />
      </section>
    );
  }

  const cuConfig = config?.computer_use;

  return (
    <section className="settings-section elevated-card">
      <h3>
        Computer Use{" "}
        {saving && <span className="saving-indicator">saving…</span>}
      </h3>
      <div className="setting-row">
        <label>Screen Pointing Model</label>
        <select className="setting-select"
          value={cuConfig?.pointing_model || "claude-sonnet-4-20250514"}
          onChange={(e) => updateField("pointing_model", e.target.value)}>
          <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
          <option value="claude-opus-4-20250514">Claude Opus 4</option>
          <option value="gpt-4o">GPT-4o</option>
        </select>
      </div>
      <div className="setting-row">
        <label>CUA Backend</label>
        <select className="setting-select"
          value={cuConfig?.cua_backend || "anthropic"}
          onChange={(e) => updateField("cua_backend", e.target.value)}>
          <option value="anthropic">Anthropic CUA</option>
          <option value="openai">OpenAI CUA</option>
        </select>
      </div>
      <div className="setting-row">
        <label>Native CUA</label>
        <input type="checkbox"
          checked={cuConfig?.native_cua ?? false}
          onChange={(e) => updateField("native_cua", e.target.checked)} />
      </div>
    </section>
  );
}

export default ComputerUseSettings;
