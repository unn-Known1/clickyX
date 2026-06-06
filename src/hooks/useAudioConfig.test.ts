import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAudioConfig } from "./useAudioConfig";
import { commands } from "../bindings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../bindings", () => ({
  commands: {
    getAudioConfig: vi.fn(),
    updateAudioConfig: vi.fn(),
  },
}));

describe("useAudioConfig", () => {
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

  it("fetches audio config successfully", async () => {
    const mockConfig = {
      ptt_hotkey: "ctrl+space",
      stt_provider: "deepgram",
      tts_provider: "elevenlabs",
      activation_mode: "ptt",
      auto_submit: true,
      volume: 0.8,
      selected_voice_id: "default",
    };
    vi.mocked(commands.getAudioConfig).mockResolvedValueOnce(mockConfig);

    const { result } = renderHook(() => useAudioConfig(), { wrapper });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.config).toEqual(mockConfig);
    expect(result.current.error).toBeNull();
  });

  it("updates config successfully", async () => {
    const mockConfig = {
      ptt_hotkey: "ctrl+space",
      stt_provider: "deepgram",
      tts_provider: "elevenlabs",
      activation_mode: "ptt",
      auto_submit: true,
      volume: 0.8,
      selected_voice_id: "default",
    };
    vi.mocked(commands.getAudioConfig).mockResolvedValueOnce(mockConfig);
    vi.mocked(commands.updateAudioConfig).mockResolvedValueOnce({
      ...mockConfig,
      volume: 1.0,
    });

    const { result } = renderHook(() => useAudioConfig(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.updateConfig({ volume: 1.0 });
    
    expect(commands.updateAudioConfig).toHaveBeenCalledWith({ volume: 1.0 });
    await waitFor(() => expect(result.current.config?.volume).toBe(1.0));
  });
});
