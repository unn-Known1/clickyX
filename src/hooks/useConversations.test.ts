import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConversations } from "../hooks/useConversations";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

// Clear sessionStorage between tests
beforeEach(() => { sessionStorage.clear(); });

describe("useConversations", () => {
  it("starts with empty conversations", () => {
    const { result } = renderHook(() => useConversations());
    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.activeId).toBe(null);
  });

  it("creates a conversation", () => {
    const { result } = renderHook(() => useConversations());
    let id: string;
    act(() => { id = result.current.createConversation(); });
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.activeId).toBe(id!);
    expect(result.current.conversations[0].title).toBe("New conversation");
  });

  it("deletes a conversation", () => {
    const { result } = renderHook(() => useConversations());
    let id: string;
    act(() => { id = result.current.createConversation(); });
    act(() => { result.current.deleteConversation(id!); });
    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.activeId).toBe(null);
  });

  it("updates messages and derives title", () => {
    const { result } = renderHook(() => useConversations());
    let id: string;
    act(() => { id = result.current.createConversation(); });
    act(() => {
      result.current.updateMessages(id!, [
        { role: "user", content: "Hello there", timestamp: Date.now() },
      ]);
    });
    expect(result.current.conversations[0].title).toBe("Hello there");
  });

  it("persists conversations in sessionStorage", () => {
    const { result } = renderHook(() => useConversations());
    act(() => { result.current.createConversation(); });
    const stored = JSON.parse(sessionStorage.getItem("clickyx_conversations") ?? "[]");
    expect(stored).toHaveLength(1);
  });

  it("renames a conversation", () => {
    const { result } = renderHook(() => useConversations());
    let id: string;
    act(() => { id = result.current.createConversation(); });
    act(() => { result.current.renameConversation(id!, "My custom title"); });
    expect(result.current.conversations[0].title).toBe("My custom title");
  });
});
