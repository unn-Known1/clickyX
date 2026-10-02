import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { commands } from "../bindings";
import type { AppConfig } from "../bindings";

export type { AppConfig };

export const PUBLIC_CONFIG_KEY = ["public_config"];

/**
 * S-MIN-6: client-side mirror of the backend redaction (`get_public_config`).
 * Applied to `update_config` responses before they touch the public cache —
 * the backend returns live secrets, which must never be cached here.
 */
export function redactConfigSecrets(config: AppConfig): AppConfig {
  return {
    ...config,
    api_keys: (config.api_keys ?? []).map((entry) => ({ ...entry, key: "" })),
  };
}

/**
 * Secrets-omitting config hook for UI display paths.
 *
 * Same shape as `useConfig` but backs onto `get_public_config`, so key
 * values never enter this query cache. Key management (`AiProviderSettings`)
 * keeps using `useConfig`; everything else must use this.
 */
export function usePublicConfig() {
  const queryClient = useQueryClient();

  const {
    data: config,
    isLoading,
    error,
  } = useQuery<AppConfig, Error>({
    queryKey: PUBLIC_CONFIG_KEY,
    queryFn: () => commands.getPublicConfig(),
    staleTime: 30_000,
    retry: 2,
  });

  const updateMutation = useMutation<AppConfig, Error, Partial<AppConfig>>({
    mutationFn: (partial) => commands.updateConfig(partial),
    onSuccess: (updated) => {
      queryClient.setQueryData(PUBLIC_CONFIG_KEY, redactConfigSecrets(updated));
      void queryClient.invalidateQueries({ queryKey: ["voices", "sixtydb"] });
    },
  });

  const updateConfig = (partial: Partial<AppConfig> | Record<string, unknown>) =>
    updateMutation.mutateAsync(partial as Partial<AppConfig>);

  return {
    config: config ?? null,
    loading: isLoading,
    isLoading,
    error: error ? error.message : null,
    updateConfig,
    isSaving: updateMutation.isPending,
    saveError: updateMutation.error?.message ?? null,
  };
}
