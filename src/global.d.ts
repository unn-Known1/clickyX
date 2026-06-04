interface Window {
  /** Used by CommandPalette to deep-link into settings sections */
  __paletteSection?: (section: string) => void;
  /** Set by deep-link handler; consumed by router on next render */
  __deepLinkPending?: string;
}
