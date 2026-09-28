import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { commands } from "../bindings";
import type { JarvisConfig, JarvisStatus } from "../bindings";
import { useTauriEvent } from "./useTauriEvent";

export type { JarvisConfig };

export const JARVIS_CONFIG_KEY = ["jarvis_config"];
export const JARVIS_STATUS_KEY = ["jarvis_status"];

export function useJarvis() {
  const queryClient = useQueryClient();

  const {
    data: config,
    isLoading,
    error,
  } = useQuery<JarvisConfig | null, Error>({
    // P0-T2/M-7: presence booleans only — raw keys must NEVER land in cache keys.
    queryKey: JARVIS_CONFIG_KEY,
    queryFn: async () => {
      const full = await commands.getConfig();
      return full.jarvis ?? null;
    },
    staleTime: 30_000,
    retry: 2,
  });

  const { data: status } = useQuery<JarvisStatus | null, Error>({
    queryKey: JARVIS_STATUS_KEY,
    queryFn: async () => {
      try {
        return await commands.jarvisStatus();
      } catch {
        return null;
      }
    },
    staleTime: 15_000,
    retry: 1,
  });

  // Live updates from fill/copy/kb/wipe/auto-trigger — never refetchInterval.
  useTauriEvent("jarvis-state-changed", () => {
    queryClient.invalidateQueries({ queryKey: JARVIS_CONFIG_KEY });
    queryClient.invalidateQueries({ queryKey: JARVIS_STATUS_KEY });
    queryClient.invalidateQueries({ queryKey: ["config"] });
  });

  const updateMutation = useMutation<unknown, Error, Partial<JarvisConfig>>({
    mutationFn: (partial) =>
      commands.updateConfig({ jarvis: partial } as unknown as Partial<import("../bindings").AppConfig>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: JARVIS_CONFIG_KEY });
      queryClient.invalidateQueries({ queryKey: JARVIS_STATUS_KEY });
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
  });

  return {
    config: config ?? null,
    status: status ?? null,
    loading: isLoading,
    isLoading,
    error: error ? error.message : null,
    updateConfig: (partial: Partial<JarvisConfig>) => updateMutation.mutateAsync(partial),
    isSaving: updateMutation.isPending,
    saveError: updateMutation.error?.message ?? null,
    // Derived conveniences for panel gating.
    enabled: config?.enabled ?? false,
    paused: config?.paused ?? false,
  };
}
