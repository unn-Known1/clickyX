# Implementation Plan: Streaming Overlay UI

## Technical Context
- Stack: React + TypeScript + Tauri event IPC
- Libraries: Tauri emit/listen API
- Integration points: src/overlay/OverlayApp.tsx

## Constitution Check
- [x] Cross-Platform First — pure frontend
- [x] Feature Parity — matches OpenClicky visual streaming
- [x] No macOS Lock-In
- [x] Local-First Architecture

## Implementation Phases

### Phase 0: Research
- Determine streaming caption character-by-character reveal approach
- Define visual states: idle → processing → speaking → streaming

### Phase 1: Core Implementation
- Create StreamingCaption component with word-by-word char reveal
- Create Waveform component for audio level visualization
- Create Spinner component for processing state

### Phase 2: Integration
- Add lifecycle-event listener for annotation state transitions
- Wire processing/waveform event listeners to frontend
- Add streaming-caption Tauri event handler

## Architecture Decisions
- CSS transitions for smooth text reveals rather than JS animation frames
- Waveform uses canvas for performant real-time rendering
- Caption positioned at bottom-center of overlay
