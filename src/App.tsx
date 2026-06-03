import { useState, useCallback, useEffect, lazy, Suspense, Component, ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import HomeTab from "./components/HomeTab";
import { useConfig } from "./hooks/useConfig";
import "./styles/theme.css";

const SettingsTab = lazy(() => import("./components/SettingsTab"));

type Tab = "home" | "agents" | "connections" | "settings";

interface ToastMessage {
  id: number;
  text: string;
  type: "success" | "error" | "info";
}

let toastIdCounter = 0;

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("ErrorBoundary caught:", error);
  }

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

function Toast({ message, onDismiss }: { message: ToastMessage; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(message.id), 4000);
    return () => clearTimeout(timer);
  }, [message.id, onDismiss]);

  return (
    <div className={`toast toast-${message.type}`}>
      <span className="toast-text">{message.text}</span>
      <button className="toast-close" onClick={() => onDismiss(message.id)}>×</button>
    </div>
  );
}

function getEffectiveTheme(theme: string): string {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [animState, setAnimState] = useState<"enter" | "exit" | "">("enter");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [tabTransition, setTabTransition] = useState(false);
  const { config, updateConfig } = useConfig();

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        setAnimState(focused ? "enter" : "exit");
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    if (!config) return;
    const effective = getEffectiveTheme(config.theme);
    document.documentElement.setAttribute("data-theme", effective);
  }, [config]);

  useEffect(() => {
    if (!config || config.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [config]);

  const showToast = useCallback((text: string, type: "success" | "error" | "info" = "info") => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, text, type }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  (window as unknown as Record<string, unknown>).__setActiveTab = useCallback(
    (tab: string) => {
      setActiveTab(tab as Tab);
    },
    [],
  );

  (window as unknown as Record<string, unknown>).__showToast = showToast;

  const handleTabChange = useCallback((tab: Tab) => {
    setTabTransition(true);
    setTimeout(() => {
      setActiveTab(tab);
      setTabTransition(false);
    }, 100);
  }, []);

  const togglePin = useCallback(async () => {
    if (!config) return;
    try {
      await updateConfig({ window: { ...config.window, pin: !config.window.pin } });
    } catch (e) {
      console.error("Failed to toggle pin:", e);
    }
  }, [config, updateConfig]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "agents", label: "Agents" },
    { id: "connections", label: "Connections" },
    { id: "settings", label: "Settings" },
  ];

  const renderTabContent = () => {
    const content = (() => {
      switch (activeTab) {
        case "home":
          return <HomeTab />;
        case "agents":
          return (
            <div className="placeholder-tab">
              <h2>Agents</h2>
              <p>Agent management with bundled skills and custom agents.</p>
            </div>
          );
        case "connections":
          return (
            <div className="placeholder-tab">
              <h2>Connections</h2>
              <p>Integration connections for external services.</p>
            </div>
          );
        case "settings":
          return (
            <Suspense fallback={<div className="skeleton-loader" />}>
              <SettingsTab />
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
    <ErrorBoundary>
      <div className={`app-container${animState ? ` panel-${animState}` : ""}`}>
        <nav className="tab-bar">
          <div className="tab-bar-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => handleTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            className="pin-toggle-btn"
            onClick={togglePin}
            title={config?.window?.pin ? "Unpin panel" : "Pin panel"}
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
        </nav>
        <main className="tab-content">
          {renderTabContent()}
        </main>
        <div className="toast-container">
          {toasts.map((t) => (
            <Toast key={t.id} message={t} onDismiss={dismissToast} />
          ))}
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;
