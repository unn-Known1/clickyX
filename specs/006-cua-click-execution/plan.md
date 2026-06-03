# Implementation Plan: CUA Click Execution

## Technical Context
- Stack: Rust + enigo
- Libraries: enigo 0.2 (cross-platform input simulation)
- Integration points: cua.rs, overlay lifecycle events

## Constitution Check
- [x] Cross-Platform First — enigo abstracts Win32/Linux/macOS input APIs
- [x] Feature Parity — matches OpenClicky CUA click/drag/type
- [x] No macOS Lock-In
- [x] Local-First Architecture

## Implementation Phases

### Phase 0: Research
- enigo API: click, move_mouse, text, key_click
- Rate limiting for safety (min 100ms between clicks)

### Phase 1: Core Implementation
- Create InputSimulator with Native and Background backends
- Implement click, double_click, type_text, key_press, move_cursor
- Add rate-limiting (default 100ms min interval)
- Add coordinate bounds safety (clamp to screen bounds)

### Phase 2: Integration
- Register mod cua in lib.rs
- Wire click execution to overlay lifecycle events

## Architecture Decisions
- enigo over platform-specific APIs — single dependency for all 3 platforms
- Native backend uses enigo::Simulate, Background uses enigo::Simulate with off-screen coordinate safety
- Rate limiting via simple Instant check (no separate scheduler thread)
