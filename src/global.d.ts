interface Window {
  /** Pending settings section to open (set by CommandPalette or deep-links; consumed by SettingsTab on mount) */
  __paletteSection?: string;
  /** Agent slug injected by the Tauri init script for agent-HUD windows */
  __AGENT_SLUG?: string;
}
