import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";

import VoiceDiscovery from "../VoiceDiscovery";
import { HotkeyInput } from "../HotkeyInput";
import { useAudioConfig } from "../../hooks/useAudioConfig";

// F-013: PTT preset shortcuts (key labels are layout names; only "Custom" is localized at render)

function PttShortcutSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (hotkey: string) => void;
}) {
  const { t } = useTranslation();
  const presets = [
    { label: "Shift + Fn", value: "shift+fn" },
    { label: "Ctrl + Space", value: "ctrl+space" },
    { label: "Ctrl + Alt", value: "ctrl+alt" },
    { label: "Shift + Ctrl", value: "shift+ctrl" },
    { label: t("voice.custom"), value: "custom" },
  ];
  // Determine if the current value matches a preset
  const matchedPreset = presets.find((p) => p.value !== "custom" && p.value === value);
  const [selectedPreset, setSelectedPreset] = useState<string>(
    matchedPreset ? matchedPreset.value : "custom",
  );

  // Sync when external value changes
  useEffect(() => {
    const matched = presets.find((p) => p.value !== "custom" && p.value === value);
    setSelectedPreset(matched ? matched.value : "custom");
  }, [value]);

  const handlePresetClick = (preset: { label: string; value: string }) => {
    setSelectedPreset(preset.value);
    if (preset.value !== "custom") {
      onChange(preset.value);
    }
    // If custom is selected, wait for HotkeyInput
  };

  return (
    <div className="ptt-shortcut-selector">
      <div className="ptt-preset-chips" role="radiogroup" aria-label={t("voice.pttPresets")}>
        {presets.map((preset) => (
          <button
            key={preset.value}
            role="radio"
            aria-checked={selectedPreset === preset.value}
            className={`ptt-preset-chip${selectedPreset === preset.value ? " active" : ""}`}
            onClick={() => handlePresetClick(preset)}
            type="button"
          >
            {preset.label}
            {selectedPreset === preset.value && preset.value !== "custom" && (
              <span className="ptt-active-indicator" aria-hidden="true">✓</span>
            )}
          </button>
        ))}
      </div>

      {selectedPreset === "custom" && (
        <div className="ptt-custom-input ptt-custom-row">
          <HotkeyInput
            value={value}
            onChange={onChange}
          />
        </div>
      )}

      {selectedPreset !== "custom" && (
        <div className="ptt-current-display">
          {t("voice.active")}: <code>{value || t("voice.none")}</code>
        </div>
      )}
    </div>
  );
}

function VoiceSettings() {
  const { t } = useTranslation();
  const { config: audioConfig, updateConfig, loading, error } = useAudioConfig();

  const updateAudio = useCallback(async (key: string, value: unknown) => {
    if (!audioConfig) return;
    try {
      await updateConfig({ [key]: value });
    } catch (e) {
      console.error("Failed to update audio config:", e);
    }
  }, [audioConfig, updateConfig]);

  if (error) {
    return (
      <section className="settings-section elevated-card">
        <h3>{t("voice.title")}</h3>
        <div className="settings-error">{error}</div>
      </section>
    );
  }

  if (loading || !audioConfig) {
    return (
      <section className="settings-section elevated-card">
        <h3>{t("voice.title")}</h3>
        <div className="skeleton-loader" />
      </section>
    );
  }

  return (
    <section className="settings-section elevated-card">
      <h3>{t("voice.title")}</h3>
      <div className="setting-row">
        <label>{t("voice.sttProvider")}</label>
        <select
          className="setting-select"
          value={audioConfig.stt_provider}
          onChange={(e) => updateAudio("stt_provider", e.target.value)}
        >
          <option value="deepgram">Deepgram</option>
          <option value="whisper">Whisper</option>
          <option value="assemblyai">AssemblyAI</option>
        </select>
      </div>
      <div className="setting-row">
        <label>{t("voice.ttsProvider")}</label>
        <select
          className="setting-select"
          value={audioConfig.tts_provider}
          onChange={(e) => updateAudio("tts_provider", e.target.value)}
        >
          <option value="elevenlabs">ElevenLabs</option>
          <option value="cartesia">Cartesia</option>
          <option value="aura">Deepgram (Aura)</option>
          <option value="system">{t("voice.systemOffline")}</option>
        </select>
      </div>
      {audioConfig.tts_provider === "system" && (
        <div className="settings-hint voice-hint-tight">
          <strong>{t("voice.systemTtsTitle")}</strong> {t("voice.systemTtsBefore")}<code>speech-dispatcher</code>{t("voice.systemTtsAfter")}
        </div>
      )}
      <div className="setting-row">
        <label>{t("voice.activationMode")}</label>
        <select
          className="setting-select"
          value={audioConfig.activation_mode}
          onChange={(e) => updateAudio("activation_mode", e.target.value)}
        >
          <option value="ptt">{t("voice.modePtt")}</option>
          <option value="voice">{t("voice.modeVoice")}</option>
          <option value="always_on">{t("voice.modeAlways")}</option>
          <option value="disabled">{t("voice.modeDisabled")}</option>
        </select>
      </div>
      <div className="setting-row">
        <label>{t("voice.volume")}</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={audioConfig.volume}
          onChange={(e) => updateAudio("volume", parseFloat(e.target.value))}
        />
        <span className="setting-value">{Math.round(audioConfig.volume * 100)}%</span>
      </div>

      {/* F-013: Multi-shortcut PTT selector */}
      <div className="setting-row setting-row-col">
        <label>{t("voice.pttShortcut")}</label>
        <PttShortcutSelector
          value={audioConfig.ptt_hotkey}
          onChange={(hotkey) => updateAudio("ptt_hotkey", hotkey)}
        />
      </div>

      <div className="setting-row">
        <label>{t("voice.autoSubmit")}</label>
        <input
          type="checkbox"
          checked={audioConfig.auto_submit}
          onChange={(e) => updateAudio("auto_submit", e.target.checked)}
        />
      </div>

      <h3 className="settings-subhead">{t("voice.discovery")}</h3>
      <p className="settings-hint">
        {t("voice.discoveryHint")}
      </p>
      <VoiceDiscovery
        audioConfig={audioConfig}
      />
    </section>
  );
}

export default VoiceSettings;
