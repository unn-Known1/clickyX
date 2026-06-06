import { useState, useEffect, useRef, lazy, Suspense } from "react";
import GeneralSettings from "./SettingsSections/GeneralSettings";
import VoiceSettings from "./SettingsSections/VoiceSettings";
import AiProviderSettings from "./SettingsSections/AiProviderSettings";
import ComputerUseSettings from "./SettingsSections/ComputerUseSettings";
import PermissionsSettings from "./SettingsSections/PermissionsSettings";
import SystemSettings from "./SettingsSections/SystemSettings";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

const ModelGeneratorTab = lazy(() => import("./ModelGeneratorTab"));

type SettingsTabId =
  | "general" | "voice" | "providers" | "computer_use"
  | "permissions" | "agents" | "automations" | "system" | "3d_models";

interface NavItem {
  id: SettingsTabId;
  label: string;
  icon: IconName;
}

const SETTINGS_TABS: NavItem[] = [
  { id: "general",      label: "General",       icon: "settings" },
  { id: "providers",    label: "AI Providers",  icon: "ai" },
  { id: "voice",        label: "Voice & Audio", icon: "microphone" },
  { id: "computer_use", label: "Computer Use",  icon: "cursor" },
  { id: "permissions",  label: "Permissions",   icon: "shield" },
  { id: "system",       label: "System",        icon: "info" },
  { id: "3d_models",    label: "3D Models",     icon: "cube" },
  { id: "agents",       label: "Agents",        icon: "agents" },
  { id: "automations",  label: "Automations",   icon: "bolt" },
];

interface NavGroup {
  label: string;
  items: SettingsTabId[];
}

const NAV_GROUPS: NavGroup[] = [
  { label: "Appearance",  items: ["general"] },
  { label: "AI & Voice",  items: ["providers", "voice"] },
  { label: "Automation",  items: ["computer_use", "agents", "automations"] },
  { label: "System",      items: ["permissions", "system", "3d_models"] },
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

  const tabById = (id: SettingsTabId) => SETTINGS_TABS.find((t) => t.id === id)!;

  return (
    <div className="settings-layout glass-panel">
      <aside className="settings-sidebar">
        <h2 className="settings-header">Settings</h2>
        <nav className="settings-nav" role="tablist" aria-label="Settings sections">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="settings-nav-group">
              <span className="settings-nav-group-label">{group.label}</span>
              {group.items.map((id) => {
                const tab = tabById(id);
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={activeSection === tab.id}
                    className={`settings-nav-btn ${activeSection === tab.id ? "active" : ""}`}
                    onClick={() => handleSectionChange(tab.id)}
                  >
                    <span className="settings-nav-btn-icon">
                      <Icon name={tab.icon} size={16} />
                    </span>
                    <span className="settings-nav-btn-label">{tab.label}</span>
                    {activeSection === tab.id && <div className="settings-nav-active-indicator" />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <main className="settings-main-area" ref={contentRef}>
        <div className="settings-content-wrapper fade-in-up">
          {activeSection === "general"      && <GeneralSettings />}
          {activeSection === "voice"        && <VoiceSettings />}
          {activeSection === "providers"    && <AiProviderSettings />}
          {activeSection === "computer_use" && <ComputerUseSettings />}
          {activeSection === "permissions"  && <PermissionsSettings />}
          {activeSection === "agents"       && (
            <section className="settings-section elevated-card">
              <h3>Agents</h3>
              <p className="settings-placeholder">Agent configuration is managed in the Agents tab.</p>
            </section>
          )}
          {activeSection === "automations"  && (
            <section className="settings-section elevated-card">
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
      </main>
    </div>
  );
}

export default SettingsTab;
