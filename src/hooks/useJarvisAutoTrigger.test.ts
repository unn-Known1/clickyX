import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useJarvisAutoTrigger, JARVIS_AUTO_MIN_INTERVAL_MS } from "./useJarvisAutoTrigger";
import { JARVIS_STATUS_KEY } from "./useJarvis";
import { commands } from "../bindings";

const handlers = new Map<string, (e: never) => void>();

vi.mock("../bindings", () => ({
  commands: {
    jarvisExtract: vi.fn(),
  },
  listen: vi.fn((event: string, handler: (e: never) => void) => {
    handlers.set(event, handler);
    return Promise.resolve(() => {
      handlers.delete(event);
    });
  }),
}));

const onStatus = {
  enabled: true,
  paused: false,
  hotkey: "Ctrl+Shift+J",
  auto_trigger: true,
  has_jev_key: true,
  wayland_fill_limited: false,
  kb_notes: 0,
  kb_contacts: 0,
};

describe("useJarvisAutoTrigger", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    handlers.clear();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    vi.clearAllMocks();
    queryClient.setQueryData(JARVIS_STATUS_KEY, onStatus);
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  const fireFrame = () => {
    const h = handlers.get("auto-capture-frame");
    expect(h).toBeDefined();
    act(() => {
      h!({} as never);
    });
  };

  it("triggers on first frame, then throttles", async () => {
    expect(JARVIS_AUTO_MIN_INTERVAL_MS).toBe(60_000);
    vi.mocked(commands.jarvisExtract).mockResolvedValue({
      title: "Chat A",
      app_name: "Chat A",
      session: "jarvis-a",
      width: 1,
      height: 1,
      image_base64: "",
      fallback: false,
      display_server: "x11",
    });
    const onTrigger = vi.fn();
    renderHook(() => useJarvisAutoTrigger(onTrigger), { wrapper });
    fireFrame();
    await waitFor(() => expect(onTrigger).toHaveBeenCalledTimes(1));
    // Immediate second frame: throttled (same tick, <60s).
    fireFrame();
    await new Promise((r) => setTimeout(r, 50));
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it("ignores unchanged sessions", async () => {
    vi.mocked(commands.jarvisExtract).mockResolvedValue({
      title: "Chat A",
      app_name: "Chat A",
      session: "jarvis-same",
      width: 1,
      height: 1,
      image_base64: "",
      fallback: false,
      display_server: "x11",
    });
    const onTrigger = vi.fn();
    renderHook(() => useJarvisAutoTrigger(onTrigger), { wrapper });
    fireFrame();
    await waitFor(() => expect(onTrigger).toHaveBeenCalledTimes(1));
    // Advance past throttle, same session → no trigger.
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61_000);
    fireFrame();
    await new Promise((r) => setTimeout(r, 50));
    expect(onTrigger).toHaveBeenCalledTimes(1);
    (Date.now as unknown as { mockRestore: () => void }).mockRestore?.();
  });

  it("stays off unless fully opted in", async () => {
    queryClient.setQueryData(JARVIS_STATUS_KEY, { ...onStatus, auto_trigger: false });
    const onTrigger = vi.fn();
    renderHook(() => useJarvisAutoTrigger(onTrigger), { wrapper });
    fireFrame();
    await new Promise((r) => setTimeout(r, 50));
    expect(commands.jarvisExtract).not.toHaveBeenCalled();
    expect(onTrigger).not.toHaveBeenCalled();
  });
});
