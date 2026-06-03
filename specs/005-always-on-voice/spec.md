# Feature Specification: Always-On Voice Mode & Voice-Agent Handoff

## Overview
Wire up the always-on voice listening mode (activation_mode config already exists) and implement seamless handoff between voice interaction and agent modes. The always-on mode uses VAD for barge-in capable hands-free operation, and the handoff system allows users to switch between voice queries and agent tasks without friction.

## Users & Stakeholders
- **End users**: Use the app hands-free without pressing a hotkey; switch seamlessly between asking questions and spawning agents
- **Developers**: Clean separation between voice and agent pipelines with a shared orchestrator

## User Stories
- **P1**: As a user, I want to speak without holding a hotkey so I can use the app hands-free
- **P1**: As a user, I want to say "Clicky agent do X" and have it seamlessly spawn an agent task
- **P2**: As a user, I want the voice mode to respect an activation toggle (mute/unmute)
- **P2**: As a developer, I want a shared `Orchestrator` that routes voice input to either STT→AI→TTS or agent spawning

## Functional Requirements
1. **Always-on voice mode**:
   - When `activation_mode = "always_on"`, the mic capture runs continuously
   - VAD (`wake_word.rs`) detects speech start/end events
   - On speech end, the buffered audio is sent through the STT→AI→TTS pipeline
   - Configurable VAD sensitivity (0.0-1.0) in settings
   - Audio ducking during playback (system volume reduced, restored on finish)
   - Visual indicator in tray/panel when always-on is active (green dot)

2. **Voice-agent handoff**:
   - After STT, the transcript is analyzed for agent-spawn trigger phrases ("agent", "codex", "run task")
   - If trigger detected, the transcript is forwarded to Codex agent spawning instead of AI chat
   - A confirmation prompt is shown: "Start agent task: [interpreted query]?" with accept/reject
   - The agent HUD opens in the overlay showing the new task
   - User can follow up with voice refinements that are sent to the active agent

## Success Criteria
- Always-on mode captures >95% of user utterances end-to-end
- VAD triggers within 200ms of speech start and 500ms of speech end
- Agent spawn triggers fire within 1s of speech end
- No false triggers from background noise >2/hour (at default sensitivity)
- Handoff completes without requiring keyboard/mouse input

## Dependencies & Assumptions
- Requires VAD already present in `src-tauri/src/audio/wake_word.rs`
- Requires agent spawning already present in `src-tauri/src/agent/`
- Depends on audio capture already present in `src-tauri/src/audio/capture.rs`
- Out of scope: wake word ("Hey Clicky") as separate from always-on VAD
