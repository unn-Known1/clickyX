import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAiConfig } from "./useAiConfig";
import { commands } from "../bindings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../bindings", () => ({
  commands: {
    getAiConfig: vi.fn(),
    updateAiConfig: vi.fn(),
  },
}));

describe("useAiConfig", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  );

  it("fetches ai config successfully", async () => {
    const mockConfig = {
      anthropic_api_key: "ant-key",
      anthropic_model: "claude",
      openai_api_key: "oai-key",
      openai_model: "gpt",
      openai_base_url: "url",
      default_provider: "anthropic",
      system_prompt: "hello",
    };
    vi.mocked(commands.getAiConfig).mockResolvedValueOnce(mockConfig);

    const { result } = renderHook(() => useAiConfig(), { wrapper });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.config).toEqual(mockConfig);
    expect(result.current.error).toBeNull();
  });

  it("updates config successfully", async () => {
    const mockConfig = {
      anthropic_api_key: "ant-key",
      anthropic_model: "claude",
      openai_api_key: "oai-key",
      openai_model: "gpt",
      openai_base_url: "url",
      default_provider: "anthropic",
      system_prompt: "hello",
    };
    vi.mocked(commands.getAiConfig).mockResolvedValueOnce(mockConfig);
    vi.mocked(commands.updateAiConfig).mockResolvedValueOnce({
      ...mockConfig,
      anthropic_api_key: "new-key",
    });

    const { result } = renderHook(() => useAiConfig(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.updateConfig({ anthropic_api_key: "new-key" });
    
    expect(commands.updateAiConfig).toHaveBeenCalledWith({ anthropic_api_key: "new-key" });
    await waitFor(() => expect(result.current.config?.anthropic_api_key).toBe("new-key"));
  });
});
