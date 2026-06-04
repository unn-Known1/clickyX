import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useAgents, AgentInfo, SkillInfo } from "./useAgents";

function createWrapper() {
  const queryClient = new QueryClient();
  queryClient.setQueryDefaults(["agents"], { retryDelay: 0 });
  queryClient.setQueryDefaults(["skills"], { retryDelay: 0 });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useAgents", () => {
  const mockAgent: AgentInfo = {
    id: "1",
    name: "Test Agent",
    slug: "test-agent",
    state: "idle",
    skills: ["skill1"],
    created_at: "now",
    updated_at: "now",
    transcript: [],
  };

  const mockSkill: SkillInfo = {
    name: "skill1",
    description: "A test skill",
    version: "1.0",
    permission_class: "none",
    entry_point: "main.js",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "list_agents") return [mockAgent];
      if (cmd === "list_skills") return [mockSkill];
      return undefined;
    });
  });

  it("calls list_agents and list_skills on mount and updates state", async () => {
    const { result } = renderHook(() => useAgents(), { wrapper: createWrapper() });
    
    expect(result.current.loading).toBe(true);
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("list_agents");
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("list_skills");
    
    expect(result.current.agents).toEqual([mockAgent]);
    expect(result.current.skills).toEqual([mockSkill]);
    expect(result.current.error).toBeNull();
  });

  it("handles fetch agents error", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "list_agents") throw new Error("Agent fetch failed");
      if (cmd === "list_skills") return [mockSkill];
    });

    const { result } = renderHook(() => useAgents(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.error).toBe("Agent fetch failed");
    });

    expect(result.current.agents).toEqual([]);
  });

  it("handles fetch skills error", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "list_agents") return [mockAgent];
      if (cmd === "list_skills") throw new Error("Skill fetch failed");
    });

    const { result } = renderHook(() => useAgents(), { wrapper: createWrapper() });

    await waitFor(() => {
      // Only agents error is exposed; skills error is not surfaced
      expect(result.current.agents).toEqual([mockAgent]);
    });

    expect(result.current.skills).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("createAgent invokes command and refetches", async () => {
    const { result } = renderHook(() => useAgents(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(invoke).mockClear();

    await act(async () => {
      await result.current.createAgent("New Agent", "new-agent", ["skill2"]);
    });

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("create_agent", {
      name: "New Agent",
      slug: "new-agent",
      skills: ["skill2"],
    });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("list_agents");
  });

  it("createAgent handles error", async () => {
    const { result } = renderHook(() => useAgents(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(invoke).mockImplementationOnce(async (cmd) => {
      if (cmd === "create_agent") throw new Error("Creation failed");
    });

    await expect(async () => {
      await act(async () => {
        await result.current.createAgent("New", "new", []);
      });
    }).rejects.toThrow("Creation failed");
  });

  it("runAgent invokes command and refetches", async () => {
    const { result } = renderHook(() => useAgents(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(invoke).mockClear();

    await act(async () => {
      await result.current.runAgent("test-agent", "hello");
    });

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("run_agent", { slug: "test-agent", prompt: "hello" });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("list_agents");
  });

  it("stopAgent invokes command and refetches", async () => {
    const { result } = renderHook(() => useAgents(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(invoke).mockClear();

    await act(async () => {
      await result.current.stopAgent("test-agent");
    });

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("stop_agent", { slug: "test-agent" });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("list_agents");
  });

  it("archiveAgent invokes command and refetches", async () => {
    const { result } = renderHook(() => useAgents(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(invoke).mockClear();

    await act(async () => {
      await result.current.archiveAgent("test-agent");
    });

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("archive_agent", { slug: "test-agent" });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("list_agents");
  });

  it("enableSkill invokes command and refetches", async () => {
    const { result } = renderHook(() => useAgents(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(invoke).mockClear();

    await act(async () => {
      await result.current.enableSkill("test-agent", "skill1");
    });

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("enable_skill", { slug: "test-agent", skillName: "skill1" });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("list_agents");
  });

  it("disableSkill invokes command and refetches", async () => {
    const { result } = renderHook(() => useAgents(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(invoke).mockClear();

    await act(async () => {
      await result.current.disableSkill("test-agent", "skill1");
    });

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("disable_skill", { slug: "test-agent", skillName: "skill1" });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("list_agents");
  });
});
