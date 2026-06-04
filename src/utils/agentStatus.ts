/** Shared agent-status helpers — eliminates duplication across HomeTab, AgentsTab */

export const AGENT_STATUS_COLORS: Record<string, string> = {
  idle:      "#ff9800",
  created:   "#ff9800",
  running:   "#4caf50",
  done:      "#4fc3f7",
  completed: "#4fc3f7",
  error:     "#f44336",
  failed:    "#f44336",
  paused:    "#a0a0b0",
  archived:  "#888",
};

export function agentStatusColor(state: string): string {
  return AGENT_STATUS_COLORS[state.toLowerCase()] ?? "#a0a0b0";
}

export function agentStatusLabel(state: string): string {
  const map: Record<string, string> = {
    running: "running", completed: "done", done: "done",
    failed: "error", error: "error", archived: "archived",
    paused: "paused", created: "idle", idle: "idle",
  };
  return map[state.toLowerCase()] ?? "idle";
}
