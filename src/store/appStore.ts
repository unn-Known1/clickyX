/**
 * Zustand global store — single source of truth for cross-tab state.
 * Replaces the scattered useState-as-store pattern.
 */
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { AgentInfo, SkillInfo, AudioStatus, TodayStats } from "../bindings";

interface AppStore {
  // Agents
  agents: AgentInfo[];
  skills: SkillInfo[];
  agentsLoading: boolean;
  agentsError: string | null;
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
      setAgents: (agents) => set({ agents }),
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
