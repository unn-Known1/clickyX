import { useState, useEffect, useCallback } from "react";
import { useAppContext } from "../../context/AppContext";
import { useAiConfig } from "../../hooks/useAiConfig";
import { useConfig } from "../../hooks/useConfig";

function AiProviderSettings() {
  const { showToast } = useAppContext();
  const { config: aiConfig, updateConfig: updateAiConfig, loading: aiLoading, error: aiError } = useAiConfig();
  const { config: appConfig, updateConfig: updateAppConfig, loading: appLoading, error: appError } = useConfig();

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Use refs for API keys so password fields never go blank after save.
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("https://api.openai.com/v1");
  const [anthropicModel, setAnthropicModel] = useState("claude-sonnet-4-20250514");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o");
  const [defaultProvider, setDefaultProvider] = useState("anthropic");
  const [systemPrompt, setSystemPrompt] = useState("");

  const [elevenlabsKey, setElevenlabsKey] = useState("");
  const [cartesiaKey, setCartesiaKey] = useState("");
  const [deepgramKey, setDeepgramKey] = useState("");
  const [assemblyaiKey, setAssemblyaiKey] = useState("");

  // Track whether we have a saved key on the server (for placeholder display)
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false);

  // Sync state with loaded config
  useEffect(() => {
    if (aiConfig) {
      setAnthropicModel(aiConfig.anthropic_model || "claude-sonnet-4-20250514");
      setOpenaiModel(aiConfig.openai_model || "gpt-4o");
      setOpenaiBaseUrl(aiConfig.openai_base_url || "https://api.openai.com/v1");
      setDefaultProvider(aiConfig.default_provider || "anthropic");
      setSystemPrompt(aiConfig.system_prompt || "");
      setHasAnthropicKey(!!aiConfig.anthropic_api_key);
      setHasOpenaiKey(!!aiConfig.openai_api_key);
    }
  }, [aiConfig]);

  useEffect(() => {
    if (appConfig) {
      const keys = appConfig.api_keys || [];
      const getKey = (provider: string) => keys.find((k) => k.provider === provider)?.key || "";
      setElevenlabsKey(getKey("elevenlabs"));
      setCartesiaKey(getKey("cartesia"));
      setDeepgramKey(getKey("deepgram"));
      setAssemblyaiKey(getKey("assemblyai"));
    }
  }, [appConfig]);

  const saveAiConfig = useCallback(async () => {
    setSaving(true);
    try {
      // Update AI config
      await updateAiConfig({
        ...(anthropicKey ? { anthropic_api_key: anthropicKey } : {}),
        anthropic_model: anthropicModel,
        ...(openaiKey ? { openai_api_key: openaiKey } : {}),
        openai_model: openaiModel,
        openai_base_url: openaiBaseUrl,
        default_provider: defaultProvider,
        system_prompt: systemPrompt,
      });

      if (anthropicKey) setHasAnthropicKey(true);
      if (openaiKey) setHasOpenaiKey(true);
      setAnthropicKey("");
      setOpenaiKey("");

      // Update App config keys
      const newApiKeys = [
        elevenlabsKey && { provider: "elevenlabs", key: elevenlabsKey },
        cartesiaKey && { provider: "cartesia", key: cartesiaKey },
        deepgramKey && { provider: "deepgram", key: deepgramKey },
        assemblyaiKey && { provider: "assemblyai", key: assemblyaiKey },
      ].filter(Boolean) as { provider: string; key: string }[];
      
      await updateAppConfig({ api_keys: newApiKeys });

      setSaved(true);
      showToast("Settings saved", "success");
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("Failed to save AI config:", e);
      showToast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  }, [
    anthropicKey, anthropicModel, openaiKey, openaiModel, openaiBaseUrl,
    defaultProvider, systemPrompt, elevenlabsKey, cartesiaKey, deepgramKey, assemblyaiKey,
    updateAiConfig, updateAppConfig, showToast
  ]);

  const error = aiError || appError;
  const loading = aiLoading || appLoading;

  if (error && !aiConfig) {
    return (
      <section className="settings-section">
        <h3>AI Providers</h3>
        <div className="settings-error">{error}</div>
      </section>
    );
  }

  if (loading) {
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
            placeholder={hasAnthropicKey ? "API Key saved — enter new key to update" : "API Key (sk-ant-...)"}
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
            autoComplete="new-password"
          />
          {hasAnthropicKey && !anthropicKey && (
            <span className="settings-hint" style={{ color: "var(--color-success, #4caf50)" }}>
              ✓ API key is saved
            </span>
          )}
          <input
            type="text"
            className="settings-input"
            placeholder="Model (e.g., claude-sonnet-4-20250514)"
            value={anthropicModel}
            onChange={(e) => setAnthropicModel(e.target.value)}
          />
        </div>
        <div className="ai-provider-group">
          <h4>OpenAI / Compatible</h4>
          <input
            type="password"
            className="settings-input"
            placeholder={hasOpenaiKey ? "API Key saved — enter new key to update" : "API Key (sk-proj-... or nvapi-...)"}
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            autoComplete="new-password"
          />
          {hasOpenaiKey && !openaiKey && (
            <span className="settings-hint" style={{ color: "var(--color-success, #4caf50)" }}>
              ✓ API key is saved
            </span>
          )}
          <input
            type="text"
            className="settings-input"
            placeholder="Model (e.g., gpt-4o)"
            value={openaiModel}
            onChange={(e) => setOpenaiModel(e.target.value)}
          />
          <input
            type="text"
            className="settings-input"
            placeholder="Base URL (e.g., https://integrate.api.nvidia.com/v1)"
            value={openaiBaseUrl}
            onChange={(e) => setOpenaiBaseUrl(e.target.value)}
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
            value={defaultProvider}
            onChange={(e) => setDefaultProvider(e.target.value)}
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI / Compatible</option>
          </select>
        </div>
        <div className="ai-provider-group">
          <h4>System Prompt</h4>
          <textarea
            className="settings-textarea"
            rows={3}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
        </div>
        <button
          className={`settings-save-btn${saved ? " saved" : ""}`}
          onClick={saveAiConfig}
          disabled={saving}
        >
          {saving ? "Saving..." : saved ? "Saved ✓" : "Save AI Settings"}
        </button>
        {error && <div className="settings-error">{error}</div>}
      </div>
    </section>
  );
}

export default AiProviderSettings;
