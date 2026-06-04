import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useConfig } from "./useConfig";

const mockInvoke = vi.mocked(invoke);

const fakeConfig = {
  hotkeys: [{ key: "Ctrl+K", enabled: true, action: "open_palette" }],
  theme: "dark",
  api_keys: [{ provider: "openai", key: "sk-test" }],
  window: { pin: false, width: 800, height: 600 },
  version: "1.0.0",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useConfig", () => {
  // ── 1. Initial state ──────────────────────────────────────────────
  it("starts with config null, loading true, error null", () => {
    // Never resolve so the hook stays in its initial state
    mockInvoke.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useConfig());

    expect(result.current.config).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  // ── 2. Successful config load ─────────────────────────────────────
  it("loads config successfully and sets loading to false", async () => {
    mockInvoke.mockResolvedValue(fakeConfig);

    const { result } = renderHook(() => useConfig());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.config).toEqual(fakeConfig);
    expect(result.current.error).toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith("get_config");
  });

  // ── 3. Failed config load ────────────────────────────────────────
  it("sets error and loading false when get_config rejects", async () => {
    mockInvoke.mockRejectedValue(new Error("disk read failed"));

    const { result } = renderHook(() => useConfig());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Error: disk read failed");
    expect(result.current.config).toBeNull();
  });

  // ── 4. updateConfig success ───────────────────────────────────────
  it("calls invoke with correct args and updates config state", async () => {
    // Initial load
    mockInvoke.mockResolvedValueOnce(fakeConfig);

    const { result } = renderHook(() => useConfig());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const updatedConfig = { ...fakeConfig, theme: "light" };
    mockInvoke.mockResolvedValueOnce(updatedConfig);

    let returned: unknown;
    await act(async () => {
      returned = await result.current.updateConfig({ theme: "light" });
    });

    expect(mockInvoke).toHaveBeenCalledWith("update_config", {
      partial: { theme: "light" },
    });
    expect(result.current.config).toEqual(updatedConfig);
    expect(returned).toEqual(updatedConfig);
    expect(result.current.error).toBeNull();
  });

  // ── 5. updateConfig failure ───────────────────────────────────────
  it("sets error and re-throws when update_config rejects", async () => {
    // Initial load succeeds
    mockInvoke.mockResolvedValueOnce(fakeConfig);

    const { result } = renderHook(() => useConfig());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const updateError = new Error("permission denied");
    mockInvoke.mockRejectedValueOnce(updateError);

    await act(async () => {
      await expect(
        result.current.updateConfig({ theme: "light" }),
      ).rejects.toThrow("permission denied");
    });

    expect(result.current.error).toBe("Error: permission denied");
    // config should remain unchanged from the initial load
    expect(result.current.config).toEqual(fakeConfig);
  });
});
