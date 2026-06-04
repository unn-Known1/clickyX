import { useState, useEffect, useCallback } from "react";
import { invoke } from "../../bindings";
import VoiceDiscovery from "../VoiceDiscovery";
import { HotkeyInput } from "../HotkeyInput";

interface AudioConfig {
  ptt_hotkey: string;
  stt_provider: string;
  tts_provider: string;
  activation_mode: string;
  auto_submit: boolean;
  volume: number;
  selected_voice_id: string;
}

// F-013: PTT preset shortcuts
const PTT_PRESETS = [
  { label: "Shift + Fn", value: "shift+fn" },
  { label: "Ctrl + Space", value: "ctrl+space" },
  { label: "Ctrl + Alt", value: "ctrl+alt" },
  { label: "Shift + Ctrl", value: "shift+ctrl" },
  { label: "Custom", value: "custom" },
];

function PttShortcutSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (hotkey: string) => void;
}) {
  // Determine if the current value matches a preset
  const matchedPreset = PTT_PRESETS.find((p) => p.value !== "custom" && p.value === value);
  const [selectedPreset, setSelectedPreset] = useState<string>(
    matchedPreset ? matchedPreset.value : "custom",
  );

  // Sync when external value changes
  useEffect(() => {
    const matched = PTT_PRESETS.find((p) => p.value !== "custom" && p.value === value);
    setSelectedPreset(matched ? matched.value : "custom");
  }, [value]);

  const handlePresetClick = (preset: typeof PTT_PRESETS[number]) => {
    setSelectedPreset(preset.value);
    if (preset.value !== "custom") {
      onChange(preset.value);
    }
    // If custom is selected, wait for HotkeyInput
  };

  return (
    <div className="ptt-shortcut-selector">
      <div className="ptt-preset-chips" role="radiogroup" aria-label="PTT shortcut presets">
        {PTT_PRESETS.map((preset) => (
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
        <div className="ptt-custom-input" style={{ marginTop: 8 }}>
          <HotkeyInput
            value={value}
            onChange={onChange}
          />
        </div>
      )}

      {selectedPreset !== "custom" && (
        <div className="ptt-current-display">
          Active: <code>{value || "none"}</code>
        </div>
      )}
    </div>
  );
}

function VoiceSettings() {
  const [audioConfig, setAudioConfig] = useState<AudioConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    invoke<AudioConfig>("get_audio_config")
      .then(setAudioConfig)
      .catch((e) => {
        console.error("Failed to load audio config:", e);
        setError("Failed to load voice settings");
      });
  }, []);

  const updateAudio = useCallback(async (key: string, value: unknown) => {
    if (!audioConfig) return;
    try {
      const updated = await invoke<AudioConfig>("update_audio_config", {
        partial: { [key]: value },
      });
      setAudioConfig(updated);
    } catch (e) {
      console.error("Failed to update audio config:", e);
    }
  }, [audioConfig]);

  if (error) {
    return (
      <section className="settings-section">
        <h3>Voice</h3>
        <div className="settings-error">{error}</div>
      </section>
    );
  }

  if (!audioConfig) {
    return (
      <section className="settings-section">
        <h3>Voice</h3>
        <div className="skeleton-loader" />
      </section>
    );
  }

  return (
    <section className="settings-section">
      <h3>Voice</h3>
      <div className="setting-row">
        <label>STT Provider</label>
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
        <label>TTS Provider</label>
        <select
          className="setting-select"
          value={audioConfig.tts_provider}
          onChange={(e) => updateAudio("tts_provider", e.target.value)}
        >
          <option value="elevenlabs">ElevenLabs</option>
          <option value="cartesia">Cartesia</option>
          <option value="openai">OpenAI TTS</option>
        </select>
      </div>
      <div className="setting-row">
        <label>Activation Mode</label>
        <select
          className="setting-select"
          value={audioConfig.activation_mode}
          onChange={(e) => updateAudio("activation_mode", e.target.value)}
        >
          <option value="ptt">Push to Talk</option>
          <option value="voice">Voice Activation</option>
          <option value="always_on">Always-On (Hands-Free)</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>
      <div className="setting-row">
        <label>Volume</label>
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
        <label>PTT Shortcut</label>
        <PttShortcutSelector
          value={audioConfig.ptt_hotkey}
          onChange={(hotkey) => updateAudio("ptt_hotkey", hotkey)}
        />
      </div>

      <div className="setting-row">
        <label>Auto-submit on silence</label>
        <input
          type="checkbox"
          checked={audioConfig.auto_submit}
          onChange={(e) => updateAudio("auto_submit", e.target.checked)}
        />
      </div>

      <h3 className="settings-subhead">Voice Discovery</h3>
      <p className="settings-hint">
        Drag the orbit to preview voices. Each voice has a unique accent color that
        will be applied to the overlay when selected.
      </p>
      <VoiceDiscovery
        audioConfig={audioConfig}
        onSelected={() => {
          invoke<AudioConfig>("get_audio_config").then(setAudioConfig).catch(() => {});
        }}
      />
    </section>
  );
}

export default VoiceSettings;
