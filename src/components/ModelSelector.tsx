import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { commands } from "../bindings";
import type { ModelInfo, AiConfig } from "../bindings";
import { useAppContext } from "../context/AppContext";

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
}

function ModelSelector({ selectedModel, onModelChange }: ModelSelectorProps) {
  const { t } = useTranslation();
  const { setActiveTab } = useAppContext();

  // Load current AI config to know which providers have keys configured.
  // P0-T2/M-7: raw API keys must NEVER land in react-query cache keys —
  // use presence booleans (+ non-secret base URL) instead.
  // NOTE: key unified with useAiConfig's ["ai_config"] (was ["ai-config"] — C3).
  const { data: aiConfig } = useQuery<AiConfig>({
    queryKey: ["ai_config"],
    queryFn: () => commands.getAiConfig(),
    staleTime: 30_000,
  });

  const hasAnthropicKey = !!aiConfig?.anthropic_api_key;
  const hasOpenaiKey = !!aiConfig?.openai_api_key;
  const baseUrl = aiConfig?.openai_base_url ?? "";

  // Load chat-capable models only — Jev decision entries are excluded by the
  // backend `get_chat_models` allowlist (deny by default, never fallback).
  const { data: allModels = [], isLoading, isError } = useQuery<ModelInfo[]>({
    queryKey: ["models", "chat", hasAnthropicKey, hasOpenaiKey, baseUrl],
    queryFn: () => commands.getChatModels(),
    staleTime: 60_000,
    enabled: !!aiConfig,
  });

  const hasAnyProvider = hasAnthropicKey || hasOpenaiKey;

  // Filter models to only show those for which we have credentials.
  // Deny by default: unknown providers are hidden (never `hasAnyProvider` fallback).
  const availableModels = allModels.filter((m) => {
    if (m.provider === "anthropic") return hasAnthropicKey;
    if (m.provider === "openai") return hasOpenaiKey;
    return false;
  });

  // Group by provider for <optgroup> display
  const grouped = availableModels.reduce<Record<string, ModelInfo[]>>((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = [];
    acc[m.provider].push(m);
    return acc;
  }, {});

  // No providers configured at all — show a setup prompt
  if (!isLoading && !hasAnyProvider) {
    return (
      <div className="model-selector-empty" title={t("misc.noProviders")}>
        <span className="model-note">
          {t("misc.noProviders")} —{" "}
          <span
            className="model-link"
            onClick={() => setActiveTab("settings")}
          >
            {t("misc.setupInSettings")}
          </span>
        </span>
      </div>
    );
  }

  if (isError) {
    return <div className="model-selector-error" title={t("misc.modelsFailed")}>{t("misc.modelsUnavailable")}</div>;
  }

  const providerLabel = (provider: string) => {
    const labels: Record<string, string> = {
      anthropic: "Anthropic (Claude)",
      openai: "OpenAI / Compatible",
    };
    return labels[provider] ?? (provider.charAt(0).toUpperCase() + provider.slice(1));
  };

  return (
    <select
      className="model-selector"
      value={selectedModel}
      onChange={(e) => onModelChange(e.target.value)}
      disabled={isLoading}
      aria-label={t("misc.selectModel")}
    >
      {isLoading && <option value="">{t("misc.loadingModels")}</option>}
      {Object.entries(grouped).map(([provider, providerModels]) => (
        <optgroup key={provider} label={providerLabel(provider)}>
          {providerModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </optgroup>
      ))}
      {/* Always include the currently selected model even if not in filtered list */}
      {selectedModel && !availableModels.some((m) => m.id === selectedModel) && (
        <option value={selectedModel}>{selectedModel}</option>
      )}
    </select>
  );
}

export default ModelSelector;
