import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { commands } from "../bindings";
import type { AppConfig } from "../bindings";

export type { AppConfig };

export function useConfig() {
  const queryClient = useQueryClient();

  const {
    data: config,
    isLoading,
    error,
  } = useQuery<AppConfig, Error>({
    queryKey: ["config"],
    queryFn: () => commands.getConfig(),
    staleTime: 30_000,
    retry: 2,
  });

  const updateMutation = useMutation<AppConfig, Error, Partial<AppConfig>>({
    mutationFn: (partial) => commands.updateConfig(partial),
    onSuccess: (updated) => {
      queryClient.setQueryData(["config"], updated);
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
