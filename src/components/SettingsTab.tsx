import { useState, useEffect, useRef, lazy, Suspense } from "react";
import GeneralSettings from "./SettingsSections/GeneralSettings";
import VoiceSettings from "./SettingsSections/VoiceSettings";
import AiProviderSettings from "./SettingsSections/AiProviderSettings";
import ComputerUseSettings from "./SettingsSections/ComputerUseSettings";
import PermissionsSettings from "./SettingsSections/PermissionsSettings";
import SystemSettings from "./SettingsSections/SystemSettings";

const ModelGeneratorTab = lazy(() => import("./ModelGeneratorTab"));

type SettingsTabId =
  | "general" | "voice" | "providers" | "computer_use"
  | "permissions" | "agents" | "automations" | "system" | "3d_models";

const SETTINGS_TABS: { id: SettingsTabId; label: string }[] = [
  { id: "general",      label: "General" },
  { id: "voice",        label: "Voice" },
  { id: "providers",    label: "AI Providers" },
  { id: "computer_use", label: "Computer Use" },
  { id: "permissions",  label: "Permissions" },
  { id: "agents",       label: "Agents" },
  { id: "automations",  label: "Automations" },
  { id: "3d_models",    label: "3D Models" },
  { id: "system",       label: "System & Logs" },
];

interface Props {
  onOpenAbout?: () => void;
}

function SettingsTab({ onOpenAbout }: Props) {
  const [activeSection, setActiveSection] = useState<SettingsTabId>("general");
  const contentRef = useRef<HTMLDivElement>(null);
  // Scroll memory: save scroll position per section
  const scrollMemory = useRef<Record<string, number>>({});

  // Expose section setter for CommandPalette deep-links
  useEffect(() => {
    window.__paletteSection = (section: string) => {
      if (SETTINGS_TABS.some((t) => t.id === section)) {
        setActiveSection(section as SettingsTabId);
      }
    };
    return () => { window.__paletteSection = undefined; };
  }, []);

  // Save scroll when leaving a section
  const handleSectionChange = (next: SettingsTabId) => {
    if (contentRef.current) {
      scrollMemory.current[activeSection] = contentRef.current.scrollTop;
    }
    setActiveSection(next);
  };

  // Restore scroll when entering a section
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = scrollMemory.current[activeSection] ?? 0;
    }
  }, [activeSection]);

  return (
    <div className="settings-tab">
      <h2>Settings</h2>
      <nav className="settings-nav" role="tablist" aria-label="Settings sections">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeSection === tab.id}
            className={`settings-nav-btn ${activeSection === tab.id ? "active" : ""}`}
            onClick={() => handleSectionChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="settings-content" ref={contentRef}>
        {activeSection === "general"      && <GeneralSettings />}
        {activeSection === "voice"        && <VoiceSettings />}
        {activeSection === "providers"    && <AiProviderSettings />}
        {activeSection === "computer_use" && <ComputerUseSettings />}
        {activeSection === "permissions"  && <PermissionsSettings />}
        {activeSection === "agents"       && (
          <section className="settings-section">
            <h3>Agents</h3>
            <p className="settings-placeholder">Agent configuration is managed in the Agents tab.</p>
          </section>
        )}
        {activeSection === "automations"  && (
          <section className="settings-section">
            <h3>Automations</h3>
            <p className="settings-placeholder">Automation CRUD is available in the Connections tab.</p>
          </section>
        )}
        {activeSection === "3d_models" && (
          <Suspense fallback={<div className="skeleton-loader" />}>
            <ModelGeneratorTab />
          </Suspense>
        )}
        {activeSection === "system"       && <SystemSettings onOpenAbout={onOpenAbout} />}
      </div>
    </div>
  );
}

export default SettingsTab;
