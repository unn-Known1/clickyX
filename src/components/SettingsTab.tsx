import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../context/AppContext";
import GeneralSettings from "./SettingsSections/GeneralSettings";
import VoiceSettings from "./SettingsSections/VoiceSettings";
import AiProviderSettings from "./SettingsSections/AiProviderSettings";
import ComputerUseSettings from "./SettingsSections/ComputerUseSettings";
import PermissionsSettings from "./SettingsSections/PermissionsSettings";
import SystemSettings from "./SettingsSections/SystemSettings";
import ConnectionsSettings from "./SettingsSections/ConnectionsSettings";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

const ModelGeneratorTab = lazy(() => import("./ModelGeneratorTab"));

type SettingsTabId =
  | "general" | "voice" | "providers" | "computer_use"
  | "permissions" | "system" | "3d_models" | "connections";

interface NavItem {
  id: SettingsTabId;
  label: string;
  icon: IconName;
}

const SETTINGS_TABS: NavItem[] = [
  { id: "general",      label: "settings.sections.general",      icon: "settings" },
  { id: "providers",    label: "settings.sections.providers",    icon: "ai" },
  { id: "voice",        label: "settings.sections.voice",        icon: "microphone" },
  { id: "computer_use", label: "settings.sections.computerUse",  icon: "cursor" },
  { id: "connections",  label: "settings.sections.connections",  icon: "connections" },
  { id: "permissions",  label: "settings.sections.permissions",  icon: "shield" },
  { id: "system",       label: "settings.sections.system",       icon: "info" },
  { id: "3d_models",    label: "palette.models3d",               icon: "cube" },
];

interface NavGroup {
  label: string;
  items: SettingsTabId[];
}

const NAV_GROUPS: NavGroup[] = [
  { label: "settings.groups.appearance",  items: ["general"] },
  { label: "settings.groups.aiVoice",  items: ["providers", "voice"] },
  { label: "settings.groups.automation",  items: ["computer_use", "connections"] },
  { label: "settings.groups.system",      items: ["permissions", "system", "3d_models"] },
];

interface Props {
  onOpenAbout?: () => void;
}

function SettingsTab({ onOpenAbout }: Props) {
  const { t } = useTranslation();
  const { pendingSection, consumeSection } = useAppContext();
  const [activeSection, setActiveSection] = useState<SettingsTabId>("general");
  const contentRef = useRef<HTMLDivElement>(null);
  // Scroll memory: save scroll position per section
  const scrollMemory = useRef<Record<string, number>>({});

  // Consume pending section from CommandPalette / deep-links (via AppContext)
  useEffect(() => {
    if (pendingSection && SETTINGS_TABS.some((tab) => tab.id === pendingSection)) {
      setActiveSection(pendingSection as SettingsTabId);
      consumeSection();
    }
  }, [pendingSection, consumeSection]);

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
        <h2 className="settings-header">{t("settings.title")}</h2>
        <nav className="settings-nav" role="tablist" aria-label="Settings sections">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="settings-nav-group">
              <span className="settings-nav-group-label">{t(group.label)}</span>
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
                    <span className="settings-nav-btn-label">{t(tab.label)}</span>
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
          {activeSection === "connections"  && <ConnectionsSettings />}
          {activeSection === "permissions"  && <PermissionsSettings />}
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
