# Implementation Plan: Multi-Monitor Overlay

## Technical Context
- Stack: Rust + Tauri WebviewWindow + xcap
- Libraries: xcap (monitor detection), tauri::WebviewWindowBuilder
- Integration points: overlay/mod.rs, overlay/screen_router.rs, overlay/window_manager.rs, lib.rs

## Constitution Check
- [x] Cross-Platform First — xcap works on Windows, Linux, macOS
- [x] Feature Parity — screenN tag routing
- [x] No macOS Lock-In
- [x] Local-First Architecture

## Implementation Phases

### Phase 0: Research
- xcap Monitor::all() API for multi-monitor detection
- Tauri per-screen window positioning via WebviewWindowBuilder

### Phase 1: Core Implementation
- Create screen_router.rs: ScreenManager (monitor list, point lookup, virtual bounds), CoordinateNormalizer
- Create window_manager.rs: OverlayWindowManager with per-screen window creation, positioning, refresh

### Phase 2: Integration
- Add screen-aware routing functions to overlay/mod.rs: show_cursor_on_screen, get_screen_for_point
- Wire OverlayWindowManager initialization in lib.rs

## Architecture Decisions
- Per-screen overlay windows (overlay-0, overlay-1, etc.) — one WebviewWindow per monitor
- Coordinate normalizer maps between screen-local and virtual desktop coordinates
- Fallback to primary overlay if per-screen window not found
- screenN tag matches 1-indexed convention (screen1, screen2)
