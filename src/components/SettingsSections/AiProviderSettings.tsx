import { useState, useEffect, useCallback } from "react";
import { invoke } from "../../bindings";
import { useAppContext } from "../../context/AppContext";

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
  const { showToast } = useAppContext();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Use refs for API keys so password fields never go blank after save.
  // These are separate from aiConfig because the backend doesn't echo
  // back keys (they're returned as null for security).
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

  useEffect(() => {
    setError(null);
    Promise.all([
      invoke<AiConfig>("get_ai_config"),
      invoke<AppConfig>("get_config"),
    ])
      .then(([aiCfg, cfg]) => {
        // Only pre-fill non-sensitive fields; never try to show the actual key
        setAnthropicModel(aiCfg.anthropic_model || "claude-sonnet-4-20250514");
        setOpenaiModel(aiCfg.openai_model || "gpt-4o");
        setOpenaiBaseUrl(aiCfg.openai_base_url || "https://api.openai.com/v1");
        setDefaultProvider(aiCfg.default_provider || "anthropic");
        setSystemPrompt(aiCfg.system_prompt || "");
        // Track if keys are saved (key is non-null but we won't echo it)
        setHasAnthropicKey(!!aiCfg.anthropic_api_key);
        setHasOpenaiKey(!!aiCfg.openai_api_key);

        const keys = cfg.api_keys || [];
        const getKey = (provider: string) =>
          keys.find((k) => k.provider === provider)?.key || "";
        setElevenlabsKey(getKey("elevenlabs"));
        setCartesiaKey(getKey("cartesia"));
        setDeepgramKey(getKey("deepgram"));
        setAssemblyaiKey(getKey("assemblyai"));
        setLoaded(true);
      })
      .catch((e) => {
        console.error("Failed to load AI config:", e);
        setError("Failed to load AI provider settings");
        setLoaded(true);
      });
  }, []);

  const saveAiConfig = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      // Only send the key if the user actually typed something new
      await invoke<AiConfig>("update_ai_config", {
        partial: {
          ...(anthropicKey ? { anthropic_api_key: anthropicKey } : {}),
          anthropic_model: anthropicModel,
          ...(openaiKey ? { openai_api_key: openaiKey } : {}),
          openai_model: openaiModel,
          openai_base_url: openaiBaseUrl,
          default_provider: defaultProvider,
          system_prompt: systemPrompt,
        },
      });

      // Update "has key" status if user typed a new one
      if (anthropicKey) setHasAnthropicKey(true);
      if (openaiKey) setHasOpenaiKey(true);

      // Clear the typed key fields (they've been saved — don't echo back)
      setAnthropicKey("");
      setOpenaiKey("");

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
  }, [
    anthropicKey, anthropicModel, openaiKey, openaiModel, openaiBaseUrl,
    defaultProvider, systemPrompt, elevenlabsKey, cartesiaKey, deepgramKey, assemblyaiKey,
  ]);

  if (error && !loaded) {
    return (
      <section className="settings-section">
        <h3>AI Providers</h3>
        <div className="settings-error">{error}</div>
      </section>
    );
  }

  if (!loaded) {
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
