import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AppConfig {
  theme: string;
  hotkeys: { key: string; enabled: boolean; action: string }[];
  api_keys: { provider: string; key: string }[];
  window: { pin: boolean; width: number; height: number };
  version: string;
}

interface AiConfig {
  anthropic_api_key: string | null;
  anthropic_model: string;
  openai_api_key: string | null;
  openai_model: string;
  default_provider: string;
  system_prompt: string;
}

function SettingsTab() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [newApiKey, setNewApiKey] = useState({ provider: "", key: "" });
  const [newHotkey, setNewHotkey] = useState({
    key: "",
    enabled: true,
    action: "toggle_panel",
  });

  // AI settings state
  const [anthropicKey, setAnthropicKey] = useState("");
  const [anthropicModel, setAnthropicModel] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("");
  const [defaultProvider, setDefaultProvider] = useState("anthropic");
  const [systemPrompt, setSystemPrompt] = useState("");

  useEffect(() => {
    invoke<AppConfig>("get_config")
      .then(setConfig)
      .catch(console.error);

    invoke<AiConfig>("get_ai_config")
      .then((ai) => {
        setAiConfig(ai);
        setAnthropicKey(ai.anthropic_api_key || "");
        setAnthropicModel(ai.anthropic_model);
        setOpenaiKey(ai.openai_api_key || "");
        setOpenaiModel(ai.openai_model);
        setDefaultProvider(ai.default_provider);
        setSystemPrompt(ai.system_prompt);
      })
      .catch(console.error);
  }, []);

  const updateTheme = async (theme: string) => {
    try {
      const updated = await invoke<AppConfig>("update_config", {
        partial: { theme },
      });
      setConfig(updated);
    } catch (e) {
      console.error("Failed to update theme:", e);
    }
  };

  const togglePin = async () => {
    if (!config) return;
    try {
      const updated = await invoke<AppConfig>("update_config", {
        partial: { window: { ...config.window, pin: !config.window.pin } },
      });
      setConfig(updated);
    } catch (e) {
      console.error("Failed to toggle pin:", e);
    }
  };

  const addApiKey = async () => {
    if (!config || !newApiKey.provider || !newApiKey.key) return;
    try {
      const keys = [...config.api_keys, newApiKey];
      const updated = await invoke<AppConfig>("update_config", {
        partial: { api_keys: keys },
      });
      setConfig(updated);
      setNewApiKey({ provider: "", key: "" });
    } catch (e) {
      console.error("Failed to add API key:", e);
    }
  };

  const addHotkey = async () => {
    if (!config || !newHotkey.key) return;
    try {
      const hotkeys = [...config.hotkeys, newHotkey];
      const updated = await invoke<AppConfig>("update_config", {
        partial: { hotkeys },
      });
      setConfig(updated);
      setNewHotkey({ key: "", enabled: true, action: "toggle_panel" });
    } catch (e) {
      console.error("Failed to add hotkey:", e);
    }
  };

  const saveAiConfig = async () => {
    try {
      const updated = await invoke<AiConfig>("update_ai_config", {
        partial: {
          anthropic_api_key: anthropicKey || null,
          anthropic_model: anthropicModel,
          openai_api_key: openaiKey || null,
          openai_model: openaiModel,
          default_provider: defaultProvider,
          system_prompt: systemPrompt,
        },
      });
      setAiConfig(updated);
    } catch (e) {
      console.error("Failed to save AI config:", e);
    }
  };

  if (!config) return <div className="settings-tab">Loading...</div>;

  return (
    <div className="settings-tab">
      <h2>Settings</h2>

      <section className="settings-section">
        <h3>AI Providers</h3>
        <div className="ai-settings">
          <div className="ai-provider-group">
            <h4>Anthropic (Claude)</h4>
            <input
              type="password"
              className="settings-input"
              placeholder="API Key (sk-ant-...)"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
            />
            <input
              type="text"
              className="settings-input"
              placeholder="Model (e.g., claude-sonnet-4-20250514)"
              value={anthropicModel}
              onChange={(e) => setAnthropicModel(e.target.value)}
            />
          </div>
          <div className="ai-provider-group">
            <h4>OpenAI (GPT)</h4>
            <input
              type="password"
              className="settings-input"
              placeholder="API Key (sk-proj-...)"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
            />
            <input
              type="text"
              className="settings-input"
              placeholder="Model (e.g., gpt-4o)"
              value={openaiModel}
              onChange={(e) => setOpenaiModel(e.target.value)}
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
              <option value="openai">OpenAI</option>
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
          <button className="settings-save-btn" onClick={saveAiConfig}>
            Save AI Settings
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>Theme</h3>
        <div className="theme-options">
          {["system", "light", "dark"].map((t) => (
            <button
              key={t}
              className={`theme-button ${config.theme === t ? "active" : ""}`}
              onClick={() => updateTheme(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>Window</h3>
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={config.window.pin}
            onChange={togglePin}
          />
          Keep panel pinned (always visible)
        </label>
      </section>

      <section className="settings-section">
        <h3>API Keys</h3>
        {config.api_keys.map((ak, i) => (
          <div key={i} className="api-key-row">
            <span className="provider">{ak.provider}</span>
            <span className="key-masked">{ak.key.slice(0, 8)}...</span>
          </div>
        ))}
        <div className="add-api-key">
          <input
            placeholder="Provider (e.g., anthropic)"
            value={newApiKey.provider}
            onChange={(e) =>
              setNewApiKey({ ...newApiKey, provider: e.target.value })
            }
          />
          <input
            type="password"
            placeholder="API Key"
            value={newApiKey.key}
            onChange={(e) =>
              setNewApiKey({ ...newApiKey, key: e.target.value })
            }
          />
          <button onClick={addApiKey}>Add</button>
        </div>
      </section>

      <section className="settings-section">
        <h3>Hotkeys</h3>
        {config.hotkeys.map((hk, i) => (
          <div key={i} className="hotkey-row">
            <span>{hk.key}</span>
            <span>{hk.enabled ? "Enabled" : "Disabled"}</span>
          </div>
        ))}
        <div className="add-hotkey">
          <input
            placeholder="Key combo (e.g., Ctrl+Shift+A)"
            value={newHotkey.key}
            onChange={(e) =>
              setNewHotkey({ ...newHotkey, key: e.target.value })
            }
          />
          <button onClick={addHotkey}>Add</button>
        </div>
      </section>
    </div>
  );
}

export default SettingsTab;
