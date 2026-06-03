import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AppConfig {
  hotkeys: { key: string; enabled: boolean; action: string }[];
  theme: string;
  api_keys: { provider: string; key: string }[];
  window: { pin: boolean; width: number; height: number };
  version: string;
}

export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<AppConfig>("get_config")
      .then((cfg) => {
        setConfig(cfg);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  const updateConfig = useCallback(async (partial: Record<string, unknown>) => {
    try {
      const updated = await invoke<AppConfig>("update_config", { partial });
      setConfig(updated);
      return updated;
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  return { config, loading, error, updateConfig };
}
