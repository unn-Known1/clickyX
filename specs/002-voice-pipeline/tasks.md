# Tasks: Voice Pipeline

## Phase 1: Spec & Research

### Goal

Create specification documents for the voice pipeline subsystem.

### Independent Test Criteria

- All spec files exist under `specs/002-voice-pipeline/`.
- Spec content matches FEATURE_SPEC.md Phase 2 coverage.
- Research validates crate choices for all 3 platforms.

### Implementation Tasks

- [x] T101 Create `specs/002-voice-pipeline/spec.md` — Feature specification
- [x] T102 Create `specs/002-voice-pipeline/plan.md` — Implementation plan with constitution checks
- [x] T103 Create `specs/002-voice-pipeline/research.md` — Technical research
- [x] T104 Create `specs/002-voice-pipeline/data-model.md` — Data entities
- [x] T105 Create `specs/002-voice-pipeline/contracts/tauri-commands.md` — Tauri command contracts
- [x] T106 Create `specs/002-voice-pipeline/contracts/bridge-api.md` — Bridge API contracts
- [x] T107 Create `specs/002-voice-pipeline/tasks.md` — Task list
- [x] T108 Create `specs/002-voice-pipeline/quickstart.md` — Setup guide

---

## Phase 2: Rust Dependencies

### Goal

Add audio/HTTP dependencies to Cargo.toml.

### Independent Test Criteria

- `cargo check` passes with new dependencies.
- All crates resolve for the current platform.

### Implementation Tasks

- [x] T109 Add `cpal`, `hound`, `reqwest`, `base64`, `uuid` to `Cargo.toml`

---

## Phase 3: Audio Capture

### Goal

Implement cpal-based audio capture with ring buffer and VU meter.

### Independent Test Criteria

- `AudioCapture` struct compiles and initializes.
- Start/stop recording works without panicking (even without mic).
- Ring buffer correctly wraps and reports RMS.

### Implementation Tasks

- [x] T110 Create `src-tauri/src/audio/mod.rs` with submodule declarations
- [x] T111 Implement `audio/capture.rs` — AudioCapture, RingBuffer, VU meter

---

## Phase 4: STT Providers

### Goal

Implement async HTTP STT for Deepgram, OpenAI Whisper, AssemblyAI.

### Independent Test Criteria

- `SttProvider` enum and `SttConfig` struct compile.
- `transcribe()` function runs without panicking (returns error without API key).
- Error handling covers HTTP errors, timeouts, missing keys.

### Implementation Tasks

- [x] T112 Implement `audio/stt.rs` — SttProvider, SttConfig, transcribe()

---

## Phase 5: TTS Providers

### Goal

Implement async HTTP TTS for ElevenLabs, Cartesia, Edge, Aura, Realtime.

### Independent Test Criteria

- `TtsProvider` enum and `TtsConfig` struct compile.
- `speak()` function returns audio bytes or meaningful error.
- Microsoft Edge TTS returns placeholder without API key.

### Implementation Tasks

- [x] T113 Implement `audio/tts.rs` — TtsProvider, TtsConfig, speak()

---

## Phase 6: Voice Pipeline

### Goal

Implement pipeline orchestrator with state machine.

### Independent Test Criteria

- `VoicePipeline` struct compiles with all methods.
- State transitions work correctly (Idle→Listening→Processing→Speaking).
- Pipeline properly sequences capture→STT.

### Implementation Tasks

- [x] T114 Implement `audio/pipeline.rs` — VoicePipeline, state machine

---

## Phase 7: Tauri Commands & Config

### Goal

Wire audio commands into Tauri and extend config.

### Independent Test Criteria

- `AudioConfig` added to `AppConfig` with Default impl.
- All 8 voice commands registered in `lib.rs`.
- Commands compile and respond to frontend invoke calls.

### Implementation Tasks

- [x] T115 Add `AudioConfig` to `config.rs` and `AppConfig.audio` field
- [x] T116 Implement voice commands in `commands.rs`
- [x] T117 Register audio module and commands in `lib.rs`
- [x] T118 Verify `cargo check` passes

---

## Phase 8: Bridge Endpoints

### Goal

Add voice endpoints to the HTTP bridge.

### Independent Test Criteria

- `POST /speak` returns audio or error JSON.
- `POST /transcribe` accepts audio and returns transcript JSON.
- `GET /audio/level` returns level JSON.

### Implementation Tasks

- [x] T119 Implement voice routes in `bridge.rs`
- [x] T120 Verify bridge compiles with new routes

---

## Phase 9: Frontend — VoiceSettings Component

### Goal

Create React voice settings UI with VU meter.

### Independent Test Criteria

- VoiceSettings renders in Settings tab.
- STP/TTS provider dropdowns populate correctly.
- VU meter animates during recording.
- PTT hotkey input accepts key combo strings.
- Volume slider adjusts 0.0–1.0.

### Implementation Tasks

- [x] T121 Create `src/components/VoiceSettings.tsx`
- [x] T122 Create `src/hooks/useVoice.ts`
- [x] T123 Integrate VoiceSettings into SettingsTab
- [x] T124 Add VU meter CSS to `theme.css`
- [x] T125 Verify `npm run build` passes
