/**
 * Zustand global store — cross-cutting UI runtime state ONLY (audio meters,
 * today stats, attention items, theme).
 *
 * P1 (H-8): the dead agent fields (agents/skills/loading/error/counts +
 * setters) were deleted — no component ever populated them (agents live in
 * react-query via useAgents). Server data belongs to react-query; this store
 * holds ephemeral UI state. Always subscribe with SELECTORS
 * (useStore(s => s.x)) so audio-level ticks don't re-render every subscriber.
 */
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { AudioStatus, TodayStats } from "../bindings";

interface AppStore {
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
