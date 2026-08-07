interface Window {
  /** Pending settings section to open (set by CommandPalette or deep-links; consumed by SettingsTab on mount) */
  __paletteSection?: string;
  /** Set by deep-link handler; consumed by router on next render */
  __deepLinkPending?: string;
}
