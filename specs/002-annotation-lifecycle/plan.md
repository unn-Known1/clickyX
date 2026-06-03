# Implementation Plan: Annotation Lifecycle Management

## Technical Context
- Stack: Rust + Tauri event system
- Libraries: serde, std::time
- Integration points: overlay/mod.rs, overlay/lifecycle.rs, overlay/manager.rs, lib.rs

## Constitution Check
- [x] Cross-Platform First — pure Rust, no OS deps
- [x] Feature Parity — timed annotations, auto-expiry
- [x] No macOS Lock-In
- [x] Local-First Architecture

## Implementation Phases

### Phase 0: Research
- Define annotation lifecycles: Armed → Completed | Missed
- Define timeout config per annotation kind

### Phase 1: Core Implementation
- Create lifecycle.rs with AnnotationState enum, Annotation struct, now_ms()
- Create manager.rs with AnnotationManager (HashMap storage, sweep, force-complete)

### Phase 2: Integration
- Convert overlay.rs from single-file to directory module
- Add lifecycle fields to all overlay payload structs
- Wire start_lifecycle_sweep background thread in lib.rs

## Architecture Decisions
- Per-kind timeouts: Cursor=5s, Rect=8s, Scribble=10s, Caption=3s
- Background sweep thread (1s interval) — simple, no tokio timer needed
- Force-complete same-kind before adding new — prevents stacking
