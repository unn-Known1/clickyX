import { useState, useCallback, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import HomeTab from "./components/HomeTab";
import SettingsTab from "./components/SettingsTab";
import "./styles/theme.css";

type Tab = "home" | "agents" | "connections" | "settings";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [animState, setAnimState] = useState<"enter" | "exit" | "">("enter");

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

  // Expose setter for tray menu integration
  (window as unknown as Record<string, unknown>).__setActiveTab = useCallback(
    (tab: string) => setActiveTab(tab as Tab),
    [],
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "agents", label: "Agents" },
    { id: "connections", label: "Connections" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className={`app-container${animState ? ` panel-${animState}` : ""}`}>
      <nav className="tab-bar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="tab-content">
        {activeTab === "home" && <HomeTab />}
        {activeTab === "agents" && (
          <div className="placeholder-tab">
            <h2>Agents</h2>
            <p>Agent management coming in Phase 4.</p>
          </div>
        )}
        {activeTab === "connections" && (
          <div className="placeholder-tab">
            <h2>Connections</h2>
            <p>Integration connections coming in Phase 6.</p>
          </div>
        )}
        {activeTab === "settings" && <SettingsTab />}
      </main>
    </div>
  );
}

export default App;
