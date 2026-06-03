import { useState } from "react";
import GeneralSettings from "./SettingsSections/GeneralSettings";
import VoiceSettings from "./SettingsSections/VoiceSettings";
import AiProviderSettings from "./SettingsSections/AiProviderSettings";
import ComputerUseSettings from "./SettingsSections/ComputerUseSettings";
import PermissionsSettings from "./SettingsSections/PermissionsSettings";
import SystemSettings from "./SettingsSections/SystemSettings";

type SettingsTabId = "general" | "voice" | "providers" | "computer_use" | "permissions" | "agents" | "automations" | "system";

const SETTINGS_TABS: { id: SettingsTabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "voice", label: "Voice" },
  { id: "providers", label: "AI Providers" },
  { id: "computer_use", label: "Computer Use" },
  { id: "permissions", label: "Permissions" },
  { id: "agents", label: "Agents" },
  { id: "automations", label: "Automations" },
  { id: "system", label: "System & Logs" },
];

function SettingsTab() {
  const [activeSection, setActiveSection] = useState<SettingsTabId>("general");

  return (
    <div className="settings-tab">
      <h2>Settings</h2>
      <nav className="settings-nav">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`settings-nav-btn ${activeSection === tab.id ? "active" : ""}`}
            onClick={() => setActiveSection(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="settings-content">
        {activeSection === "general" && <GeneralSettings />}
        {activeSection === "voice" && <VoiceSettings />}
        {activeSection === "providers" && <AiProviderSettings />}
        {activeSection === "computer_use" && <ComputerUseSettings />}
        {activeSection === "permissions" && <PermissionsSettings />}
        {activeSection === "agents" && (
          <section className="settings-section">
            <h3>Agents</h3>
            <p className="settings-placeholder">Agent configuration is managed through the Agents tab.</p>
          </section>
        )}
        {activeSection === "automations" && (
          <section className="settings-section">
            <h3>Automations</h3>
            <p className="settings-placeholder">Automation CRUD coming soon.</p>
          </section>
        )}
        {activeSection === "system" && <SystemSettings />}
      </div>
    </div>
  );
}

export default SettingsTab;
