# Tasks: Always-On Voice Mode

## Phase 1: Core Pipeline
- [x] T001 [P] Add AlwaysOnConfig struct and fields to VoicePipeline
- [x] T002 [P] Implement start_always_on / stop_always_on methods
- [x] T003 [P] Implement run_always_on_vad_loop with energy-based VAD

## Phase 2: Agent Handoff
- [x] T004 [P] Create handoff.rs with VoiceAgentHandoff analyzer
- [x] T005 [P] Implement extract_agent_name regex helper

## Phase 3: Commands & Integration
- [x] T006 [P] Wire always-on mode in lib.rs setup (activation_mode check)
- [x] T007 [P] Add Tauri commands: start_always_on, stop_always_on
- [x] T008 [P] Add set/get_always_on_config, set/get_agent_triggers commands
- [x] T009 [P] Register all new commands in lib.rs invoke_handler

## Phase 4: Polish
- [x] T010 Add agent_triggers field to AppState
- [ ] T011 Handle VAD pause when TTS is speaking
