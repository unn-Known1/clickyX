import { useState, useCallback } from "react";
import { commands } from "../../bindings";
import type { AppConfig } from "../../bindings";
import { THEME_VARIANTS, getStoredVariant, setStoredVariant, applyTheme } from "../../utils/theme";

interface Props {
  config: AppConfig;
  // Cache sync ONLY — the caller never re-invokes. Each handler below
  // performs exactly one backend write (P1/H-3 single-write path).
  onConfigUpdate: (updated: AppConfig) => void;
}

export function AppearanceSettings({ config, onConfigUpdate }: Props) {
  // Color variant persists in localStorage (presentation-only; the backend
  // `theme` owns light/dark/system). Initialized from storage so the select
  // survives remounts; App.tsx's sync effect respects the stored variant.
  const [themeVariant, setThemeVariant] = useState<string>(() => getStoredVariant());

  const updateTheme = useCallback(async (theme: string) => {
    try {
      const updated = await commands.updateConfig({ theme });
      onConfigUpdate(updated);
      applyTheme(theme);
    } catch (e) {
      console.error("Failed to update theme:", e);
    }
  }, [onConfigUpdate]);

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
    setStoredVariant(variant);
    applyTheme(config.theme);
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
