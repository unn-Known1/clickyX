import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { commands } from "../bindings";
import type { AiConfig } from "../bindings";

export type { AiConfig };

const AI_CONFIG_KEY = ["ai_config"];

export function useAiConfig() {
  const queryClient = useQueryClient();

  const {
    data: config,
    isLoading,
    error,
  } = useQuery<AiConfig, Error>({
    queryKey: AI_CONFIG_KEY,
    queryFn: () => commands.getAiConfig(),
    staleTime: 30_000,
    retry: 2,
  });

  const updateMutation = useMutation<AiConfig, Error, Partial<AiConfig>>({
    mutationFn: (partial) => commands.updateAiConfig(partial),
    onSuccess: (updated) => {
      queryClient.setQueryData(AI_CONFIG_KEY, updated);
    },
  });

  const updateConfig = (partial: Partial<AiConfig> | Record<string, unknown>) =>
    updateMutation.mutateAsync(partial as Partial<AiConfig>);

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
