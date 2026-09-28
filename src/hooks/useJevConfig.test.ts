import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useJevConfig, JEV_CONFIG_KEY } from "./useJevConfig";
import { commands } from "../bindings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../bindings", () => ({
  commands: {
    getJevConfig: vi.fn(),
    updateJevConfig: vi.fn(),
    getJevPresets: vi.fn(),
    testJevJudge: vi.fn(),
    jevDecide: vi.fn(),
  },
}));

const mockJev = {
  provider: "openrouter",
  base_url: "https://openrouter.ai/api/alpha/decisions",
  model: "typesafe/jev-1.13",
  api_key: null,
};

describe("useJevConfig", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    vi.clearAllMocks();
    vi.mocked(commands.getJevPresets).mockResolvedValue([]);
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  it("exports a stable query key", () => {
    expect(JEV_CONFIG_KEY).toEqual(["jev_config"]);
  });

  it("fetches jev config successfully", async () => {
    vi.mocked(commands.getJevConfig).mockResolvedValueOnce(mockJev);
    const { result } = renderHook(() => useJevConfig(), { wrapper });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.config).toEqual(mockJev);
    expect(result.current.error).toBeNull();
  });

  it("surfaces load errors", async () => {
    vi.mocked(commands.getJevConfig).mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useJevConfig(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 5000 });
    expect(result.current.error).toBe("nope");
  }, 10000);

  it("updates config and invalidates model lists", async () => {
    vi.mocked(commands.getJevConfig).mockResolvedValueOnce(mockJev);
    vi.mocked(commands.updateJevConfig).mockResolvedValueOnce({ ...mockJev, model: "jev-1.13.0" });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useJevConfig(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await result.current.updateConfig({ model: "jev-1.13.0" });
    expect(commands.updateJevConfig).toHaveBeenCalledWith({ model: "jev-1.13.0" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["models"] });
  });

  it("testJudge propagates failures without persisting", async () => {
    vi.mocked(commands.getJevConfig).mockResolvedValueOnce(mockJev);
    vi.mocked(commands.testJevJudge).mockRejectedValueOnce(new Error("401"));
    const { result } = renderHook(() => useJevConfig(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.testJudge()).rejects.toThrow("401");
    expect(commands.updateJevConfig).not.toHaveBeenCalled();
  });
});
