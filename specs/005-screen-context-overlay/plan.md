# Implementation Plan: Screen Context & Overlay

## Technical Context

### Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Screen capture | `xcap` (Rust) | Cross-platform DXGI/PipeWire/AVFoundation |
| Image encoding | `image` crate (Rust) | JPEG encode with quality control |
| Base64 transport | `base64` crate (Rust) | Wire format for Tauri commands |
| Overlay backend | Tauri events + platform click-through | Lightweight, maintains WebView render |
| Overlay frontend | React + CSS/SVG | Reuses existing frontend patterns |
| Coordinates | `screen/coordinate.rs` | Platform-adaptive point mapping |

### Platform-Specific Concerns

- **Windows**: Click-through via `WS_EX_TRANSPARENT` + `WS_EX_LAYERED`
- **Linux**: Click-through via Wayland `wl_surface_set_input_region` / X11 input shape
- **macOS**: Click-through via NSWindow `ignoresMouseEvents`

### Key Architecture Decisions

1. **Tauri events for overlay communication** — Rust backend emits events
   consumed by the overlay WebView; no RPC needed
2. **JPEG compression at source** — Reduces memory pressure and transfer size
3. **Screen capture via xcap** — Only mature cross-platform Rust screen capture crate
4. **Overlay as separate Vite entry** — Independent React app loaded in overlay window

## Implementation Order

1. Cargo.toml — Add `xcap`, `base64`, `image` deps
2. `screen/mod.rs` + `screen/capture.rs` + `screen/coordinate.rs` — Screen capture module
3. `overlay.rs` — Full overlay rewrite with all overlay types and commands
4. `config.rs` — Add `ScreenConfig` and `OverlayPrefs`
5. `commands.rs` — Screen/overlay Tauri commands
6. `bridge.rs` — Screen/overlay bridge endpoints
7. `lib.rs` — Register modules and commands
8. `src/overlay/` — Overlay frontend (React + CSS)
9. `src/hooks/` — Screen capture + overlay hooks
10. `src/components/` — ScreenPreview + SettingsTab updates
11. `vite.config.ts` — Multi-entry for overlay

## Verification

```sh
cargo check
npm run build
```
