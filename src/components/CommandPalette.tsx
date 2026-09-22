import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Tab } from "../context/AppContext";
import { useAppContext } from "../context/AppContext";
import { Icon } from "./Icon";
import { getPaletteItems, searchPalette, type PaletteItem } from "./paletteRegistry";

interface Props {
  onClose: () => void;
  onNavigate: (tab: Tab) => void;
}

/** Case-insensitive substring highlighting for search results */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="palette-match">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export default function CommandPalette({ onClose, onNavigate }: Props) {
  const { t } = useTranslation();
  const { requestSection } = useAppContext();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Builtins close over onNavigate; registry extras (registered by feature
  // modules via registerPaletteItems) are merged in — deduped by id with
  // builtins winning.
  const items: PaletteItem[] = useMemo(() => {
    const section = (id: string) => {
      requestSection(id);
      onNavigate("settings");
    };
    const builtins: PaletteItem[] = [
      { id: "nav-home",        label: t("palette.navHome"),        description: t("palette.navHomeDesc"),        icon: "home",        keywords: ["home", "ask", "chat"], action: () => onNavigate("home"),        category: t("palette.navNavigation") },
      { id: "nav-agents",      label: t("palette.navAgents"),      description: t("palette.navAgentsDesc"),      icon: "agents",      keywords: ["agents", "background"], action: () => onNavigate("agents"),      category: t("palette.navNavigation") },
      { id: "nav-settings",    label: t("palette.navSettings"),    description: t("palette.navSettingsDesc"),    icon: "settings",    keywords: ["settings", "preferences"], action: () => onNavigate("settings"),    category: t("palette.navNavigation") },
      { id: "nav-connections", label: t("palette.navConnections"), description: t("palette.navConnectionsDesc"), icon: "connections", keywords: ["connections", "mcp", "integrations", "automations"], action: () => section("connections"), category: t("palette.navNavigation") },
      { id: "nav-settings-voice",    label: t("settings.sections.voice"),      description: `${t("palette.navSettingsSection")} › ${t("settings.sections.voice")}`,      icon: "microphone", keywords: ["voice", "audio", "microphone", "stt", "tts"], action: () => section("voice"),        category: t("palette.navSettingsSection") },
      { id: "nav-settings-ai",       label: t("settings.sections.providers"),  description: `${t("palette.navSettingsSection")} › ${t("settings.sections.providers")}`,  icon: "ai",         keywords: ["ai", "providers", "models", "keys"], action: () => section("providers"),    category: t("palette.navSettingsSection") },
      { id: "nav-settings-general",  label: t("settings.sections.general"),    description: `${t("palette.navSettingsSection")} › ${t("settings.sections.general")}`,    icon: "settings",   keywords: ["general", "theme", "startup"], action: () => section("general"),     category: t("palette.navSettingsSection") },
      { id: "nav-settings-computer", label: t("settings.sections.computerUse"), description: `${t("palette.navSettingsSection")} › ${t("settings.sections.computerUse")}`, icon: "cursor",     keywords: ["computer", "cua", "click", "automation"], action: () => section("computer_use"), category: t("palette.navSettingsSection") },
      { id: "nav-settings-conn",     label: t("settings.sections.connections"), description: `${t("palette.navSettingsSection")} › ${t("settings.sections.connections")}`, icon: "connections", keywords: ["connections", "mcp", "servers"], action: () => section("connections"), category: t("palette.navSettingsSection") },
      { id: "nav-settings-perm",     label: t("settings.sections.permissions"), description: `${t("palette.navSettingsSection")} › ${t("settings.sections.permissions")}`, icon: "shield",     keywords: ["permissions", "privacy", "tcc"], action: () => section("permissions"), category: t("palette.navSettingsSection") },
      { id: "nav-settings-system",   label: t("settings.sections.system"),      description: `${t("palette.navSettingsSection")} › ${t("settings.sections.system")}`,      icon: "info",       keywords: ["system", "logs", "updates", "about"], action: () => section("system"),      category: t("palette.navSettingsSection") },
      { id: "nav-settings-models",   label: t("palette.models3d"),         description: `${t("palette.navSettingsSection")} › ${t("palette.models3d")}`,      icon: "cube",       keywords: ["3d", "models", "gen3d"], action: () => section("3d_models"),   category: t("palette.navSettingsSection") },
      { id: "new-agent", label: t("palette.newAgent"), description: t("palette.newAgentDesc"), icon: "plus", keywords: ["new", "create", "agent"], action: () => onNavigate("agents"), category: t("palette.navActions") },
    ];
    const seen = new Set(builtins.map((b) => b.id));
    const extras = getPaletteItems().filter((e) => !seen.has(e.id));
    return [...builtins, ...extras];
  }, [onNavigate, requestSection, t]);

  const filtered = useMemo(() => searchPalette(query, items), [query, items]);

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, filtered.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
      if (e.key === "Enter" && filtered[selected]) { filtered[selected].action(); onClose(); }
    },
    [filtered, selected, onClose],
  );

  // Reset selection when query changes
  useEffect(() => { setSelected(0); }, [query]);

  // Group by category
  const categories = Array.from(new Set(filtered.map((i) => i.category)));

  return (
    <div className="palette-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="palette-box" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-wrap">
          <Icon name="search" size={15} className="palette-search-icon" />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder={t("palette.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-autocomplete="list"
            aria-controls="palette-list"
          />
          <kbd className="palette-esc-hint">Esc</kbd>
        </div>

        <div className="palette-list" id="palette-list" role="listbox">
          {filtered.length === 0 ? (
            <div className="palette-empty">{t("palette.noResults")} "{query}"</div>
          ) : (
            categories.map((cat) => (
              <div key={cat}>
                <div className="palette-category">{cat}</div>
                {filtered
                  .filter((i) => i.category === cat)
                  .map((item, _idx) => {
                    const globalIdx = filtered.indexOf(item);
                    return (
                      <div
                        key={item.id}
                        className={`palette-item ${globalIdx === selected ? "palette-item-selected" : ""}`}
                        role="option"
                        aria-selected={globalIdx === selected}
                        onClick={() => { item.action(); onClose(); }}
                        onMouseEnter={() => setSelected(globalIdx)}
                      >
                        <span className="palette-item-icon">
                          <Icon name={item.icon} size={15} />
                        </span>
                        <span className="palette-item-text">
                          <span className="palette-item-label"><Highlight text={item.label} query={query} /></span>
                          <span className="palette-item-desc"><Highlight text={item.description} query={query} /></span>
                        </span>
                      </div>
                    );
                  })}
              </div>
            ))
          )}
        </div>

        <div className="palette-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
