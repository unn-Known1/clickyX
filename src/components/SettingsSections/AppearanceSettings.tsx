import { useState, useCallback } from "react";
import { commands } from "../../bindings";
import type { AppConfig } from "../../bindings";

const THEME_VARIANTS = [
  { value: "", label: "Default" },
  { value: "sunset", label: "Sunset" },
  { value: "forest", label: "Forest" },
  { value: "ocean", label: "Ocean" },
  { value: "lavender", label: "Lavender" },
  { value: "rose", label: "Rose" },
  { value: "amber", label: "Amber" },
];

interface Props {
  config: AppConfig;
  // Cache sync ONLY — the caller never re-invokes. Each handler below
  // performs exactly one backend write (P1/H-3 single-write path).
  onConfigUpdate: (updated: AppConfig) => void;
}

export function AppearanceSettings({ config, onConfigUpdate }: Props) {
  // Track selected color variant separately from base light/dark theme
  const [themeVariant, setThemeVariant] = useState<string>("");

  const updateTheme = useCallback(async (theme: string) => {
    try {
      const updated = await commands.updateConfig({ theme });
      onConfigUpdate(updated);
      // Apply base theme only when no color variant is active
      if (!themeVariant) {
        const effective = theme === "system"
          ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
          : theme;
        document.documentElement.setAttribute("data-theme", effective);
      }
    } catch (e) {
      console.error("Failed to update theme:", e);
    }
  }, [onConfigUpdate, themeVariant]);

  const setAccent = useCallback(async (color: string) => {
    try {
      // set_accent_preset persists server-side and emits accent-changed —
      // sync the cache locally, do NOT call update_config again (P1/H-3).
      await commands.setAccentPreset(color);
      onConfigUpdate({ ...config, overlay: { ...config.overlay, cursor_accent: color } });
    } catch (e) {
      console.error("Failed to set accent:", e);
    }
  }, [config, onConfigUpdate]);

  const applyThemeVariant = (variant: string) => {
    setThemeVariant(variant);
    if (variant) {
      // Apply the color variant as the data-theme attribute
      document.documentElement.setAttribute("data-theme", variant);
    } else {
      // Restore the base theme
      const base = config.theme === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : config.theme;
      document.documentElement.setAttribute("data-theme", base);
    }
  };

  const presets = config.overlay.accent_presets ?? [];

  return (
    <section className="settings-section elevated-card">
      <h3>Appearance</h3>

      <div className="setting-row">
        <label>Base Theme</label>
        <select
          className="setting-select"
          value={config.theme}
          onChange={(e) => updateTheme(e.target.value)}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      <div className="setting-row">
        <label>Color Variant</label>
        <select
          className="setting-select"
          value={themeVariant}
          onChange={(e) => applyThemeVariant(e.target.value)}
        >
          {THEME_VARIANTS.map((v) => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
      </div>

      <div className="setting-row">
        <label>Accent Color</label>
        <div className="accent-presets">
          {presets.map((c) => (
            <button
              key={c}
              type="button"
              className={`accent-swatch ${config.overlay.cursor_accent === c ? "active" : ""}`}
              style={{ backgroundColor: c }}
              onClick={() => setAccent(c)}
              title={c}
              aria-label={`Accent ${c}`}
            />
          ))}
          <input
            type="color"
            className="color-picker"
            value={config.overlay.cursor_accent}
            onChange={(e) => setAccent(e.target.value)}
            title="Custom accent"
          />
        </div>
      </div>
    </section>
  );
}
