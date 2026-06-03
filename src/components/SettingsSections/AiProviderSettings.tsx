import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AiConfig {
  anthropic_api_key: string | null;
  anthropic_model: string;
  openai_api_key: string | null;
  openai_model: string;
  default_provider: string;
  system_prompt: string;
}

interface AppConfig {
  overlay: { agent_dock_position: string };
}

function AiProviderSettings() {
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [elevenlabsKey, setElevenlabsKey] = useState("");
  const [cartesiaKey, setCartesiaKey] = useState("");
  const [deepgramKey, setDeepgramKey] = useState("");
  const [assemblyaiKey, setAssemblyaiKey] = useState("");

  useEffect(() => {
    invoke<AiConfig>("get_ai_config").then((ai) => {
      setAiConfig(ai);
    }).catch(console.error);
    invoke<AppConfig>("get_config").then(() => {}).catch(console.error);
  }, []);

  const saveAiConfig = useCallback(async () => {
    if (!aiConfig) return;
    setSaving(true);
    try {
      const updated = await invoke<AiConfig>("update_ai_config", {
        partial: {
          anthropic_api_key: aiConfig.anthropic_api_key || null,
          anthropic_model: aiConfig.anthropic_model,
          openai_api_key: aiConfig.openai_api_key || null,
          openai_model: aiConfig.openai_model,
          default_provider: aiConfig.default_provider,
          system_prompt: aiConfig.system_prompt,
        },
      });
      setAiConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("Failed to save AI config:", e);
    } finally {
      setSaving(false);
    }
  }, [aiConfig]);

  const updateAiField = useCallback((key: string, value: unknown) => {
    setAiConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  if (!aiConfig) {
    return (
      <section className="settings-section">
        <h3>AI Providers</h3>
        <div className="skeleton-loader" />
      </section>
    );
  }

  return (
    <section className="settings-section">
      <h3>AI Providers</h3>
      <div className="ai-settings">
        <div className="ai-provider-group">
          <h4>Anthropic (Claude)</h4>
          <input
            type="password"
            className="settings-input"
            placeholder="API Key (sk-ant-...)"
            value={aiConfig.anthropic_api_key || ""}
            onChange={(e) => updateAiField("anthropic_api_key", e.target.value || null)}
          />
          <input
            type="text"
            className="settings-input"
            placeholder="Model (e.g., claude-sonnet-4-20250514)"
            value={aiConfig.anthropic_model}
            onChange={(e) => updateAiField("anthropic_model", e.target.value)}
          />
        </div>
        <div className="ai-provider-group">
          <h4>OpenAI (GPT)</h4>
          <input
            type="password"
            className="settings-input"
            placeholder="API Key (sk-proj-...)"
            value={aiConfig.openai_api_key || ""}
            onChange={(e) => updateAiField("openai_api_key", e.target.value || null)}
          />
          <input
            type="text"
            className="settings-input"
            placeholder="Model (e.g., gpt-4o)"
            value={aiConfig.openai_model}
            onChange={(e) => updateAiField("openai_model", e.target.value)}
          />
        </div>
        <div className="ai-provider-group">
          <h4>ElevenLabs</h4>
          <input
            type="password"
            className="settings-input"
            placeholder="API Key"
            value={elevenlabsKey}
            onChange={(e) => setElevenlabsKey(e.target.value)}
          />
        </div>
        <div className="ai-provider-group">
          <h4>Cartesia</h4>
          <input
            type="password"
            className="settings-input"
            placeholder="API Key"
            value={cartesiaKey}
            onChange={(e) => setCartesiaKey(e.target.value)}
          />
        </div>
        <div className="ai-provider-group">
          <h4>Deepgram</h4>
          <input
            type="password"
            className="settings-input"
            placeholder="API Key"
            value={deepgramKey}
            onChange={(e) => setDeepgramKey(e.target.value)}
          />
        </div>
        <div className="ai-provider-group">
          <h4>AssemblyAI</h4>
          <input
            type="password"
            className="settings-input"
            placeholder="API Key"
            value={assemblyaiKey}
            onChange={(e) => setAssemblyaiKey(e.target.value)}
          />
        </div>
        <div className="ai-provider-group">
          <h4>Default Provider</h4>
          <select
            className="settings-select"
            value={aiConfig.default_provider}
            onChange={(e) => updateAiField("default_provider", e.target.value)}
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
          </select>
        </div>
        <div className="ai-provider-group">
          <h4>System Prompt</h4>
          <textarea
            className="settings-textarea"
            rows={3}
            value={aiConfig.system_prompt}
            onChange={(e) => updateAiField("system_prompt", e.target.value)}
          />
        </div>
        <button
          className={`settings-save-btn${saved ? " saved" : ""}`}
          onClick={saveAiConfig}
          disabled={saving}
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save AI Settings"}
        </button>
      </div>
    </section>
  );
}

export default AiProviderSettings;
