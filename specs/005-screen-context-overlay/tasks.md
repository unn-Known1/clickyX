# Task List: Screen Context & Overlay

## Spec Files
- [x] spec.md — Feature specification
- [x] plan.md — Implementation plan
- [x] research.md — Research document
- [x] data-model.md — Data model
- [x] contracts/tauri-commands.md — Tauri commands contract
- [x] contracts/bridge-api.md — Bridge API contract
- [x] tasks.md — This task list
- [x] quickstart.md — Setup guide

## Rust Backend
- [ ] Cargo.toml — Add xcap, base64, image dependencies
- [ ] src-tauri/src/screen/mod.rs — Screen module
- [ ] src-tauri/src/screen/capture.rs — Screen capture implementation
- [ ] src-tauri/src/screen/coordinate.rs — Coordinate system
- [ ] src-tauri/src/overlay.rs — Full overlay rewrite
- [ ] src-tauri/src/config.rs — Add ScreenConfig + OverlayPrefs
- [ ] src-tauri/src/commands.rs — Screen/overlay commands
- [ ] src-tauri/src/bridge.rs — Screen/overlay bridge endpoints
- [ ] src-tauri/src/lib.rs — Register modules + commands

## Overlay Frontend
- [ ] src/overlay/index.html — Overlay HTML entry
- [ ] src/overlay/main.tsx — Overlay React entry
- [ ] src/overlay/OverlayApp.tsx — Overlay component
- [ ] src/overlay/overlay.css — Overlay styles

## Frontend Hooks & Components
- [ ] src/hooks/useScreenCapture.ts — Screen capture hook
- [ ] src/hooks/useOverlay.ts — Overlay control hook
- [ ] src/components/ScreenPreview.tsx — Screen preview component
- [ ] src/components/SettingsTab.tsx — Add screen/overlay settings

## Build Config
- [ ] vite.config.ts — Multi-entry configuration
- [ ] Verification: cargo check + npm run build
