import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { usePublicConfig, redactConfigSecrets } from "./usePublicConfig";

const mockInvoke = vi.mocked(invoke);

function createWrapper() {
  const queryClient = new QueryClient();
  queryClient.setQueryDefaults(["public_config"], { retryDelay: 0 });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const redactedConfig = {
  hotkeys: [{ key: "Ctrl+K", enabled: true, action: "open_palette" }],
  theme: "dark",
  api_keys: [{ provider: "openai", key: "" }],
  window: { pin: false, width: 800, height: 600 },
  version: "1.0.0",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("redactConfigSecrets", () => {
  it("blanks key values but keeps provider names and other fields", () => {
    const redacted = redactConfigSecrets({
      ...redactedConfig,
      api_keys: [{ provider: "openai", key: "sk-live" }],
    } as never);
    expect(redacted.api_keys).toEqual([{ provider: "openai", key: "" }]);
    expect(redacted.theme).toBe("dark");
  });
});

describe("usePublicConfig", () => {
  it("starts with config null, loading true, error null", () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => usePublicConfig(), { wrapper: createWrapper() });

    expect(result.current.config).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("loads via get_public_config, never get_config", async () => {
    mockInvoke.mockResolvedValue(redactedConfig);

    const { result } = renderHook(() => usePublicConfig(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.config).toEqual(redactedConfig);
    expect(result.current.error).toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith("get_public_config");
    expect(mockInvoke).not.toHaveBeenCalledWith("get_config");
  });

  it("sets error and loading false when get_public_config rejects", async () => {
    mockInvoke.mockRejectedValue(new Error("disk read failed"));

    const { result } = renderHook(() => usePublicConfig(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    }, { timeout: 5000 });

    expect(result.current.error).toBe("disk read failed");
    expect(result.current.config).toBeNull();
  });

  it("redacts secrets from update responses before caching", async () => {
    mockInvoke.mockResolvedValueOnce(redactedConfig);

    const { result } = renderHook(() => usePublicConfig(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Backend update_config returns LIVE secrets — they must not land in cache.
    const liveSecrets = {
      ...redactedConfig,
      theme: "light",
      api_keys: [{ provider: "openai", key: "sk-live" }],
    };
    mockInvoke.mockResolvedValueOnce(liveSecrets);

    let returned: unknown;
    await act(async () => {
      returned = await result.current.updateConfig({ theme: "light" });
    });

    expect(mockInvoke).toHaveBeenCalledWith("update_config", {
      partial: { theme: "light" },
    });
    expect(returned).toEqual(liveSecrets);
    await waitFor(() => {
      expect(result.current.config).toEqual({
        ...liveSecrets,
        api_keys: [{ provider: "openai", key: "" }],
      });
    });
  });
});
