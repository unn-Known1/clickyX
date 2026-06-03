# Feature Specification: Voice Pipeline

## Overview

The voice pipeline subsystem provides end-to-end voice interaction — audio
capture from the system microphone, speech-to-text (STT) transcription using
cloud AI providers, text-to-speech (TTS) synthesis back to audio, and a VU
meter for real-time audio level visualization. The pipeline operates in
push-to-talk (PTT) mode by default, with toggle and always-on modes planned.

**Driven by**: Phase 2 of `docs/FEATURE_SPEC.md` (Voice Pipeline).

---

## User Scenarios

### US1: User records audio via push-to-talk

A user holds a configurable hotkey, speaks into their microphone, and releases
the key. The captured audio is transcribed to text and submitted to the active
agent.

**Acceptance criteria**:
- Holding the PTT hotkey begins audio capture immediately.
- Releasing the hotkey stops capture and begins transcription.
- Audio data is buffered in a 360-sample ring buffer.
- VU meter updates at 30ms intervals during capture.

### US2: User configures STT provider

A user selects between Deepgram, OpenAI Whisper, or AssemblyAI for speech
recognition. The API key is stored in the app config.

**Acceptance criteria**:
- Three STT providers are available: Deepgram, OpenAI Whisper, AssemblyAI.
- Each provider requires an API key stored in config.
- Provider selection persists across app restarts.
- Transcription errors are surfaced to the user.

### US3: User configures TTS provider

A user selects between ElevenLabs, Cartesia, Microsoft Edge TTS (free),
Deepgram Aura, or OpenAI Realtime for speech synthesis.

**Acceptance criteria**:
- Five TTS providers are available.
- Each provider (except Microsoft Edge) requires an API key.
- TTS audio is returned as PCM/WAV bytes.
- Sentence-pipelined streaming reduces latency.

### US4: Voice settings are configurable

A user can configure PTT hotkey, activation mode, auto-submit, sample rate,
buffer size, and volume from the Settings panel.

**Acceptance criteria**:
- All voice settings are shown in a Voice Settings section.
- PTT hotkey can be configured with a key binding input.
- Volume slider adjusts output volume (0.0–1.0).
- VU meter animates during audio capture.

### US5: External tools control voice via bridge API

An external tool sends text to be spoken via `POST /speak` or transcribes
audio via `POST /transcribe`.

**Acceptance criteria**:
- `POST /speak` accepts `{ "text": "...", "provider": "elevenlabs" }`.
- `POST /transcribe` accepts raw audio in the request body.
- `GET /audio/level` returns current VU meter level.

---

## Non-Goals

- Voice activity detection (VAD) — defer to Phase 5.
- Wake word detection — defer to Phase 5.
- Local/offline STT/TTS — cloud providers only for now.
- Audio playback device enumeration — use system default.
- Audio file format conversion — WAV/PCM only.
