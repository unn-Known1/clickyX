import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "../../context/AppContext";
import { useAiConfig } from "../../hooks/useAiConfig";
import { useConfig } from "../../hooks/useConfig";
import { commands } from "../../bindings";
import {
  CUSTOM_PRESET_ID,
  OPENROUTER_BASE_URL,
  OPENROUTER_MODELS,
  isOpenRouterBaseUrl,
  isValidBaseUrl,
  matchPresetByBaseUrl,
  normalizeBaseUrl,
  presetById,
  presetsByTier,
} from "../../utils/aiProviders";
import type { ProviderPreset } from "../../utils/aiProviders";

const VOICE_KEY_PROVIDERS = ["elevenlabs", "cartesia", "sixtydb", "deepgram", "assemblyai"] as const;

/** UI-level provider choice. All three persist through the existing config
 *  fields: OpenRouter and OpenAI-compatible both use the OpenAI-compatible
 *  slot (base URL + key + model) — that is what makes OpenRouter "direct". */
type ProviderChoice = "anthropic" | "openrouter" | "openai";

function AiProviderSettings() {
  const { t } = useTranslation();
  const { showToast } = useAppContext();
  const queryClient = useQueryClient();
  const { config: aiConfig, updateConfig: updateAiConfig, loading: aiLoading, error: aiError } = useAiConfig();
  const { config: appConfig, updateConfig: updateAppConfig, loading: appLoading, error: appError } = useConfig();

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);

  // Use refs for API keys so password fields never go blank after save.
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("https://api.openai.com/v1");
  const [anthropicModel, setAnthropicModel] = useState("claude-sonnet-4-20250514");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o");
  const [providerChoice, setProviderChoice] = useState<ProviderChoice>("anthropic");
  const [presetId, setPresetId] = useState(CUSTOM_PRESET_ID);
  const [systemPrompt, setSystemPrompt] = useState("");

  const [elevenlabsKey, setElevenlabsKey] = useState("");
  const [cartesiaKey, setCartesiaKey] = useState("");
  const [sixtydbKey, setSixtydbKey] = useState("");
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
      setSystemPrompt(aiConfig.system_prompt || "");
      setHasAnthropicKey(!!aiConfig.anthropic_api_key);
      setHasOpenaiKey(!!aiConfig.openai_api_key);
      setPresetId(matchPresetByBaseUrl(aiConfig.openai_base_url)?.id ?? CUSTOM_PRESET_ID);
      setProviderChoice(
        aiConfig.default_provider === "anthropic"
          ? "anthropic"
          : isOpenRouterBaseUrl(aiConfig.openai_base_url)
            ? "openrouter"
            : "openai",
      );
    }
  }, [aiConfig]);

  useEffect(() => {
    if (appConfig) {
      const keys = appConfig.api_keys || [];
      const getKey = (provider: string) => keys.find((k) => k.provider === provider)?.key || "";
      setElevenlabsKey(getKey("elevenlabs"));
      setCartesiaKey(getKey("cartesia"));
      setSixtydbKey(getKey("sixtydb"));
      setDeepgramKey(getKey("deepgram"));
      setAssemblyaiKey(getKey("assemblyai"));
    }
  }, [appConfig]);

  // ── OpenAI-compatible provider presets (the "any provider" path) ────────────
  const cloudPresets = useMemo(
    () => presetsByTier("cloud").filter((p) => p.protocol === "openai"),
    [],
  );
  const localPresets = useMemo(() => presetsByTier("local"), []);
  const customPreset = presetById(CUSTOM_PRESET_ID) as ProviderPreset;

  const selectedPreset = presetById(presetId) ?? customPreset;

  /** Selecting a preset fills base URL + a starting model (custom leaves them). */
  const applyPreset = useCallback((id: string) => {
    setPresetId(id);
    const preset = presetById(id);
    if (!preset || preset.id === CUSTOM_PRESET_ID) return;
    setOpenaiBaseUrl(preset.baseUrl);
    if (preset.suggestedModels.length > 0) setOpenaiModel(preset.suggestedModels[0]);
  }, []);

  /** Switching the provider choice seeds a sensible model for OpenRouter. */
  const selectProviderChoice = useCallback(
    (choice: ProviderChoice) => {
      setProviderChoice(choice);
      if (choice === "openrouter" && !openaiModel.includes("/")) {
        setOpenaiModel(OPENROUTER_MODELS[0].id);
      }
    },
    [openaiModel],
  );

  const usingOpenRouter = providerChoice === "openrouter";
  const usingAnthropic = providerChoice === "anthropic";

  const openaiKeyRequired =
    !usingAnthropic && (usingOpenRouter || selectedPreset.requiresKey) && !hasOpenaiKey && !openaiKey;
  const openrouterSelected = usingOpenRouter && !openaiModel.trim();

  const saveConfig = useCallback(
    async (silent = false): Promise<boolean> => {
      const effectiveBaseUrl = usingOpenRouter ? OPENROUTER_BASE_URL : normalizeBaseUrl(openaiBaseUrl);
      const effectiveProvider = usingAnthropic ? "anthropic" : "openai";

      // Validate the active connection before persisting.
      if (usingAnthropic) {
        if (!hasAnthropicKey && !anthropicKey) {
          if (!silent) showToast(t("providers.keyRequired"), "error");
          return false;
        }
      } else {
        if (!usingOpenRouter && !isValidBaseUrl(effectiveBaseUrl)) {
          if (!silent) showToast(t("providers.invalidUrl"), "error");
          return false;
        }
        if (!openaiModel.trim()) {
          if (!silent) showToast(t("providers.modelRequired"), "error");
          return false;
        }
        if (openaiKeyRequired) {
          if (!silent) showToast(t("providers.keyRequired"), "error");
          return false;
        }
      }

      setSaving(true);
      try {
        await updateAiConfig({
          ...(anthropicKey ? { anthropic_api_key: anthropicKey } : {}),
          anthropic_model: anthropicModel,
          ...(openaiKey ? { openai_api_key: openaiKey } : {}),
          openai_model: openaiModel,
          openai_base_url: effectiveBaseUrl,
          default_provider: effectiveProvider,
          system_prompt: systemPrompt,
        });

        if (anthropicKey) setHasAnthropicKey(true);
        if (openaiKey) setHasOpenaiKey(true);
        setAnthropicKey("");
        setOpenaiKey("");

        // Merge voice keys so unrelated providers are never wiped.
        const preservedKeys = (appConfig?.api_keys ?? []).filter(
          (k) => !(VOICE_KEY_PROVIDERS as readonly string[]).includes(k.provider),
        );
        const newApiKeys = [
          ...preservedKeys,
          elevenlabsKey && { provider: "elevenlabs", key: elevenlabsKey },
          cartesiaKey && { provider: "cartesia", key: cartesiaKey },
          sixtydbKey && { provider: "sixtydb", key: sixtydbKey },
          deepgramKey && { provider: "deepgram", key: deepgramKey },
          assemblyaiKey && { provider: "assemblyai", key: assemblyaiKey },
        ].filter(Boolean) as { provider: string; key: string }[];

        await updateAppConfig({ api_keys: newApiKeys });

        await queryClient.invalidateQueries({ queryKey: ["ai_config"] });
        await queryClient.invalidateQueries({ queryKey: ["models"] });

        if (!silent) {
          setSaved(true);
          showToast(t("providers.settingsSaved"), "success");
          setTimeout(() => setSaved(false), 2000);
        }
        return true;
      } catch (e) {
        console.error("Failed to save AI config:", e);
        if (!silent) showToast(t("providers.settingsSaveFailed"), "error");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [
      anthropicKey, anthropicModel, openaiKey, openaiModel, openaiBaseUrl,
      systemPrompt, elevenlabsKey, cartesiaKey, deepgramKey, assemblyaiKey,
      sixtydbKey, appConfig, hasAnthropicKey, hasOpenaiKey, openaiKeyRequired,
      usingAnthropic, usingOpenRouter, updateAiConfig, updateAppConfig,
      queryClient, showToast, t,
    ],
  );

  /** Save, then ask the backend which chat models it can see. */
  const testConnection = useCallback(async () => {
    setTesting(true);
    try {
      const ok = await saveConfig(true);
      if (!ok) return;
      const models = await commands.getChatModels();
      if (models.length > 0) {
        showToast(t("providers.testOk", { n: models.length }), "success");
      } else {
        showToast(t("providers.testNone"), "info");
      }
    } catch {
      showToast(t("providers.testFailed"), "error");
    } finally {
      setTesting(false);
    }
  }, [saveConfig, showToast, t]);

  const error = aiError || appError;
  const loading = aiLoading || appLoading;

  if (error && !aiConfig) {
    return (
      <section className="settings-section elevated-card">
        <h3>{t("providers.title")}</h3>
        <div className="settings-error">{error}</div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="settings-section elevated-card">
        <h3>{t("providers.title")}</h3>
        <div className="skeleton-loader" />
      </section>
    );
  }

  const presetOption = (p: ProviderPreset) => (
    <option key={p.id} value={p.id}>
      {p.label}
    </option>
  );

  const choices: { id: ProviderChoice; label: string }[] = [
    { id: "anthropic", label: t("providers.anthropic") },
    { id: "openrouter", label: t("providers.openrouter") },
    { id: "openai", label: t("providers.openaiCompat") },
  ];

  return (
    <section className="settings-section elevated-card">
      <h3>{t("providers.title")}</h3>
      <div className="ai-settings">
        {/* ── Provider choice ─────────────────────────────────────────────── */}
        <div className="ai-provider-group">
          <h4>{t("providers.provider")}</h4>
          <div className="ai-provider-choice" role="radiogroup" aria-label={t("providers.provider")}>
            {choices.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={providerChoice === c.id}
                className={`ai-choice-btn${providerChoice === c.id ? " active" : ""}`}
                onClick={() => selectProviderChoice(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <span className="settings-hint">{t("providers.providerHint")}</span>
        </div>

        {/* ── OpenRouter (direct) ─────────────────────────────────────────── */}
        {usingOpenRouter && (
          <div className="ai-provider-group ai-conn-card ai-conn-active">
            <div className="ai-conn-head">
              <h4>{t("providers.openrouter")}</h4>
              <span className="ai-conn-badge">{t("providers.openrouterBadge")}</span>
            </div>
            <span className="settings-hint">{t("providers.openrouterHint")}</span>

            <label className="ai-field">
              <span className="ai-field-label">{t("providers.apiKey")}</span>
              <input
                type="password"
                className="settings-input"
                placeholder={hasOpenaiKey ? t("providers.keySavedUpdate") : "sk-or-..."}
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                autoComplete="new-password"
                aria-label={`${t("providers.openrouter")} ${t("providers.apiKey")}`}
              />
            </label>
            {hasOpenaiKey && !openaiKey && (
              <span className="settings-hint settings-hint-success">{t("providers.keySaved")}</span>
            )}
            {openaiKeyRequired && (
              <span className="settings-hint settings-hint-warn">{t("providers.keyRequired")}</span>
            )}
            <a
              className="ai-doc-link"
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("providers.getKey", { provider: "OpenRouter" })}
            </a>

            <label className="ai-field">
              <span className="ai-field-label">{t("providers.model")}</span>
              <select
                className="settings-select"
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
                aria-label={t("providers.model")}
              >
                {(!openaiModel || !OPENROUTER_MODELS.some((m) => m.id === openaiModel)) && (
                  <option value={openaiModel}>{openaiModel || t("providers.modelRequired")}</option>
                )}
                {OPENROUTER_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            {openrouterSelected && (
              <span className="settings-hint settings-hint-warn">{t("providers.modelRequired")}</span>
            )}
            <span className="settings-hint">{t("providers.openrouterModelHint")}</span>
          </div>
        )}

        {/* ── OpenAI-compatible connection (any provider) ─────────────────── */}
        {providerChoice === "openai" && (
          <div className="ai-provider-group ai-conn-card ai-conn-active">
            <div className="ai-conn-head">
              <h4>{t("providers.openaiCompat")}</h4>
              <span className="ai-conn-badge">{t("providers.protocolOpenai")}</span>
            </div>

            <label className="ai-field">
              <span className="ai-field-label">{t("providers.preset")}</span>
              <select
                className="settings-select"
                value={presetId}
                onChange={(e) => applyPreset(e.target.value)}
                aria-label={t("providers.preset")}
              >
                <optgroup label={t("providers.tierCloud")}>{cloudPresets.map(presetOption)}</optgroup>
                <optgroup label={t("providers.tierLocal")}>{localPresets.map(presetOption)}</optgroup>
                <optgroup label={t("providers.tierCustom")}>{presetOption(customPreset)}</optgroup>
              </select>
            </label>

            {selectedPreset.id === CUSTOM_PRESET_ID ? (
              <span className="settings-hint">{t("providers.customHint")}</span>
            ) : (
              <span className="settings-hint">
                {t("providers.presetHint", { provider: selectedPreset.label })}
              </span>
            )}

            <label className="ai-field">
              <span className="ai-field-label">{t("providers.baseUrl")}</span>
              <input
                type="text"
                className="settings-input"
                placeholder={t("providers.baseUrlPlaceholder")}
                value={openaiBaseUrl}
                onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                aria-label={t("providers.baseUrl")}
              />
            </label>

            <label className="ai-field">
              <span className="ai-field-label">{t("providers.apiKey")}</span>
              <input
                type="password"
                className="settings-input"
                placeholder={
                  hasOpenaiKey
                    ? t("providers.keySavedUpdate")
                    : selectedPreset.requiresKey
                      ? t("providers.keyOpenaiPlaceholder")
                      : t("providers.localNoKey")
                }
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                autoComplete="new-password"
                aria-label={t("providers.apiKey")}
              />
            </label>
            {hasOpenaiKey && !openaiKey && (
              <span className="settings-hint settings-hint-success">{t("providers.keySaved")}</span>
            )}
            {openaiKeyRequired && (
              <span className="settings-hint settings-hint-warn">{t("providers.keyRequired")}</span>
            )}
            {selectedPreset.keyUrl && (
              <a
                className="ai-doc-link"
                href={selectedPreset.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("providers.getKey", { provider: selectedPreset.label })}
              </a>
            )}

            <label className="ai-field">
              <span className="ai-field-label">{t("providers.model")}</span>
              <input
                type="text"
                className="settings-input"
                placeholder={t("providers.modelOpenaiPlaceholder")}
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
                list="ai-model-suggestions"
                aria-label={t("providers.model")}
              />
            </label>
            <datalist id="ai-model-suggestions">
              {selectedPreset.suggestedModels.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            {selectedPreset.suggestedModels.length > 0 && (
              <span className="settings-hint">
                {t("providers.suggestedModels")}: {selectedPreset.suggestedModels.slice(0, 3).join(", ")}
              </span>
            )}
          </div>
        )}

        {/* ── Anthropic (native) ──────────────────────────────────────────── */}
        {usingAnthropic && (
          <div className="ai-provider-group ai-conn-card ai-conn-active">
            <div className="ai-conn-head">
              <h4>{t("providers.anthropic")}</h4>
              <span className="ai-conn-badge">{t("providers.protocolAnthropic")}</span>
            </div>
            <label className="ai-field">
              <span className="ai-field-label">{t("providers.apiKey")}</span>
              <input
                type="password"
                className="settings-input"
                placeholder={hasAnthropicKey ? t("providers.keySavedUpdate") : t("providers.keyAntPlaceholder")}
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                autoComplete="new-password"
                aria-label={t("providers.anthropic")}
              />
            </label>
            {hasAnthropicKey && !anthropicKey && (
              <span className="settings-hint settings-hint-success">{t("providers.keySaved")}</span>
            )}
            <label className="ai-field">
              <span className="ai-field-label">{t("providers.model")}</span>
              <input
                type="text"
                className="settings-input"
                placeholder={t("providers.modelAntPlaceholder")}
                value={anthropicModel}
                onChange={(e) => setAnthropicModel(e.target.value)}
                aria-label={t("providers.model")}
              />
            </label>
          </div>
        )}

        {/* ── Speech & voice keys (secondary) ─────────────────────────────── */}
        <details className="ai-advanced">
          <summary>{t("providers.voiceKeys")}</summary>
          <p className="settings-hint">{t("providers.voiceKeysHint")}</p>
          <div className="ai-voice-grid">
            {[
              { label: "ElevenLabs", value: elevenlabsKey, set: setElevenlabsKey },
              { label: "Cartesia", value: cartesiaKey, set: setCartesiaKey },
              { label: "60db", value: sixtydbKey, set: setSixtydbKey },
              { label: "Deepgram", value: deepgramKey, set: setDeepgramKey },
              { label: "AssemblyAI", value: assemblyaiKey, set: setAssemblyaiKey },
            ].map(({ label, value, set }) => (
              <label key={label} className="ai-field">
                <span className="ai-field-label">{label}</span>
                <input
                  type="password"
                  className="settings-input"
                  placeholder={t("providers.apiKey")}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  autoComplete="new-password"
                  aria-label={`${label} ${t("providers.apiKey")}`}
                />
              </label>
            ))}
          </div>
        </details>

        {/* ── System prompt ───────────────────────────────────────────────── */}
        <div className="ai-provider-group">
          <h4>{t("providers.systemPrompt")}</h4>
          <textarea
            className="settings-textarea"
            rows={3}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            aria-label={t("providers.systemPrompt")}
          />
        </div>

        <div className="ai-actions">
          <button
            className={`settings-save-btn${saved ? " saved" : ""}`}
            onClick={() => void saveConfig()}
            disabled={saving || testing}
          >
            {saving ? t("providers.saving") : saved ? t("providers.saved") : t("providers.saveSettings")}
          </button>
          <button
            type="button"
            className="btn btn-secondary ai-test-btn"
            onClick={() => void testConnection()}
            disabled={saving || testing}
          >
            {testing ? t("providers.testing") : t("providers.test")}
          </button>
        </div>
        {error && <div className="settings-error">{error}</div>}
      </div>
    </section>
  );
}

export default AiProviderSettings;
