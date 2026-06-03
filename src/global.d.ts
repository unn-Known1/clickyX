interface Window {
  __setActiveTab?: (tab: string) => void;
  __showToast?: (text: string, type: "success" | "error" | "info") => void;
}
