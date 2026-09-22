import { useState, useCallback, useEffect, lazy, Suspense, Component, ReactNode, useRef } from "react";
import { getCurrentWindow } from "./bindings";
import { useTauriEvent } from "./hooks/useTauriEvent";
import OnboardingWizard from "./components/OnboardingWizard";
import UpdateBanner from "./components/UpdateBanner";
import AboutDialog from "./components/AboutDialog";
import CommandPalette from "./components/CommandPalette";
import StatusBar from "./components/StatusBar";
import { Icon } from "./components/Icon";
import { useConfig } from "./hooks/useConfig";
import { AppProvider, useAppContext } from "./context/AppContext";
import type { Tab } from "./context/AppContext";
import { useTranslation, Translation } from "react-i18next";
import { applyTheme } from "./utils/theme";
import "./styles/theme.css";
import "./components/OnboardingWizard.css";

// ── F-009: Lazy-load tabs ──────────────────────────────────────────────────────
const HomeTab = lazy(() => import("./components/HomeTab"));
const AgentsTab = lazy(() => import("./components/AgentsTab"));

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
        <Translation>
          {(t) => (
            <div className="error-boundary">
              <h2>{t("app.crashTitle")}</h2>
              <p>{t("app.crashBody")}</p>
              <button onClick={() => this.setState({ hasError: false })}>{t("app.tryAgain")}</button>
            </div>
          )}
        </Translation>
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

  const { t: tr } = useTranslation();
  const toastIcon = message.type === "success" ? "check" : message.type === "error" ? "error" : "info";

  return (
    <div className={`toast toast-${message.type}`} role="alert">
      <span className="toast-icon" aria-hidden="true">
        <Icon name={toastIcon} size={14} />
      </span>
      <span className="toast-text">{message.text}</span>
      <button
        className="toast-close"
        onClick={() => onDismiss(message.id)}
        aria-label={tr("app.dismiss")}
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

// ── Theme sync is variant-aware (see utils/theme) ─────────────────────────────

const TAB_IDS: Tab[] = ["home", "agents", "settings"];

// ── F-031: Splash Screen ───────────────────────────────────────────────────────
function SplashScreen() {
  const { t } = useTranslation();
  return (
    <div className="splash-screen" aria-label={t("app.loadingApp")}>
      <div className="splash-logo" aria-hidden="true">
        <Icon name="sparkle" size={40} />
      </div>
      <div className="splash-name">ClickyX</div>
      <div className="splash-tagline">{t("app.tagline")}</div>
      <div className="splash-spinner" role="progressbar" aria-busy="true" />
    </div>
  );
}

// ── Inner app — has access to AppContext ───────────────────────────────────────
function AppInner() {
  const { t } = useTranslation();
  const { activeTab, tabTransition, setActiveTab, toasts, dismissToast, showToast, requestSection } =
    useAppContext();
  const { config, updateConfig, isLoading: configLoading } = useConfig();
  const [animState, setAnimState] = useState<"enter" | "exit" | "">("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [panelDragOver, setPanelDragOver] = useState(false);
  // F-031: splash only on first mount while config is loading
  const splashShownRef = useRef(false);
  const [showSplash, setShowSplash] = useState(true);

  // Hide splash after config loads or after 1.5s
  useEffect(() => {
    if (!configLoading && !splashShownRef.current) {
      splashShownRef.current = true;
      const t = setTimeout(() => setShowSplash(false), 300);
      return () => clearTimeout(t);
    }
    if (!configLoading) {
      setShowSplash(false);
    }
  }, [configLoading]);

  // Guarantee splash hides after 1.5s max
  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 1500);
    return () => clearTimeout(t);
  }, []);

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

  // theme sync (variant-aware: stored color variant wins)
  useEffect(() => {
    if (!config) return;
    applyTheme(config.theme);
  }, [config]);

  useEffect(() => {
    if (!config || config.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
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

  // Listen for voice-transcript events from always-on VAD.
  // P1 (H-4): shared listener helper — no unmount race.
  useTauriEvent("voice-transcript", (e) => {
    const payload = e.payload as { type: string; text: string };
    if (payload.type === "auto_transcript" && payload.text) {
      showToast(`Voice: ${payload.text.slice(0, 80)}${payload.text.length > 80 ? "…" : ""}`, "info");
    }
  });

  // Listen for type-mode-changed events — used to show indicator in status bar
  const [typeModeActive, setTypeModeActive] = useState(false);
  useTauriEvent<string>("type-mode-changed", (e) => {
    const state = e.payload;
    setTypeModeActive(state === "active");
    if (state === "active") {
      showToast(t("app.typeModeOn"), "info");
    }
  });

  // Listen for voice-selected events
  useTauriEvent("voice-selected", (e) => {
    const voiceId = e.payload as string;
    console.log("[voice] Selected voice:", voiceId);
  });

  // F-015: Deep-link handler for openclicky:// URLs
  useTauriEvent("deep-link-opened", (e) => {
    const url = e.payload as string;
    try {
      const parsed = new URL(url);
      // hostname + pathname gives us "agents", "settings/voice", etc.
      const path = parsed.hostname + parsed.pathname;
      const parts = path.split("/").filter(Boolean);
      if (parts[0] === "agents") {
        setActiveTab("agents");
      } else if (parts[0] === "settings") {
        setActiveTab("settings");
        if (parts[1]) {
          // Signal SettingsTab to open a sub-section (via AppContext, not window globals)
          requestSection(parts[1]);
        }
      } else if (parts[0] === "connections") {
        // P3/IA: connections live under Settings now.
        setActiveTab("settings");
        requestSection("connections");
      } else if (parts[0] === "home") {
        setActiveTab("home");
      }
    } catch (err) {
      console.warn("[deep-link] Failed to parse URL:", url, err);
    }
  });

  // P1 (H-4): tray "Settings" menu entry emits this (replaces the broken
  // window.__setActiveTab eval that was never defined in the frontend).
  useTauriEvent("open-settings", () => {
    setActiveTab("settings");
  });

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
      showToast(t("app.pinFailed"), "error");
    }
  }, [config, updateConfig, showToast]);

  // F-009: Tab skeleton loading fallback
  const tabFallback = (
    <div className="tab-loading">
      <div className="tab-skeleton" />
    </div>
  );

  const renderTabContent = () => {
    const content = (() => {
      switch (activeTab) {
        case "home":
          return (
            <Suspense fallback={tabFallback}>
              <HomeTab />
            </Suspense>
          );
        case "agents":
          return (
            <Suspense fallback={tabFallback}>
              <AgentsTab />
            </Suspense>
          );
        case "settings":
          return (
            <Suspense fallback={tabFallback}>
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

  if (showSplash) {
    return <SplashScreen />;
  }

  return (
    <>
      <div className={`app-container${animState ? ` panel-${animState}` : ""}`}>
        <UpdateBanner />

        {/* F-010: Panel drag region / titlebar */}
        <div 
          className="app-titlebar" 
          data-tauri-drag-region
          onPointerDown={(e) => {
            if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('app-title')) {
              getCurrentWindow().startDragging();
            }
          }}
        >
          <div className="app-title" data-tauri-drag-region>ClickyX</div>
          <div className="window-controls">
            <button
              className="window-btn"
              onClick={() => getCurrentWindow().minimize()}
              aria-label={t("app.minimize")}
              title={t("app.minimize")}
            >
              <Icon name="minus" size={12} />
            </button>
            <button
              className="window-btn window-btn-close"
              onClick={() => getCurrentWindow().close()}
              aria-label={t("app.closeWindow")}
              title={t("app.close")}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        </div>

        <nav className="tab-bar" role="tablist" aria-label={t("app.mainNav")}>
          <div className="tab-bar-tabs">
            {TAB_IDS.map((id) => (
              <button
                key={id}
                role="tab"
                aria-selected={activeTab === id}
                aria-current={activeTab === id ? "page" : undefined}
                aria-controls={`tabpanel-${id}`}
                id={`tab-${id}`}
                className={`tab-button ${activeTab === id ? "active" : ""}`}
                onClick={() => setActiveTab(id)}
              >
                {t(`nav.${id}`)}
              </button>
            ))}
          </div>
          <div className="tab-bar-actions">
            <button
              className="pin-toggle-btn"
              onClick={() => setPaletteOpen(true)}
              title={t("app.paletteHint")}
              aria-label={t("app.openPalette")}
            >
              <Icon name="search" size={13} />
            </button>
            <button
              className="pin-toggle-btn"
              onClick={togglePin}
              title={config?.window?.pin ? t("app.unpin") : t("app.pin")}
              aria-label={config?.window?.pin ? t("app.unpin") : t("app.pin")}
            >
              <Icon name={config?.window?.pin ? "unpin" : "pin"} size={14} />
            </button>
          </div>
        </nav>

        <main
          id={`tabpanel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          className={`tab-content${panelDragOver ? " panel-drop-active" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setPanelDragOver(true); }}
          onDragLeave={() => setPanelDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setPanelDragOver(false);
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) {
              showToast(`${files.length} file(s) ready to attach`, "info");
            }
          }}
        >
          {renderTabContent()}
        </main>

        <StatusBar typeModeActive={typeModeActive} />

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
