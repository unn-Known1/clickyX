# Implementation Plan: Always-On Voice Mode

## Technical Context
- Stack: Rust + cpal + VAD (energy-based)
- Libraries: cpal (audio capture), tokio (async)
- Integration points: audio/pipeline.rs, audio/handoff.rs, commands.rs, lib.rs

## Constitution Check
- [x] Cross-Platform First — cpal works on all 3 platforms
- [x] Feature Parity — continuous listening mode
- [x] No macOS Lock-In
- [x] Local-First Architecture — all VAD local

## Implementation Phases

### Phase 0: Research
- Design VAD state machine: Silence ↔ Speech
- Determine silence timeout config (default 1500ms)
- Define agent handoff trigger analysis

### Phase 1: Core Implementation
- Add AlwaysOnConfig struct to pipeline.rs
- Add start/stop/run_always_on_vad_loop methods
- Implement energy-based VAD with configurable threshold
- Create handoff.rs: VoiceAgentHandoff, extract_agent_name regex

### Phase 2: Integration
- Wire always-on mode in lib.rs setup (activation_mode == "always_on")
- Add Tauri commands: start_always_on, stop_always_on, set/get_always_on_config
- Add set/get_agent_triggers commands
- Register all new commands

## Architecture Decisions
- Energy-based VAD (cpu-efficient, no external dep) over WebRTC VAD
- Background thread for VAD loop (not blocking tokio)
- Auto-transcribe on silence timeout, emit via Tauri event
- Transcript analyzed for agent trigger phrases for handoff
