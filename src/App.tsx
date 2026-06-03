import { useState, useCallback, useEffect, lazy, Suspense, Component, ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import HomeTab from "./components/HomeTab";
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

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [animState, setAnimState] = useState<"enter" | "exit" | "">("enter");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [tabTransition, setTabTransition] = useState(false);

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
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
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
