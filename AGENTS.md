# ClickyX Agent Instructions

## Project Overview

ClickyX is a cross-platform port of OpenClicky (macOS native) — a system-tray AI companion with voice, screen context, agent mode, cursor overlay, and integrations. Rebuilt from scratch for Windows, Linux, and macOS using cross-platform technologies.

## Key Rules

1. **Cross-platform first** — never write platform-specific code without providing equivalent implementations for all 3 target platforms
2. **Featur parity** — every feature in the OpenClicky original must have a documented migration path
3. **No macOS lock-in** — avoid Foundation, SwiftUI, AppKit, or any Apple-only framework
4. **Local-first** — API keys are user-configured, no cloud key sync, no hosted OAuth, no Google login
5. **External bridge contract** — the `localhost:32123` HTTP API must remain compatible with OpenClicky's spec
6. **Refer to FEATURE_SPEC.md** — the comprehensive feature breakdown at `docs/FEATURE_SPEC.md` is the single source of truth

## Technology Base

- **App shell**: Tauri (Rust + web frontend)
- **Native APIs**: Rust (cpal for audio, scrap for screen capture, tray for system tray)
- **Frontend**: React/Svelte for panel UI, settings, agent dashboard
- **Overlay**: Platform-native layered windows with WebView or Canvas rendering
- **AI providers**: HTTP/WebSocket APIs (platform-independent)
- **Agent runtime**: Codex (Node.js, already cross-platform)

## Verification

```sh
cargo check          # Rust compilation check
cargo test           # Run Rust tests
npm run build        # Frontend build
```

## Key Files

- `docs/FEATURE_SPEC.md` — Complete feature catalog organized by subsystem
- `src-tauri/src/` — Rust backend (audio, screen, bridge, permissions)
- `src/` — Frontend UI (tabs: Home, Agents, Connections, Settings)
- `src/overlay/` — Cursor overlay and visual guidance rendering
- `skills/` — Bundled agent skills (ported from OpenClicky)
- `src-tauri/src/bridge.rs` — External control bridge (HTTP + SSE)
- `src-tauri/src/audio/` — Voice pipeline (capture, STT, TTS, wake word)
- `src-tauri/src/ai/` — AI provider routing and model catalog

## Development Phases

See `docs/FEATURE_SPEC.md#17-implementation-phases` for the full 7-phase build plan.

## Current Plan

<!-- SPECKIT START -->
- **Feature**: Core Foundation (Phase 1)
- **Spec**: `specs/001-core-foundation/spec.md`
- **Plan**: `specs/001-core-foundation/plan.md`
- **Research**: `specs/001-core-foundation/research.md`
- **Design**: `specs/001-core-foundation/data-model.md`
- **Contracts**: `specs/001-core-foundation/contracts/`
- **Quickstart**: `specs/001-core-foundation/quickstart.md`
<!-- SPECKIT END -->
