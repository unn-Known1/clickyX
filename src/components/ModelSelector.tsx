import { useQuery } from "@tanstack/react-query";
import { invoke } from "../bindings";
import type { ModelInfo, AiConfig } from "../bindings";

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
}

function ModelSelector({ selectedModel, onModelChange }: ModelSelectorProps) {
  // Load current AI config to know which providers have keys configured
  const { data: aiConfig } = useQuery<AiConfig>({
    queryKey: ["ai-config"],
    queryFn: () => invoke<AiConfig>("get_ai_config"),
    staleTime: 30_000,
  });

  // Load model catalog from backend (which already filters by configured providers
  // and fetches remote models for OpenAI-compatible endpoints)
  const { data: allModels = [], isLoading, isError } = useQuery<ModelInfo[]>({
    queryKey: ["models", aiConfig?.anthropic_api_key, aiConfig?.openai_api_key, aiConfig?.openai_base_url],
    queryFn: () => invoke<ModelInfo[]>("get_models"),
    staleTime: 60_000,
    enabled: !!aiConfig, // wait until we know the config
  });

  const hasAnthropicKey = !!aiConfig?.anthropic_api_key;
  const hasOpenaiKey = !!aiConfig?.openai_api_key;
  const hasAnyProvider = hasAnthropicKey || hasOpenaiKey;

  // Filter models to only show those for which we have credentials
  const availableModels = allModels.filter((m) => {
    if (m.provider === "anthropic") return hasAnthropicKey;
    if (m.provider === "openai") return hasOpenaiKey;
    return hasAnyProvider; // show other provider models if any key exists
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
      <div className="model-selector-empty" title="No AI providers configured">
        <span style={{ fontSize: 11, opacity: 0.7 }}>
          No AI provider configured —{" "}
          <span
            style={{ textDecoration: "underline", cursor: "pointer" }}
            onClick={() => {
              // Navigate to Settings → AI Providers via AppContext
              const evt = new CustomEvent("clickyx:navigate", { detail: { tab: "settings", section: "ai" } });
              window.dispatchEvent(evt);
            }}
          >
            set up in Settings
          </span>
        </span>
      </div>
    );
  }

  if (isError) {
    return <div className="model-selector-error" title="Failed to load models">Models unavailable</div>;
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
      aria-label="Select AI model"
    >
      {isLoading && <option value="">Loading models…</option>}
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
