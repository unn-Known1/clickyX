import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { commands } from "../bindings";
import type { JevConfig, JevPreset, JevDecideRequest, JevDecideResponse } from "../bindings";

export type { JevConfig };

export const JEV_CONFIG_KEY = ["jev_config"];

export function useJevConfig() {
  const queryClient = useQueryClient();

  const { data: config, isLoading, error } = useQuery<JevConfig, Error>({
    queryKey: JEV_CONFIG_KEY,
    queryFn: () => commands.getJevConfig(),
    staleTime: 30_000,
    retry: 2,
  });

  const { data: presets } = useQuery<JevPreset[], Error>({
    queryKey: ["jev_presets"],
    queryFn: () => commands.getJevPresets(),
    staleTime: 300_000,
  });

  const updateMutation = useMutation<JevConfig, Error, Partial<JevConfig>>({
    mutationFn: (partial) => commands.updateJevConfig(partial),
    onSuccess: (updated) => {
      queryClient.setQueryData(JEV_CONFIG_KEY, updated);
      // Jev presence affects model lists — invalidate capability queries.
      queryClient.invalidateQueries({ queryKey: ["models"] });
      queryClient.invalidateQueries({ queryKey: ["jev_models"] });
    },
  });

  const testMutation = useMutation<
    { ok: boolean; answers: Record<string, unknown>; cost_usd: number },
    Error,
    void
  >({
    mutationFn: () => commands.testJevJudge(),
  });

  const decideMutation = useMutation<JevDecideResponse, Error, JevDecideRequest>({
    mutationFn: (request) => commands.jevDecide(request),
  });

  const updateConfig = (partial: Partial<JevConfig> | Record<string, unknown>) =>
    updateMutation.mutateAsync(partial as Partial<JevConfig>);

  return {
    config: config ?? null,
    presets: presets ?? [],
    loading: isLoading,
    isLoading,
    error: error ? error.message : null,
    updateConfig,
    isSaving: updateMutation.isPending,
    saveError: updateMutation.error?.message ?? null,
    testJudge: () => testMutation.mutateAsync(),
    isTesting: testMutation.isPending,
    testError: testMutation.error?.message ?? null,
    testResult: testMutation.data ?? null,
    decide: (request: JevDecideRequest) => decideMutation.mutateAsync(request),
    isDeciding: decideMutation.isPending,
    decideError: decideMutation.error?.message ?? null,
  };
}
