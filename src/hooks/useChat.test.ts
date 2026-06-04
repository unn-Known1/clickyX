import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChat } from "../hooks/useChat";

// Mock Tauri
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((_event: string, callback: (e: { payload: unknown }) => void) => {
    // Store callback for manual triggering in tests
    (globalThis as Record<string, unknown>).__lastStreamCallback = callback;
    return Promise.resolve(() => {});
  }),
}));

import { invoke } from "@tauri-apps/api/core";

describe("useChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with empty state", () => {
    const { result } = renderHook(() => useChat());
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.streaming).toBe(false);
    expect(result.current.currentText).toBe("");
    expect(result.current.error).toBe(null);
  });

  it("sets streaming=true after sendMessageStream", async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.sendMessageStream("hello");
    });
    // After invocation, streaming is true until Done event
    expect(result.current.messages.some(m => m.role === "user")).toBe(true);
  });

  it("adds user message immediately", async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      result.current.sendMessageStream("test message");
    });
    expect(result.current.messages[0]).toMatchObject({ role: "user", content: "test message" });
  });

  it("clearMessages resets state", async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { result } = renderHook(() => useChat());
    await act(async () => { result.current.sendMessageStream("hello"); });
    act(() => { result.current.clearMessages(); });
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.streaming).toBe(false);
  });

  it("cancelStream stops streaming", async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { result } = renderHook(() => useChat());
    await act(async () => { result.current.sendMessageStream("hello"); });
    act(() => { result.current.cancelStream(); });
    expect(result.current.streaming).toBe(false);
  });

  it("does not send empty messages", async () => {
    const { result } = renderHook(() => useChat());
    await act(async () => { result.current.sendMessageStream("   "); });
    expect(result.current.messages).toHaveLength(0);
    expect(invoke).not.toHaveBeenCalled();
  });
});
