# Feature Specification: Multi-Monitor Overlay & Coordinate Normalization

## Overview
Replace the single overlay window with per-screen overlay windows and implement cross-platform coordinate system normalization. This enables accurate visual guidance across multiple monitors on Windows, Linux, and macOS.

## Users & Stakeholders
- **End users**: See cursor overlays on any monitor, not just the primary display
- **Developers**: Write coordinate logic once; platform normalization happens transparently

## User Stories
- **P1**: As a multi-monitor user, I want overlay annotations to appear on the correct screen
- **P1**: As a developer, I want a unified coordinate system so I don't need to worry about platform Y-flip or origin differences
- **P2**: As a user, I want the companion cursor to appear on whatever screen my mouse is on

## Functional Requirements
1. Create one overlay window per connected monitor (Windows: per-HMONITOR, Linux: per-Wayland-output, macOS: per-NSScreen)
2. Each overlay window is click-through (`WS_EX_TRANSPARENT`, `input region pass-through`, `ignoresMouseEvents`)
3. Coordinate normalization layer converts all overlay coordinates from a unified space to platform-native:
   - macOS: AppKit bottom-left origin → top-left origin (Y-flip)
   - Windows: native top-left origin (pass-through)
   - Linux: Wayland top-left origin per-monitor (pass-through)
4. Annotation tags ([POINT], [RECT], etc.) include a `screenN` selector that routes to the correct overlay window
5. Window creation/destruction hooks into display change events (hotplug)
6. `WindowManager` struct manages a `HashMap<ScreenId, OverlayWindow>` with CRUD operations

## Success Criteria
- Annotations render on the correct monitor when `screenN` is specified
- Click-through behavior works on all platforms
- Coordinate normalization produces pixel-accurate positioning (±1px)
- Hotplug events (monitor connect/disconnect) handled gracefully
- Single-monitor systems fall back to single overlay window (no regression)

## Dependencies & Assumptions
- Depends on `scrap` crate for monitor enumeration
- Uses Tauri's window API for per-screen window creation
- Requires Feature Group 001 for bridge endpoint wiring (POST /cursor etc.)
- Out of scope: Wayland fractional scaling (deferred to future)
