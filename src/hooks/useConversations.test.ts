import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import type { ReactNode } from "react";
import { useConversations } from "../hooks/useConversations";
import { invoke } from "@tauri-apps/api/core";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation((cmd) => {
    if (cmd === "load_conversations") return Promise.resolve([]);
    if (cmd === "save_conversations") return Promise.resolve();
    return Promise.resolve(undefined);
  }),
}));

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useConversations", () => {
  it("starts with empty conversations", async () => {
    const { result } = renderHook(() => useConversations(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.activeId).toBe(null);
  });

  it("creates a conversation", async () => {
    const { result } = renderHook(() => useConversations(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let id: string;
    act(() => { id = result.current.createConversation(); });
    // react-query cache notifications land on a setTimeout(0) tick, so await them.
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    expect(result.current.activeId).toBe(id!);
    expect(result.current.conversations[0].title).toBe("New conversation");
  });

  it("deletes a conversation", async () => {
    const { result } = renderHook(() => useConversations(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let id: string;
    act(() => { id = result.current.createConversation(); });
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    act(() => { result.current.deleteConversation(id!); });
    await waitFor(() => expect(result.current.conversations).toHaveLength(0));
    expect(result.current.activeId).toBe(null);
  });

  it("updates messages and derives title", async () => {
    const { result } = renderHook(() => useConversations(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let id: string;
    act(() => { id = result.current.createConversation(); });
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    act(() => {
      result.current.updateMessages(id!, [
        { role: "user", content: "Hello there", timestamp: Date.now() },
      ]);
    });
    await waitFor(() => expect(result.current.conversations[0].title).toBe("Hello there"));
  });

  it("persists conversations to backend", async () => {
    const { result } = renderHook(() => useConversations(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    act(() => { result.current.createConversation(); });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("save_conversations", expect.any(Object)),
    );
  });

  it("renames a conversation", async () => {
    const { result } = renderHook(() => useConversations(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let id: string;
    act(() => { id = result.current.createConversation(); });
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    act(() => { result.current.renameConversation(id!, "My custom title"); });
    await waitFor(() => expect(result.current.conversations[0].title).toBe("My custom title"));
  });
});
