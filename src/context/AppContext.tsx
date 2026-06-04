import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: number;
  text: string;
  type: ToastType;
}

export type Tab = "home" | "agents" | "connections" | "settings";

interface AppCtx {
  toasts: ToastMessage[];
  showToast: (text: string, type?: ToastType) => void;
  dismissToast: (id: number) => void;
  activeTab: Tab;
  tabTransition: boolean;
  setActiveTab: (tab: Tab) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────
const AppContext = createContext<AppCtx | null>(null);

export function useAppContext(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used inside AppProvider");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────
let _toastCounter = 0;

export function AppProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [activeTab, setActiveTabState] = useState<Tab>("home");
  const [tabTransition, setTabTransition] = useState(false);

  const showToast = useCallback((text: string, type: ToastType = "info") => {
    const id = ++_toastCounter;
    setToasts((prev) => [...prev, { id, text, type }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const setActiveTab = useCallback((tab: Tab) => {
    setTabTransition(true);
    setTimeout(() => {
      setActiveTabState(tab);
      setTabTransition(false);
    }, 100);
  }, []);

  return (
    <AppContext.Provider
      value={{ toasts, showToast, dismissToast, activeTab, tabTransition, setActiveTab }}
    >
      {children}
    </AppContext.Provider>
  );
}
