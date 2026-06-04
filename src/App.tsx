import { useState, useCallback, useEffect, lazy, Suspense, Component, ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import HomeTab from "./components/HomeTab";
import AgentsTab from "./components/AgentsTab";
import ConnectionsTab from "./components/ConnectionsTab";
import OnboardingWizard from "./components/OnboardingWizard";
import UpdateBanner from "./components/UpdateBanner";
import AboutDialog from "./components/AboutDialog";
import CommandPalette from "./components/CommandPalette";
import StatusBar from "./components/StatusBar";
import { useConfig } from "./hooks/useConfig";
import { AppProvider, useAppContext } from "./context/AppContext";
import type { Tab } from "./context/AppContext";
import "./styles/theme.css";
import "./components/OnboardingWizard.css";

const SettingsTab = lazy(() => import("./components/SettingsTab"));

// ── Error Boundary ─────────────────────────────────────────────────────────────
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error("ErrorBoundary caught:", error); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>An unexpected error occurred. Please restart the app.</p>
          <button onClick={() => this.setState({ hasError: false })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Toast ──────────────────────────────────────────────────────────────────────
function Toast({
  message,
  onDismiss,
}: {
  message: { id: number; text: string; type: string };
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(message.id), 4000);
    return () => clearTimeout(t);
  }, [message.id, onDismiss]);

  return (
    <div className={`toast toast-${message.type}`} role="alert">
      <span className="toast-text">{message.text}</span>
      <button
        className="toast-close"
        onClick={() => onDismiss(message.id)}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}

// ── Theme helpers ──────────────────────────────────────────────────────────────
function getEffectiveTheme(theme: string): string {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "home",        label: "Home" },
  { id: "agents",      label: "Agents" },
  { id: "connections", label: "Connections" },
  { id: "settings",   label: "Settings" },
];

// ── Inner app — has access to AppContext ───────────────────────────────────────
function AppInner() {
  const { activeTab, tabTransition, setActiveTab, toasts, dismissToast, showToast } =
    useAppContext();
  const { config, updateConfig } = useConfig();
  const [animState, setAnimState] = useState<"enter" | "exit" | "">("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // focus animation
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        setAnimState(focused ? "enter" : "exit");
      })
      .then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, []);

  // theme sync
  useEffect(() => {
    if (!config) return;
    document.documentElement.setAttribute("data-theme", getEffectiveTheme(config.theme));
  }, [config]);

  useEffect(() => {
    if (!config || config.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () =>
      document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [config]);

  // Onboarding gate
  useEffect(() => {
    if (!config) return;
    const cfg = config as unknown as Record<string, unknown>;
    if (cfg.onboarding_completed !== true) {
      setShowOnboarding(true);
    }
  }, [config]);

  // Command palette shortcut (Ctrl/Cmd+K)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const finishOnboarding = useCallback(async () => {
    setShowOnboarding(false);
    try {
      await updateConfig({ onboarding_completed: true });
    } catch {
      /* non-fatal */
    }
  }, [updateConfig]);

  const togglePin = useCallback(async () => {
    if (!config) return;
    try {
      await updateConfig({ window: { ...config.window, pin: !config.window.pin } });
    } catch (e) {
      console.error("Failed to toggle pin:", e);
      showToast("Failed to toggle pin", "error");
    }
  }, [config, updateConfig, showToast]);

  const renderTabContent = () => {
    const content = (() => {
      switch (activeTab) {
        case "home":        return <HomeTab />;
        case "agents":      return <AgentsTab />;
        case "connections": return <ConnectionsTab />;
        case "settings":
          return (
            <Suspense fallback={<div className="skeleton-loader" />}>
              <SettingsTab onOpenAbout={() => setShowAbout(true)} />
            </Suspense>
          );
      }
    })();
    return (
      <div className={`tab-transition${tabTransition ? " tab-exit" : " tab-enter"}`}>
        {content}
      </div>
    );
  };

  return (
    <>
      <div className={`app-container${animState ? ` panel-${animState}` : ""}`}>
        <UpdateBanner />

        <nav className="tab-bar" role="tablist" aria-label="Main navigation">
          <div className="tab-bar-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`tabpanel-${tab.id}`}
                id={`tab-${tab.id}`}
                className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="tab-bar-actions">
            <button
              className="pin-toggle-btn"
              onClick={() => setPaletteOpen(true)}
              title="Command palette (Ctrl+K)"
              aria-label="Open command palette"
            >
              {/* Search icon */}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            <button
              className="pin-toggle-btn"
              onClick={togglePin}
              title={config?.window?.pin ? "Unpin panel" : "Pin panel"}
              aria-label={config?.window?.pin ? "Unpin panel" : "Pin panel"}
            >
              {config?.window?.pin ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <line x1="7" y1="11" x2="7" y2="4" />
                  <line x1="17" y1="11" x2="17" y2="4" />
                  <line x1="12" y1="11" x2="12" y2="2" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
              )}
            </button>
          </div>
        </nav>

        <main
          id={`tabpanel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          className="tab-content"
        >
          {renderTabContent()}
        </main>

        <StatusBar />

        <div className="toast-container" aria-live="polite" aria-atomic="false">
          {toasts.map((t) => (
            <Toast key={t.id} message={t} onDismiss={dismissToast} />
          ))}
        </div>
      </div>

      {showOnboarding && (
        <OnboardingWizard
          onComplete={finishOnboarding}
          onSkip={finishOnboarding}
        />
      )}

      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}

      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onNavigate={(tab) => {
            setActiveTab(tab);
            setPaletteOpen(false);
          }}
        />
      )}
    </>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppInner />
      </AppProvider>
    </ErrorBoundary>
  );
}
