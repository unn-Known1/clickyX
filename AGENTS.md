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

## Implementation Status — All 7 Phases Complete ✅

| Phase | Feature | Spec | Status |
|-------|---------|------|--------|
| 1 | Core Foundation | `specs/001-core-foundation/` | ✅ Complete |
| 2 | Voice Pipeline | `specs/002-voice-pipeline/` | ✅ Complete |
| 3 | AI Integration | `specs/003-ai-integration/` | ✅ Complete |
| 4 | Agent Mode | `specs/004-agent-mode/` | ✅ Complete |
| 5 | Screen Context & Overlay | `specs/005-screen-context-overlay/` | ✅ Complete |
| 6 | Advanced Features | `specs/006-advanced-features/` | ✅ Complete |
| 7 | Polish & Distribution | `specs/007-polish-distribution/` | ✅ Complete |

## Build Status
- `cargo check` — passes (76 dead_code warnings)
- `npm run build` — passes (TypeScript + Vite)
- CI/CD: `.github/workflows/ci.yml` + `.github/workflows/release.yml` + `.github/workflows/nightly.yml`

## Git Config
```sh
git config user.name "unn-Known1"
git config user.email "ptelgm.yt@gmail.com"
```

## Current Plan

<!-- SPECKIT START -->
- **Feature**: All 8 Feature Groups Implemented
- **Status**: Specs → Plans → Tasks → Implementation all complete
- **Remaining**: `cargo check` verification (needs Rust toolchain), display hotplug handler (multi-monitor), VAD pause-when-TTS (always-on voice)
- **Latest commit**: `43abae1` — Fix CI/CD builds: add libasound2-dev, disable -D warnings for builds, add missing icons
- **Repo**: `https://github.com/unn-Known1/clickyX`
- **Feature specs**: `specs/001-bridge-completion` through `specs/008-onboarding-permissions`
<!-- SPECKIT END -->
