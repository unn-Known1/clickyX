import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";
import { useJevConfig } from "../../hooks/useJevConfig";
import { useJarvis } from "../../hooks/useJarvis";
import JarvisKnowledgeEditor from "../JarvisKnowledgeEditor";

function JarvisSettings() {
  const { t } = useTranslation();
  const { showToast } = useAppContext();
  const {
    config, presets, updateConfig, isSaving, saveError,
    testJudge, isTesting, testError, testResult,
  } = useJevConfig();
  const {
    config: jarvis, updateConfig: updateJarvis, isSaving: jarvisSaving,
  } = useJarvis();

  const [provider, setProvider] = useState("openrouter");
  const [baseUrl, setBaseUrl] = useState("https://openrouter.ai/api/alpha/decisions");
  const [model, setModel] = useState("typesafe/jev-1.13");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [hotkey, setHotkey] = useState("Ctrl+Shift+J");

  useEffect(() => {
    if (config) {
      setProvider(config.provider || "openrouter");
      setBaseUrl(config.base_url || "");
      setModel(config.model || "");
      setHasKey(!!config.api_key);
    }
  }, [config]);

  useEffect(() => {
    if (jarvis) setHotkey(jarvis.hotkey || "Ctrl+Shift+J");
  }, [jarvis]);

  const selectedPreset = presets.find((p) => p.id === provider);

  const applyPreset = (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    setProvider(p.id);
    setBaseUrl(p.base_url);
    setModel(p.model);
  };

  const save = async () => {
    try {
      await updateConfig({
        provider,
        base_url: baseUrl,
        model,
        ...(apiKey ? { api_key: apiKey } : {}),
      });
      if (apiKey) {
        setHasKey(true);
        setApiKey("");
      }
      await updateJarvis({ hotkey });
      showToast(t("jarvis.saved"), "success");
    } catch (e) {
      showToast(`${t("jarvis.saveFailed")}: ${e}`, "error");
    }
  };

  const runTest = async () => {
    try {
      const res = await testJudge();
      showToast(`${t("jarvis.testOk")} ($${res.cost_usd.toFixed(6)})`, "success");
    } catch (e) {
      showToast(`${t("jarvis.testFailed")}: ${e}`, "error");
    }
  };

  return (
    <div className="settings-section">
      <h3>{t("jarvis.title")}</h3>
      <p className="settings-hint">{t("jarvis.hint")}</p>

      <div className="settings-card">
        <h4>{t("jarvis.judgeCard")}</h4>
        <label>
          {t("jarvis.preset")}
          <select value={provider} onChange={(e) => applyPreset(e.target.value)} aria-label={t("jarvis.preset")}>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        <label>
          {t("jarvis.baseUrl")}
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…" inputMode="url" />
        </label>
        <label>
          {t("jarvis.model")}
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="typesafe/jev-1.13" />
        </label>
        <label>
          {t("jarvis.apiKey")}
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasKey ? t("jarvis.keySaved") : t("jarvis.keyPlaceholder")}
          />
        </label>
        {selectedPreset?.residency_warning && (
          <p className="settings-warning" role="alert">{t("jarvis.residencyWarn")}</p>
        )}
        <div className="settings-row">
          <button onClick={runTest} disabled={isTesting}>{isTesting ? t("jarvis.testing") : t("jarvis.test")}</button>
          {testError && <span className="settings-error">{testError}</span>}
          {testResult && <span className="settings-ok">{t("jarvis.testOk")}</span>}
        </div>
      </div>

      <div className="settings-card">
        <h4>{t("jarvis.modeCard")}</h4>
        <label>
          {t("jarvis.hotkey")}
          <input value={hotkey} onChange={(e) => setHotkey(e.target.value)} placeholder="Ctrl+Shift+J" />
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={!!jarvis?.paused}
            onChange={(e) => updateJarvis({ paused: e.target.checked })}
          />
          {t("jarvis.paused")}
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={!!jarvis?.kb_opt_in_history}
            onChange={(e) => updateJarvis({ kb_opt_in_history: e.target.checked })}
          />
          {t("jarvis.kbOptIn")}
        </label>
      </div>

      <div className="settings-row">
        <button onClick={save} disabled={isSaving || jarvisSaving}>
          {(isSaving || jarvisSaving) ? t("common.loading") : t("jarvis.save")}
        </button>
        {saveError && <span className="settings-error">{saveError}</span>}
      </div>

      <JarvisKnowledgeEditor />

      <p className="settings-hint">{t("jarvis.attribution")}</p>
    </div>
  );
}

export default JarvisSettings;
