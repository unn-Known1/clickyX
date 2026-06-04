interface Window {
  /** @deprecated use AppContext instead */
  __setActiveTab?: (tab: string) => void;
  /** @deprecated use AppContext instead */
  __showToast?: (text: string, type: "success" | "error" | "info") => void;
  /** Used by CommandPalette to deep-link into settings sections */
  __paletteSection?: (section: string) => void;
}
