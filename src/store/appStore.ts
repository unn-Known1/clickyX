/**
 * Zustand global store — single source of truth for cross-tab state.
 * Replaces the scattered useState-as-store pattern.
 */
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { AgentInfo, SkillInfo, AudioStatus, TodayStats } from "../bindings";

// F-025: Agent status count summary
interface AgentStatusCounts {
  running: number;
  idle: number;
  done: number;
  error: number;
}

function computeStatusCounts(agents: AgentInfo[]): AgentStatusCounts {
  return agents.reduce(
    (acc, a) => {
      const state = a.state?.toLowerCase() ?? "idle";
      if (state === "running") acc.running++;
      else if (state === "done" || state === "completed") acc.done++;
      else if (state === "error" || state === "failed") acc.error++;
      else acc.idle++;
      return acc;
    },
    { running: 0, idle: 0, done: 0, error: 0 } as AgentStatusCounts,
  );
}

interface AppStore {
  // Agents
  agents: AgentInfo[];
  skills: SkillInfo[];
  agentsLoading: boolean;
  agentsError: string | null;
  // F-025: Derived status counts (kept in sync with agents list)
  agentStatusCounts: AgentStatusCounts;
  setAgents: (agents: AgentInfo[]) => void;
  setSkills: (skills: SkillInfo[]) => void;
  setAgentsLoading: (v: boolean) => void;
  setAgentsError: (e: string | null) => void;

  // Audio / voice status
  audioStatus: AudioStatus | null;
  audioLevel: number;
  setAudioStatus: (s: AudioStatus | null) => void;
  setAudioLevel: (l: number) => void;

  // Stats
  todayStats: TodayStats | null;
  setTodayStats: (s: TodayStats) => void;

  // Theme
  theme: "dark" | "light" | "system";
  setTheme: (t: "dark" | "light" | "system") => void;

  // Attention items (surfaced globally)
  attentionItems: { type: "warning" | "error" | "info"; message: string }[];
  setAttentionItems: (items: { type: "warning" | "error" | "info"; message: string }[]) => void;
}

export const useStore = create<AppStore>()(
  devtools(
    (set) => ({
      // Agents
      agents: [],
      skills: [],
      agentsLoading: false,
      agentsError: null,
      agentStatusCounts: { running: 0, idle: 0, done: 0, error: 0 },
      setAgents: (agents) => set({ agents, agentStatusCounts: computeStatusCounts(agents) }),
      setSkills: (skills) => set({ skills }),
      setAgentsLoading: (agentsLoading) => set({ agentsLoading }),
      setAgentsError: (agentsError) => set({ agentsError }),

      // Audio
      audioStatus: null,
      audioLevel: 0,
      setAudioStatus: (audioStatus) => set({ audioStatus }),
      setAudioLevel: (audioLevel) => set({ audioLevel }),

      // Stats
      todayStats: null,
      setTodayStats: (todayStats) => set({ todayStats }),

      // Theme
      theme: "system",
      setTheme: (theme) => set({ theme }),

      // Attention
      attentionItems: [],
      setAttentionItems: (attentionItems) => set({ attentionItems }),
    }),
    { name: "clickyx-store" },
  ),
);
