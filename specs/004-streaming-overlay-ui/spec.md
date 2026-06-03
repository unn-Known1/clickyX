# Feature Specification: Streaming Overlay UI

## Overview
Enhance the overlay with rich real-time visual feedback: word-by-word response text reveal, animated waveform visualization during TTS playback, and a processing spinner. These features bring the overlay experience to parity with the macOS original.

## Users & Stakeholders
- **End users**: See AI responses revealed word-by-word near the cursor, see voice waveform during TTS, and see a spinner during processing
- **Developers**: Modular animation system for overlay components

## User Stories
- **P1**: As a user, I want the AI response text to appear word-by-word near the cursor so I can read along as it's generated
- **P2**: As a user, I want to see a waveform animation while TTS is playing so I know audio is active
- **P2**: As a user, I want a spinner indicator during processing so I know the system is working

## Functional Requirements
1. **Word-by-word response bubble** (`show_caption` streaming):
   - Caption text arrives as chunks from the AI streaming response
   - Each word fades/reveals on a configurable interval (default: 30ms per char, 200ms per word)
   - Positioned adjacent to the companion cursor with a speech-bubble tail
   - Supports markdown inline formatting (bold, italic, code) with styled rendering
   - Auto-dismisses when complete after a configurable delay (default: 5s)

2. **Waveform visualization**:
   - Animated frequency bars rendered as SVG or Canvas
   - Active during TTS playback (receives amplitude data from audio pipeline)
   - 20 bars with smooth interpolation between frames
   - Positioned below the companion cursor or at a configurable location
   - Color matches the accent color theme

3. **Processing spinner**:
   - Simple animated SVG spinner (rotating arc)
   - Shown during the `processing` state of the state machine
   - Positioned at the companion cursor location
   - Transitions to waveform or bubble when response begins

## Success Criteria
- Word-by-word reveal plays at readable speed (not too fast/slow)
- Waveform responds to audio amplitude in real-time (<50ms latency)
- Spinner is visible and smooth during processing
- All three components animate at 60fps
- No layout overflow or clipping at any overlay size
- Graceful degradation if any component fails (others continue unaffected)

## Dependencies & Assumptions
- Requires overlay rendering in `src/overlay/OverlayApp.tsx`
- Waveform needs amplitude data from audio pipeline (`src-tauri/src/audio/`)
- Processing state available from pipeline state machine (`pipeline.rs`)
- Out of scope: GPU-accelerated animations (CSS/JS animations sufficient)
