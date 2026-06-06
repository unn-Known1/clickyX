import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { commands } from "../bindings";
import type { AudioConfig } from "../bindings";

export type { AudioConfig };

const AUDIO_CONFIG_KEY = ["audio_config"];

export function useAudioConfig() {
  const queryClient = useQueryClient();

  const {
    data: config,
    isLoading,
    error,
  } = useQuery<AudioConfig, Error>({
    queryKey: AUDIO_CONFIG_KEY,
    queryFn: () => commands.getAudioConfig(),
    staleTime: 30_000,
    retry: 2,
  });

  const updateMutation = useMutation<AudioConfig, Error, Partial<AudioConfig>>({
    mutationFn: (partial) => commands.updateAudioConfig(partial),
    onSuccess: (updated) => {
      queryClient.setQueryData(AUDIO_CONFIG_KEY, updated);
    },
  });

  const updateConfig = (partial: Partial<AudioConfig>) =>
    updateMutation.mutateAsync(partial);

  return {
    config: config ?? null,
    loading: isLoading,
    error: error ? error.message : null,
    updateConfig,
  };
}
