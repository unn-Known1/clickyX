# Implementation Plan: Voice Pipeline

## Technical Context

### Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Audio capture | `cpal` (Rust) | Cross-platform audio I/O; Windows/Linux/macOS |
| Ring buffer | Custom `Vec<f32>` | Lightweight, no external dependency needed |
| VU meter | RMS over sliding window | Standard audio level metering |
| STT HTTP | `reqwest` (Rust) | Async HTTP with JSON + streaming support |
| TTS HTTP | `reqwest` (Rust) | Same client, fewer dependencies |
| TTS free | Microsoft Edge (no-key) | Zero-config option for all users |
| Config | `serde` + JSON | Extends existing `AppConfig` with `AudioConfig` |
| Commands | Tauri `#[command]` | Follows Phase 1 command pattern |
| Bridge | actix-web routes | Follows Phase 1 bridge pattern |
| Frontend | React + TypeScript | VoiceSettings component + useVoice hook |

### Crate Choices & Justification

- **cpal 0.15** — De facto standard for cross-platform audio capture in Rust.
  Supports Windows (WASAPI), macOS (CoreAudio), Linux (ALSA/PulseAudio/JACK).
  Provides `Stream` API for low-latency capture callbacks.

- **reqwest 0.12** — Mature async HTTP client. Used for all STT/TTS provider
  REST calls. Features `json` for typed request/response and `stream` for
  audio chunking.

- **hound 3.5** — Simple WAV read/write. Used for encoding capture buffers to
  WAV format before sending to STT APIs. Lightweight, no system deps.

- **base64 0.22** — Standard Base64 encoding. Used for audio data embedding
  in JSON payloads for certain provider APIs.

- **uuid 1** — Session identifiers for transcription requests and audio chunk
  correlation.

### Key Architecture Decisions

1. **Ring buffer with 360-frame pre-buffer** — At 16kHz, 360 samples = 22.5ms.
   Sufficient for PTT capture with negligible latency. The buffer wraps
   continuously during recording and is frozen on stop.

2. **VU meter via RMS** — Compute root-mean-square of the last N samples every
   30ms. Normalize to 0.0–1.0 range. Frontend polls via `get_audio_level`
   command at ~30fps during recording.

3. **STT as async Tauri commands** — Frontend sends audio data, Rust fires
   the HTTP request on a tokio task, returns the transcript string. Errors
   propagate to the UI.

4. **TTS as async Tauri commands** — Frontend sends text, Rust calls the
   provider API, returns audio bytes. Playback handled on frontend or via
   future native audio output.

5. **Pipeline state machine** — `VoicePipeline` manages Capture → STT → AI → TTS
   as a state machine with states: `Idle`, `Listening`, `Processing`,
   `Speaking`. Currently wire up capture→STT; AI and TTS integration deferred
   to Phase 3+.

### Integration Points

- Commands ↔ Audio: `start_recording`, `stop_recording` control cpal stream.
- Commands ↔ STT: `transcribe_audio` accepts `Vec<f32>` PCM, returns `String`.
- Commands ↔ TTS: `speak_text` accepts `String`, returns `Vec<u8>` WAV.
- Pipeline ↔ Config: reads `AudioConfig` from `AppConfig`.
- Bridge ↔ TTS: `POST /speak` triggers TTS and returns audio.
- Bridge ↔ STT: `POST /transcribe` accepts audio, returns transcript.

### Platform-Specific Concerns

- **Linux**: cpAL uses ALSA by default. Requires `libasound2-dev` for
  compilation. PulseAudio/JACK backend auto-detected at runtime.
- **Windows**: cpAL uses WASAPI. No special build deps.
- **macOS**: cpAL uses CoreAudio. No special build deps.

---

## Constitution Checks

1. ✅ **Cross-platform first** — cpal works on all 3 targets; STT/TTS are HTTP
   APIs (no platform dependency).
2. ✅ **Feature parity** — Voice pipeline maps to OpenClicky features:
   microphone capture, dictation, voice settings, PTT hotkey.
3. ✅ **No macOS lock-in** — No Foundation, AppKit, or SwiftUI.
4. ✅ **Local-first** — API keys stored locally in config.json; no cloud sync.
5. ✅ **Bridge contract** — `/speak`, `/transcribe`, `/audio/level` follow
   existing bridge patterns.
6. ✅ **FEATURE_SPEC.md** — Phase 2 coverage matches `docs/FEATURE_SPEC.md`.
