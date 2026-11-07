import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useChatGpt, CHATGPT_STATUS_KEY } from "./useChatGpt";
import { commands } from "../bindings";
import type { ChatGptStatus } from "../bindings";

vi.mock("../bindings", () => ({
  commands: {
    chatgptStatus: vi.fn(),
    chatgptSignIn: vi.fn(),
    chatgptSignOut: vi.fn(),
  },
}));

const signedOut: ChatGptStatus = {
  signed_in: false,
  email: null,
  plan_enabled: false,
  keychain_available: true,
  client_registered: false,
};
const signedIn: ChatGptStatus = {
  signed_in: true,
  email: "me@example.com",
  plan_enabled: true,
  keychain_available: true,
  client_registered: true,
};

describe("useChatGpt", () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    vi.clearAllMocks();
  });

  it("loads the status", async () => {
    vi.mocked(commands.chatgptStatus).mockResolvedValueOnce(signedOut);
    const { result } = renderHook(() => useChatGpt(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.status).toEqual(signedOut);
    expect(result.current.error).toBeNull();
  });

  it("surfaces a status error", async () => {
    // The hook retries once, so reject on every attempt.
    vi.mocked(commands.chatgptStatus).mockRejectedValue(new Error("keychain down"));
    const { result } = renderHook(() => useChatGpt(), { wrapper });
    await waitFor(() => expect(result.current.error).toBe("keychain down"), { timeout: 4000 });
    expect(result.current.status).toBeNull();
  });

  it("signing in updates the cached status and refetches dependent queries", async () => {
    vi.mocked(commands.chatgptStatus).mockResolvedValueOnce(signedOut);
    vi.mocked(commands.chatgptSignIn).mockResolvedValueOnce(signedIn);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useChatGpt(), { wrapper });
    await waitFor(() => expect(result.current.status).toEqual(signedOut));

    await act(async () => {
      await result.current.signIn();
    });

    expect(commands.chatgptSignIn).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(CHATGPT_STATUS_KEY)).toEqual(signedIn);
    await waitFor(() => expect(result.current.status?.email).toBe("me@example.com"));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["ai_config"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["models"] });
  });

  it("a failed sign-in exposes the message and keeps the status", async () => {
    vi.mocked(commands.chatgptStatus).mockResolvedValueOnce(signedOut);
    vi.mocked(commands.chatgptSignIn).mockRejectedValueOnce(new Error("Sign-in was cancelled."));
    const { result } = renderHook(() => useChatGpt(), { wrapper });
    await waitFor(() => expect(result.current.status).toEqual(signedOut));

    await act(async () => {
      await result.current.signIn().catch(() => undefined);
    });

    await waitFor(() => expect(result.current.signInError).toBe("Sign-in was cancelled."));
    expect(result.current.status).toEqual(signedOut);
  });

  it("signing out stores the returned status", async () => {
    vi.mocked(commands.chatgptStatus).mockResolvedValueOnce(signedIn);
    vi.mocked(commands.chatgptSignOut).mockResolvedValueOnce({
      revocation_confirmed: false,
      status: { ...signedOut, client_registered: true },
    });
    const { result } = renderHook(() => useChatGpt(), { wrapper });
    await waitFor(() => expect(result.current.status?.signed_in).toBe(true));

    let outcome: Awaited<ReturnType<typeof result.current.signOut>> | undefined;
    await act(async () => {
      outcome = await result.current.signOut();
    });

    expect(outcome?.revocation_confirmed).toBe(false);
    await waitFor(() => expect(result.current.status?.signed_in).toBe(false));
  });
});
