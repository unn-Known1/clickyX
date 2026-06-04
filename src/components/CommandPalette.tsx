import { useState, useEffect, useRef, useCallback } from "react";
import type { Tab } from "../context/AppContext";

interface Props {
  onClose: () => void;
  onNavigate: (tab: Tab) => void;
}

interface PaletteItem {
  id: string;
  label: string;
  description: string;
  action: () => void;
  category: string;
}

export default function CommandPalette({ onClose, onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items: PaletteItem[] = [
    { id: "nav-home",        label: "Go to Home",        description: "Open the Home tab",        action: () => onNavigate("home"),        category: "Navigation" },
    { id: "nav-agents",      label: "Go to Agents",      description: "Open the Agents tab",      action: () => onNavigate("agents"),      category: "Navigation" },
    { id: "nav-connections", label: "Go to Connections", description: "Open the Connections tab", action: () => onNavigate("connections"), category: "Navigation" },
    { id: "nav-settings",    label: "Go to Settings",    description: "Open the Settings tab",    action: () => onNavigate("settings"),    category: "Navigation" },
    { id: "nav-settings-voice",    label: "Voice Settings",    description: "Settings › Voice",          action: () => { onNavigate("settings"); window.__paletteSection?.("voice"); },        category: "Settings" },
    { id: "nav-settings-ai",       label: "AI Providers",      description: "Settings › AI Providers",   action: () => { onNavigate("settings"); window.__paletteSection?.("providers"); },    category: "Settings" },
    { id: "nav-settings-general",  label: "General Settings",  description: "Settings › General",        action: () => { onNavigate("settings"); window.__paletteSection?.("general"); },     category: "Settings" },
    { id: "nav-settings-system",   label: "System & Logs",     description: "Settings › System & Logs", action: () => { onNavigate("settings"); window.__paletteSection?.("system"); },      category: "Settings" },
    { id: "nav-settings-perm",     label: "Permissions",       description: "Settings › Permissions",   action: () => { onNavigate("settings"); window.__paletteSection?.("permissions"); }, category: "Settings" },
    { id: "new-agent", label: "New Agent", description: "Create a new agent in the Agents tab", action: () => onNavigate("agents"), category: "Actions" },
  ];

  const filtered = query.trim()
    ? items.filter(
        (it) =>
          it.label.toLowerCase().includes(query.toLowerCase()) ||
          it.description.toLowerCase().includes(query.toLowerCase()) ||
          it.category.toLowerCase().includes(query.toLowerCase()),
      )
    : items;

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
          <svg className="palette-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Search commands…"
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
            <div className="palette-empty">No results for "{query}"</div>
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
                        <span className="palette-item-label">{item.label}</span>
                        <span className="palette-item-desc">{item.description}</span>
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
