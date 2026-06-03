# Tauri Commands: Voice Pipeline

## `start_recording`

Begin audio capture from the default input device.

**Returns**: `Result<(), String>`

**Errors**:
- "No input device available" — no microphone found.
- "Already recording" — capture already in progress.

## `stop_recording`

Stop audio capture and return recorded PCM data.

**Returns**: `Result<Vec<f32>, String>` — PCM f32 samples.

**Errors**:
- "Not recording" — no active capture session.

## `get_audio_level`

Get current VU meter level (RMS power).

**Returns**: `Result<AudioLevel, String>`
- `rms`: f32 (0.0–1.0)
- `peak`: f32 (0.0–1.0)
- `clipping`: bool

**Errors**:
- "Not recording" — no active capture session.

## `transcribe_audio`

Send PCM audio data to the configured STT provider.

**Args**:
- `audio_data: Vec<f32>` — PCM f32 samples.
- `provider: Option<String>` — override provider name (None = use config).

**Returns**: `Result<String, String>` — transcribed text.

**Errors**:
- "No API key for provider" — key not found in config.
- HTTP errors from provider.

## `speak_text`

Send text to the configured TTS provider and return audio.

**Args**:
- `text: String` — text to synthesize.
- `provider: Option<String>` — override provider name (None = use config).

**Returns**: `Result<Vec<u8>, String>` — WAV audio bytes.

**Errors**:
- "No API key for provider" — key not found in config.
- HTTP errors from provider.

## `set_ptt_hotkey`

Change the PTT hotkey binding.

**Args**:
- `hotkey: String` — key combo (e.g. "Ctrl+Shift+V").

**Returns**: `Result<(), String>`

## `get_audio_config`

Get current audio configuration.

**Returns**: `Result<AudioConfig, String>`

## `update_audio_config`

Update audio settings.

**Args**:
- `partial: serde_json::Value` — partial update payload.

**Returns**: `Result<AudioConfig, String>`
