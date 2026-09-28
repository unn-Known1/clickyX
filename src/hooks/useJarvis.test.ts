import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useJarvis, JARVIS_CONFIG_KEY } from "./useJarvis";
import { commands } from "../bindings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../bindings", () => ({
  commands: {
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
    jarvisStatus: vi.fn(),
  },
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

const mockStatus = {
  enabled: true,
  paused: false,
  hotkey: "Ctrl+Shift+J",
  auto_trigger: false,
  has_jev_key: true,
  wayland_fill_limited: false,
  kb_notes: 0,
  kb_contacts: 0,
};

const mockJarvis = {
  enabled: true,
  paused: false,
  hotkey: "Ctrl+Shift+J",
  auto_trigger: false,
  fill_mode: "clipboard",
  kb_opt_in_history: false,
  blocklist_extra: [],
};

describe("useJarvis", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    vi.clearAllMocks();
    vi.mocked(commands.jarvisStatus).mockResolvedValue(mockStatus as never);
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  it("exports a stable query key", () => {
    expect(JARVIS_CONFIG_KEY).toEqual(["jarvis_config"]);
  });

  it("loads jarvis slice from getConfig", async () => {
    vi.mocked(commands.getConfig).mockResolvedValueOnce({ jarvis: mockJarvis } as never);
    const { result } = renderHook(() => useJarvis(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.config).toEqual(mockJarvis);
    expect(result.current.enabled).toBe(true);
    expect(result.current.paused).toBe(false);
  });

  it("handles missing jarvis slice as null", async () => {
    vi.mocked(commands.getConfig).mockResolvedValueOnce({} as never);
    const { result } = renderHook(() => useJarvis(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.config).toBeNull();
  });

  it("loads status alongside config", async () => {
    vi.mocked(commands.getConfig).mockResolvedValueOnce({ jarvis: mockJarvis } as never);
    const { result } = renderHook(() => useJarvis(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.status).toEqual(mockStatus));
  });

  it("updates via updateConfig jarvis arm", async () => {
    vi.mocked(commands.getConfig).mockResolvedValueOnce({ jarvis: mockJarvis } as never);
    vi.mocked(commands.updateConfig).mockResolvedValueOnce({} as never);
    const { result } = renderHook(() => useJarvis(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await result.current.updateConfig({ paused: true });
    expect(commands.updateConfig).toHaveBeenCalledWith({ jarvis: { paused: true } });
  });
});
