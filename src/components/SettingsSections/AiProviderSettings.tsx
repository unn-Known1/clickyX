import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AiConfig {
  anthropic_api_key: string | null;
  anthropic_model: string;
  openai_api_key: string | null;
  openai_model: string;
  openai_base_url: string;
  default_provider: string;
  system_prompt: string;
}

interface AppConfig {
  api_keys: { provider: string; key: string }[];
  overlay: { agent_dock_position: string };
}

function AiProviderSettings() {
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [elevenlabsKey, setElevenlabsKey] = useState("");
  const [cartesiaKey, setCartesiaKey] = useState("");
  const [deepgramKey, setDeepgramKey] = useState("");
  const [assemblyaiKey, setAssemblyaiKey] = useState("");

  const showToast = (text: string, type: "success" | "error" | "info" = "info") => {
    window.__showToast?.(text, type);
  };

  useEffect(() => {
    setError(null);
    invoke<AiConfig>("get_ai_config")
      .then(setAiConfig)
      .catch((e) => {
        console.error("Failed to load AI config:", e);
        setError("Failed to load AI provider settings");
      });
    invoke<AppConfig>("get_config")
      .then((cfg) => {
        const keys = cfg.api_keys || [];
        const getKey = (provider: string) => keys.find((k) => k.provider === provider)?.key || "";
        setElevenlabsKey(getKey("elevenlabs"));
        setCartesiaKey(getKey("cartesia"));
        setDeepgramKey(getKey("deepgram"));
        setAssemblyaiKey(getKey("assemblyai"));
      })
      .catch(console.error);
  }, []);

  const saveAiConfig = useCallback(async () => {
    if (!aiConfig) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await invoke<AiConfig>("update_ai_config", {
        partial: {
          anthropic_api_key: aiConfig.anthropic_api_key || null,
          anthropic_model: aiConfig.anthropic_model,
          openai_api_key: aiConfig.openai_api_key || null,
          openai_model: aiConfig.openai_model,
          openai_base_url: aiConfig.openai_base_url,
          default_provider: aiConfig.default_provider,
          system_prompt: aiConfig.system_prompt,
        },
      });
      setAiConfig(updated);
      const newApiKeys = [
        elevenlabsKey && { provider: "elevenlabs", key: elevenlabsKey },
        cartesiaKey && { provider: "cartesia", key: cartesiaKey },
        deepgramKey && { provider: "deepgram", key: deepgramKey },
        assemblyaiKey && { provider: "assemblyai", key: assemblyaiKey },
      ].filter(Boolean) as { provider: string; key: string }[];
      await invoke("update_config", {
        partial: { api_keys: newApiKeys },
      });
      setSaved(true);
      showToast("Settings saved", "success");
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("Failed to save AI config:", e);
      setError("Failed to save settings");
      showToast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  }, [aiConfig, elevenlabsKey, cartesiaKey, deepgramKey, assemblyaiKey]);

  const updateAiField = useCallback((key: string, value: unknown) => {
    setAiConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  if (error) {
    return (
      <section className="settings-section">
        <h3>AI Providers</h3>
        <div className="settings-error">{error}</div>
      </section>
    );
  }

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
          <input
            type="text"
            className="settings-input"
            placeholder="Base URL (e.g., https://integrate.api.nvidia.com)"
            value={aiConfig.openai_base_url}
            onChange={(e) => updateAiField("openai_base_url", e.target.value)}
          />
          <span className="settings-hint">
            For NVIDIA: use your NVIDIA API key (nvapi-...) with base URL
            https://integrate.api.nvidia.com/v1
          </span>
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
        {error && <div className="settings-error">{error}</div>}
      </div>
    </section>
  );
}

export default AiProviderSettings;
