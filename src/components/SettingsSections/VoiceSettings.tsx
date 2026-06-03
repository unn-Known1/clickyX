import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AudioConfig {
  ptt_hotkey: string;
  stt_provider: string;
  tts_provider: string;
  activation_mode: string;
  auto_submit: boolean;
  volume: number;
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
      <div className="setting-row">
        <label>PTT Hotkey</label>
        <input
          type="text"
          className="settings-input"
          style={{ width: 160 }}
          value={audioConfig.ptt_hotkey}
          onChange={(e) => updateAudio("ptt_hotkey", e.target.value)}
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
    </section>
  );
}

export default VoiceSettings;
