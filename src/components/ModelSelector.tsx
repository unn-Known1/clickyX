import { useState, useEffect } from "react";
import { invoke } from "../bindings";

interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  capabilities: string[];
}

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
}

function ModelSelector({ selectedModel, onModelChange }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<ModelInfo[]>("get_models")
      .then((data) => {
        setModels(data);
        setLoading(false);
      })
      .catch((e) => {
        console.error("Failed to load models:", e);
        setError("Failed to load models");
        setLoading(false);
      });
  }, []);

  const grouped = models.reduce<Record<string, ModelInfo[]>>((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = [];
    acc[m.provider].push(m);
    return acc;
  }, {});

  if (error) {
    return <div className="model-selector-error">{error}</div>;
  }

  return (
    <select
      className="model-selector"
      value={selectedModel}
      onChange={(e) => onModelChange(e.target.value)}
      disabled={loading}
    >
      {loading && <option value="">Loading...</option>}
      {Object.entries(grouped).map(([provider, providerModels]) => (
        <optgroup key={provider} label={provider.charAt(0).toUpperCase() + provider.slice(1)}>
          {providerModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default ModelSelector;
