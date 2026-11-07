import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commands } from "../bindings";
import type { ChatGptSignOutResult, ChatGptStatus } from "../bindings";

export type { ChatGptStatus, ChatGptSignOutResult };

export const CHATGPT_STATUS_KEY = ["chatgpt_status"];

/**
 * Sign in with ChatGPT: status query plus sign-in / sign-out mutations.
 *
 * Tokens never reach the frontend; the backend keeps them in the OS keychain
 * and returns only presence flags and the account email.
 */
export function useChatGpt() {
  const queryClient = useQueryClient();

  const statusQuery = useQuery<ChatGptStatus, Error>({
    queryKey: CHATGPT_STATUS_KEY,
    queryFn: () => commands.chatgptStatus(),
    staleTime: 15_000,
    retry: 1,
  });

  /** Anything derived from the signed-in state must refetch after a change. */
  const refreshDependents = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["ai_config"] }),
      queryClient.invalidateQueries({ queryKey: ["models"] }),
    ]);
  };

  const signInMutation = useMutation<ChatGptStatus, Error, void>({
    // Resolves when the browser round-trip finishes (up to 5 minutes).
    mutationFn: () => commands.chatgptSignIn(),
    onSuccess: async (status) => {
      queryClient.setQueryData(CHATGPT_STATUS_KEY, status);
      await refreshDependents();
    },
  });

  const signOutMutation = useMutation<ChatGptSignOutResult, Error, void>({
    mutationFn: () => commands.chatgptSignOut(),
    onSuccess: async (result) => {
      queryClient.setQueryData(CHATGPT_STATUS_KEY, result.status);
      await refreshDependents();
    },
  });

  return {
    status: statusQuery.data ?? null,
    isLoading: statusQuery.isLoading,
    error: statusQuery.error ? statusQuery.error.message : null,
    signIn: () => signInMutation.mutateAsync(),
    isSigningIn: signInMutation.isPending,
    signInError: signInMutation.error?.message ?? null,
    signOut: () => signOutMutation.mutateAsync(),
    isSigningOut: signOutMutation.isPending,
    signOutError: signOutMutation.error?.message ?? null,
  };
}
