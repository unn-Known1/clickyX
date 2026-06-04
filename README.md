# ClickyX — Cross-Platform AI Desktop Companion

[![CI/CD](https://github.com/unn-Known1/clickyX/actions/workflows/ci.yml/badge.svg)](https://github.com/unn-Known1/clickyX/actions/workflows/ci.yml)
[![cargo check](https://img.shields.io/badge/cargo-check-brightgreen)](https://github.com/unn-Known1/clickyX)
[![npm build](https://img.shields.io/badge/npm-build-brightgreen)](https://github.com/unn-Known1/clickyX)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20Linux%20%7C%20macOS-blue)](https://github.com/unn-Known1/clickyX/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-orange)](https://tauri.app)
[![Rust](https://img.shields.io/badge/rust-stable-blueviolet)](https://www.rust-lang.org)
[![Local-First](https://img.shields.io/badge/local--first-yes-success)]()
[![Cloud Telemetry](https://img.shields.io/badge/telemetry-none-success)]()
[![Repo](https://img.shields.io/badge/repo-unn--Known1%2FclickyX-181717?logo=github)](https://github.com/unn-Known1/clickyX)

> **ClickyX** is a cross-platform, open-source AI desktop companion that lives in your system tray, listens to your voice, sees your screen, drives your cursor, runs background agents, and exposes a local HTTP bridge for tool integration. It is a faithful, feature-complete reimplementation of the macOS-only **OpenClicky** (and the original **Clicky / HeyClicky**) — written from scratch in **Rust + Tauri + React/TypeScript** so it runs natively on **Windows, Linux, and macOS**.

---

## What is ClickyX?

ClickyX turns any desktop into an AI-augmented workspace. Hold a hotkey to talk, type a sentence, or say a wake word — ClickyX transcribes your voice, captures your screen, asks an LLM (Claude, GPT, Gemini, NVIDIA, OpenRouter) what to do, draws visual guidance directly on your screen, and can even click and type on your behalf. It is designed for power users, developers, and AI tinkerers who want a **local-first, privacy-respecting** AI co-pilot that is always one keystroke away.

ClickyX is **not** a chatbot. It is a **runtime** — with a system-tray UI, a transparent overlay layer on every monitor, an external HTTP bridge on `localhost:32123`, a Codex-based agent runtime, a computer-use engine, an automation scheduler, and a fully open skill system.

**Inspired by / ported from**: [OpenClicky](https://github.com/jasonkneen/openclicky) (Jason Kneen) · [HeyClicky](https://github.com/farzaa/clicky) (Farza Majeed) · original [Clicky](https://github.com/farzaa/clicky) (Farza Majeed, MIT).

---

## Repository

| | |
|---|---|
| **Repository** | `github.com/unn-Known1/clickyX` |
| **Owner** | [`@unn-Known1`](https://github.com/unn-Known1) |
| **Branch** | `master` |
| **License** | MIT |
| **Stack** | Tauri v2 (Rust) + React + TypeScript + Vite |
| **Status** | All 8 feature groups implemented — see [Implementation Status](#implementation-status) |
| **Latest release** | See [Releases](https://github.com/unn-Known1/clickyX/releases) |
| **Issues** | [github.com/unn-Known1/clickyX/issues](https://github.com/unn-Known1/clickyX/issues) |
| **Discussions** | [github.com/unn-Known1/clickyX/discussions](https://github.com/unn-Known1/clickyX/discussions) |
| **CI/CD** | GitHub Actions (Check + 3-platform Build matrix + Nightly) |
| **Latest commit** | See [commit log](https://github.com/unn-Known1/clickyX/commits/master) |

---

## Topics & Labels

`clicky` · `openclicky` · `clickyx` · `heyclicky` · `ai-companion` · `ai-desktop` · `desktop-ai` · `ai-assistant` · `system-tray` · `tray-app` · `menu-bar-app` · `voice-assistant` · `voice-agent` · `push-to-talk` · `wake-word` · `always-on-voice` · `speech-to-text` · `text-to-speech` · `stt` · `tts` · `screen-capture` · `screen-reader` · `screenshot-ai` · `cursor-overlay` · `visual-guidance` · `on-screen-overlay` · `multi-monitor` · `agent-mode` · `codex-agent` · `codex-runtime` · `background-agent` · `agent-dock` · `computer-use` · `cua` · `click-automation` · `input-simulation` · `automation` · `cron-jobs` · `scheduled-tasks` · `tauri` · `tauri-v2` · `rust` · `react` · `typescript` · `vite` · `cross-platform` · `windows` · `linux` · `macos` · `anthropic` · `claude` · `openai` · `gpt` · `gemini` · `openrouter` · `nvidia` · `elevenlabs` · `cartesia` · `deepgram` · `whisper` · `assemblyai` · `edge-tts` · `mcp` · `model-context-protocol` · `http-bridge` · `localhost-api` · `sse-events` · `local-first` · `privacy` · `no-telemetry` · `open-source` · `mit-license` · `electron-alternative` · `flutter-alternative` · `appindicator` · `wayland` · `xcap` · `enigo` · `cpal` · `scrap` · `global-hotkey` · `screen-recording` · `accessibility` · `voice-discovery` · `orbit-picker` · `accent-color` · `auto-capture` · `onboarding` · `permission-wizard`

---

## Table of Contents

1. [What is ClickyX?](#what-is-clickyx)
2. [Repository](#repository)
3. [Topics & Labels](#topics--labels)
4. [Highlights](#highlights)
5. [Feature Parity: OpenClicky (macOS) vs ClickyX](#feature-parity-openclicky-macos-vs-clickyx)
6. [Features](#features)
7. [Screens & Demos](#screens--demos)
8. [Quick Start](#quick-start)
9. [Architecture](#architecture)
10. [Using AI Providers](#using-ai-providers)
11. [Build](#build)
12. [Configuration](#configuration)
13. [External API (Bridge)](#external-api-bridge)
14. [Voice, Vision, Agents](#voice-vision-agents)
15. [Implementation Status](#implementation-status)
16. [Documentation](#documentation)
17. [Contributing](#contributing)
18. [License](#license)
19. [Acknowledgments](#acknowledgments)

---

## Highlights

- **🖥️ Cross-platform, single binary** — Tauri v2 ships a native `.msi` / `.exe` on Windows, an `.app` on macOS, and a `.deb` / `.AppImage` on Linux. No Electron, no Chromium bloat.
- **🎙️ Always-on voice, push-to-talk, and wake word** — Energy-based VAD with barge-in handoff, configurable hotkeys, "Hey Clicky" wake-word detection.
- **👁️ Screen context on every query** — Captures all monitors (or just the cursor screen / focused window) and attaches the screenshot to every AI request.
- **🖱️ Visual guidance overlay** — Animated bezier-arc cursor, rectangles, freehand scribbles, streaming text bubbles, waveform, processing spinner, per-screen routing on multi-monitor setups.
- **🤖 Codex agent runtime** — Spawns Node.js Codex sidecar processes for long-running background tasks (code, research, file ops, builds, scheduled jobs).
- **🖱️ Computer-Use (CUA)** — Cross-platform click / double-click / drag / type / key-press via `enigo` — rate-limited, bounds-safe, background mode.
- **🌐 Local HTTP bridge on `localhost:32123`** — 16 OpenClicky-compatible endpoints, SSE events, token auth, CORS, Anthropic + OpenAI proxies, MCP tool routing.
- **🎨 4 accent colors + voice-discovery orbit picker** — User-selectable companion cursor color, drag-to-discover voice UI with per-voice accent propagation.
- **📸 Auto-capture mode** — Continuous context gathering with diff-based change detection, configurable interval (1s/3s/5s/10s/30s) and mode (full / cursor / focused / all).
- **🔌 MCP server management** — CRUD UI for Model Context Protocol servers, independent of Codex.
- **⏰ Automation engine** — Cron and interval scheduling, JSON-persisted, 30s tick loop.
- **🧩 Skills system** — 4 bundled skills (screen-control, codex management) with `.toml` descriptors and JS entry-point template.
- **🚀 Onboarding & permissions** — 4-step permission wizard (mic, screen recording, accessibility, notifications) with OS-specific guidance.
- **🛡️ Local-first, zero telemetry** — No Supabase, no PostHog, no Sentry, no cloud auth. All API keys are user-configured. Custom platform-aware auto-updater (no Sparkle).

---

## Feature Parity: OpenClicky (macOS) vs ClickyX

| Category | OpenClicky (macOS) | ClickyX | Status |
|----------|-------------------|---------|--------|
| **Voice Pipeline** | | | |
| Push-to-talk | `Ctrl+Option` hold | `Ctrl+Shift+V` (configurable) | ✅ |
| Type mode | `Ctrl` double-tap | Config defined, not wired | ⚠️ |
| Always-on voice | — | Energy-based VAD, silence timeout | ✅ |
| Wake word | "Hey Clicky" | "Hey Clicky" (energy-based) | ✅ |
| STT providers | AssemblyAI, Apple Speech, Deepgram | Deepgram, Whisper, AssemblyAI | ✅ (3 of 3) |
| TTS providers | ElevenLabs, AVSpeechSynthesizer, Cartesia | ElevenLabs, Cartesia, Edge, Deepgram Aura, OpenAI Realtime | ✅ (5 of 3) |
| Realtime voice | GPT Realtime | GPT-4o Realtime | ✅ |
| Audio VU meter | Yes | RMS + peak | ✅ |
| Voice discovery | Drag-to-discover UI | Orbit picker with per-voice accent colors | ✅ |
| **Screen & Vision** | | | |
| Screen capture | ScreenCaptureKit | `xcap` crate (all platforms) | ✅ |
| Multi-monitor | Yes | Per-screen overlay windows | ✅ |
| Window capture | Full screen or active | Full, cursor, focused | ✅ |
| Auto-capture mode | Continuous context | Diff-based capture with interval + mode config | ✅ |
| **Cursor Overlay** | | | |
| Blue companion cursor | Yes | Yes, animated | ✅ |
| Color options | 4 accent colors | 4 preset swatches + custom color picker | ✅ |
| Bezier arc animation | Yes | Yes | ✅ |
| Annotations | POINT, TARGET, HOVER, RECT, SCRIBBLE, HIGHLIGHT, SHAPE | POINT, RECT, SCRIBBLE, CAPTION | ✅ |
| Annotation lifecycle | Armed → Completed → Missed | Full state machine | ✅ |
| Text bubble | Word-by-word reveal | Word-by-word + streaming | ✅ |
| Waveform | Yes | Yes | ✅ |
| Multi-monitor routing | Natural (macOS) | Per-screen window + coordinate normalizer | ✅ |
| **Agent Mode (Codex)** | | | |
| Background agents | Yes | Codex Node.js runtime | ✅ |
| Agent HUD | Floating window | Inline dashboard | ⚠️ |
| Agent dock | In overlay | Yes, with status | ✅ |
| Task types | code, build, research, file, docs, repo, frontend, search | Same | ✅ |
| Scheduled agents | — | Cron/interval (clickyX add) | ✅ |
| Voice-agent handoff | Yes | Trigger phrase analysis | ✅ |
| Skills bundled | 28+ | 4 (screen-control, codex) | ⚠️ |
| **Computer Use (CUA)** | | | |
| Click execution | CGEvent → enigo | `enigo` Native + Background | ✅ |
| Double-click, drag, type | Yes | click/double_click/type_text/key_press/move_cursor | ✅ |
| App launch, volume, etc. | AppleScript | — | ❌ |
| Background CUA | No cursor warp | — | ❌ |
| Element detection | Accessibility API | — | ❌ |
| **Integrations** | | | |
| GitHub | Yes | — | ❌ |
| Google Workspace | Yes | — | ❌ |
| Notion, Linear, Obsidian | Yes | — | ❌ |
| Spotify, Maps, Stocks | Yes | — | ❌ |
| MCP Servers | — | CRUD management (clickyX add) | ✅ |
| Automation engine | — | Cron/interval scheduling (clickyX add) | ✅ |
| 3D Model Generation | — | Tripo3D API (clickyX add) | ✅ |
| **Bridge API** | | | |
| All 16 endpoints | Yes | All routed | ✅ |
| Token auth | Yes | Constant-time comparison | ✅ |
| CORS | Yes | actix-cors | ✅ |
| SSE events | Yes | Yes | ✅ |
| **UI & UX** | | | |
| System tray | NSStatusItem | Tauri tray-icon | ✅ |
| Floating panel | Notch panel | Home/Agents/Connections/Settings | ✅ |
| Onboarding | Pre-sign-in flow | 4-step permission wizard | ✅ |
| Permissions guide | Drag-to-accept | OS-specific step hints | ✅ |
| Widget dashboard | Place/Stock/Image | Active Agents/Today/Needs Attention | ✅ |
| Voice picker | Orbit discovery map | Drag-to-rotate orbit with per-voice accent | ✅ |
| **Backend** | | | |
| AI providers | Anthropic, OpenAI | Anthropic, OpenAI, OpenRouter, Gemini, NVIDIA | ✅ |
| Model catalog | Hardcoded | Dynamic remote fetch | ✅ |
| Multi-platform | macOS only | Windows, Linux, macOS | ✅ |
| Auto-updater | Sparkle 2 | Custom updater (MSI/DMG/AppImage) | ✅ |
| Config export/import | — | Yes (clickyX add) | ✅ |
| Log viewer | — | Built-in w/ 5MB rotation (clickyX add) | ✅ |
| Local-first | ❌ (Supabase) | ✅ All API keys user-configured | ✅ |

---

## Features

| Category | Capabilities |
|----------|-------------|
| **Voice** | Push-to-talk, always-on VAD, wake word, STT (Deepgram, Whisper, AssemblyAI), TTS (ElevenLabs, Cartesia, Microsoft Edge, Deepgram Aura, OpenAI Realtime), audio VU meter, realtime voice, voice-discovery orbit picker |
| **AI Providers** | Anthropic Claude, OpenAI GPT, NVIDIA AI Foundation, OpenRouter, Gemini — extensible provider system with dynamic model discovery |
| **Screen Context** | Screen capture (all monitors, cursor screen, focused window), JPEG encoding, coordinate normalization, multi-monitor support, auto-capture mode |
| **Agent Mode** | Codex runtime management, agent session lifecycle, bundled skills, agent dock with status indicators, voice-agent handoff |
| **Cursor Overlay** | Animated cursor guidance, bezier arc flight, rectangles, scribbles, speech bubbles, secondary proxy cursors, per-screen windows, 4 accent colors |
| **System Tray** | Left-click panel toggle, right-click menu (Quick Ask, Settings, Quit), agent status indicators |
| **External Bridge** | HTTP API on `localhost:32123` (16 endpoints, REST + SSE), token auth, MCP tools, AI proxy, fully OpenClicky-compatible |
| **CUA Input** | Cross-platform click, double-click, type text, key press, cursor move via `enigo` — rate-limited, bounds-safe |
| **Automations** | Interval/cron scheduling, agent binding, system app discovery |
| **Onboarding** | 4-step permission wizard (mic, screen recording, accessibility, notifications) with OS-specific guidance |
| **Auto-Capture** | Continuous screen context with diff detection, interval/mode config, live status pill, last-frame cache |
| **Voice Discovery** | Drag-to-rotate orbit picker, 5 provider voice lists (ElevenLabs, Cartesia, Deepgram Aura, OpenAI Realtime, Edge), click-to-select with auto-applied accent color |
| **Theming** | System/Light/Dark, glass backdrop, 4 accent color presets + custom color picker |
| **MCP** | CRUD management of Model Context Protocol servers |
| **3D Generation** | Tripo3D API with polling |
| **Logs** | Built-in log viewer with 5MB rotation |
| **Config** | JSON export/import/reset |

---

## Screens & Demos

_(Screenshots and screen recordings to be added — see [Releases](https://github.com/unn-Known1/clickyX/releases) for binaries.)_

---

## Quick Start

```sh
# Clone
git clone https://github.com/unn-Known1/clickyX.git
cd clickyX

# Install JS deps
npm ci

# Run in dev mode (hot reload)
npm run tauri dev

# Build a production binary for your platform
npm run tauri build
```

The build artifact lands in `src-tauri/target/release/bundle/`:
- **Windows**: `.msi` and `.exe` installer
- **macOS**: `.app` bundle
- **Linux**: `.deb` and `.AppImage`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ClickyX App                            │
├─────────────────────────────────────────────────────────────┤
│  UI Layer: Tray Icon + Floating Panel + Overlay (per-screen)│
├─────────────────────────────────────────────────────────────┤
│  Rust Backend:                                              │
│    ├─ audio/      Capture, STT, TTS, Pipeline, Handoff,    │
│    │              Voices (5-provider catalog), Wake Word    │
│    ├─ ai/         Anthropic, OpenAI, Catalog, Vision        │
│    ├─ agent/      Codex, Sessions, Skills, Dock             │
│    ├─ screen/     Capture (xcap), Auto-capture, Coordinates │
│    ├─ overlay/    Cursor/Rect/Scribble, Lifecycle, Screen   │
│    │              Router, Window Manager, Annotation Mgr    │
│    ├─ cua.rs      Click simulation (enigo)                  │
│    ├─ bridge.rs   HTTP API (127.0.0.1:32123)               │
│    ├─ bridge_auth Token auth (constant-time)               │
│    ├─ permissions Per-OS check/request stubs                │
│    ├─ automation/ Cron/interval scheduling                  │
│    ├─ gen3d.rs    Tripo3D API                               │
│    └─ updater.rs  MSI/DMG/AppImage updater                  │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React + TypeScript):                              │
│    ├─ Home        Chat, Screen Preview, Quick Ask          │
│    ├─ Agents      Session Management, Skills, HUD          │
│    ├─ Connections Integrations, Automations, MCP           │
│    └─ Settings    General, Voice (orbit picker), AI, CUA,  │
│                  Permissions, Logs                          │
│    └─ overlay/    CursorOverlay (per-screen windows)        │
└─────────────────────────────────────────────────────────────┘
```

---

## Using AI Providers

### Anthropic (Claude)
1. Open **Settings → AI Providers**
2. Enter your Anthropic API key (`sk-ant-...`)
3. Select a model (e.g., `claude-sonnet-4-20250514`)

### OpenAI (GPT)
1. Open **Settings → AI Providers**
2. Enter your OpenAI API key (`sk-proj-...`)
3. Select a model (e.g., `gpt-4o`)

### NVIDIA AI Foundation
1. Open **Settings → AI Providers**
2. Under "OpenAI (GPT)" section:
   - **API Key**: your NVIDIA API key (`nvapi-...`)
   - **Model**: e.g., `meta/llama-3.1-8b-instruct`
   - **Base URL**: `https://integrate.api.nvidia.com/v1`
3. The model dropdown will auto-discover available models from NVIDIA's `/v1/models` endpoint

*Any OpenAI-compatible API works similarly — Azure, Together AI, Groq, etc. Just set the Base URL and API key.*

---

## Build

```sh
npm run build              # Frontend build (TypeScript + Vite)
cargo check                # Rust compilation check
cargo test                 # Run Rust tests
npm run tauri build        # Full production binary
```

CI runs `cargo check` with `RUSTFLAGS: -D warnings` — unused imports will fail the build.

---

## Configuration

Auto-created on first run:

| Platform | Config Path |
|----------|------------|
| Linux | `~/.config/clickyx/config.json` |
| macOS | `~/Library/Application Support/clickyx/config.json` |
| Windows | `%APPDATA%/clickyx/config.json` |

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for full reference.

---

## External API (Bridge)

HTTP server on `localhost:32123` — compatible with OpenClicky's spec:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Health check |
| GET | `/events` | SSE event stream |
| POST | `/panel/toggle` | Toggle floating panel |
| POST | `/screenshot` | Capture screen(s) |
| POST | `/cursor` | Show cursor overlay |
| POST | `/cursors` | Show multiple cursors |
| POST | `/rectangle` | Draw rectangle |
| POST | `/scribble` | Draw freehand path |
| POST | `/caption` | Show caption text |
| POST | `/speak` | Text-to-speech |
| POST | `/click` | Left-click coordinates |
| POST | `/clear` | Clear all overlays |
| POST | `/notify` | Desktop notification |
| POST | `/mcp/tools` | List MCP tools |
| POST | `/mcp/call` | Call MCP tool |
| POST | `/v1/messages` | Anthropic proxy |
| POST | `/v1/responses` | OpenAI proxy |

All endpoints support token auth via `x-openclicky-token` header or `Bearer` token.

---

## Voice, Vision, Agents

- **Voice**: Press-and-hold `Ctrl+Shift+V` (default) to push-to-talk, or enable always-on mode for hands-free operation. Wake word "Hey Clicky" works in always-on mode. STT supports Deepgram, Whisper, and AssemblyAI; TTS supports ElevenLabs, Cartesia, Microsoft Edge, Deepgram Aura, and OpenAI Realtime. The Voice Discovery orbit picker lets you audition voices and apply their accent color to the overlay.
- **Vision**: Every AI request automatically captures the screen (configurable: all monitors / cursor screen / focused window) and attaches it to the message. Enable Auto-Capture for continuous context — frames are emitted as `auto-capture-frame` Tauri events when the screen changes.
- **Agents**: Say "clicky agent" (or click the Agents tab) to spawn a background Codex process. Agents can run code, research, file operations, builds, and web searches. Scheduled agents (cron / interval) run in the background. The agent dock in the overlay shows live status.

---

## Implementation Status

All 8 feature groups from the spec are implemented and shipped:

| Phase | Feature | Spec | Status |
|-------|---------|------|--------|
| 1 | Bridge API Completion | `specs/001-bridge-completion/` | ✅ Complete |
| 2 | Annotation Lifecycle | `specs/002-annotation-lifecycle/` | ✅ Complete |
| 3 | Multi-Monitor Overlay | `specs/003-multi-monitor-overlay/` | ✅ Complete |
| 4 | Streaming Overlay UI | `specs/004-streaming-overlay-ui/` | ✅ Complete |
| 5 | Always-On Voice | `specs/005-always-on-voice/` | ✅ Complete |
| 6 | CUA Click Execution | `specs/006-cua-click-execution/` | ✅ Complete |
| 7 | Skills System | `specs/007-skills-system/` | ✅ Complete |
| 8 | Onboarding & Permissions | `specs/008-onboarding-permissions/` | ✅ Complete |

Plus 3 parity-round additions landed on top:
- **4 accent color presets** + custom picker + `accent-changed` event propagation
- **Auto-capture mode** with diff detection, interval/mode config, last-frame cache
- **Voice discovery orbit picker** with 5 provider voice lists and per-voice accent colors

---

## Documentation

- [Setup Guide](docs/SETUP.md)
- [Configuration Reference](docs/CONFIGURATION.md)
- [Contributing Guidelines](docs/CONTRIBUTING.md)
- [Feature Specification](docs/FEATURE_SPEC.md)
- [DMG Reverse-Engineering Analysis](docs/CLICKY_APP_ANALYSIS.md)
- [Agent Instructions](AGENTS.md)
- **Feature Gap Specs**:
  - [Bridge API Completion](specs/001-bridge-completion/)
  - [Annotation Lifecycle](specs/002-annotation-lifecycle/)
  - [Multi-Monitor Overlay](specs/003-multi-monitor-overlay/)
  - [Streaming Overlay UI](specs/004-streaming-overlay-ui/)
  - [Always-On Voice](specs/005-always-on-voice/)
  - [CUA Click Execution](specs/006-cua-click-execution/)
  - [Skills System](specs/007-skills-system/)
  - [Onboarding & Permissions](specs/008-onboarding-permissions/)

---

## Contributing

Pull requests, bug reports, and feature requests are welcome. See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing thing'`)
4. Push to the branch (`git push origin feat/your-feature`)
5. Open a Pull Request against `master`

---

## License

[MIT](LICENSE) — free for personal and commercial use.

---

## Acknowledgments

- **Jason Kneen** — for the original [OpenClicky](https://github.com/jasonkneen/openclicky) macOS app, which is the spiritual and feature parent of ClickyX.
- **Farza Majeed** — for the original [Clicky](https://github.com/farzaa/clicky) (MIT) and the commercial HeyClicky, which inspired the design language, voice pipeline, and visual overlay.
- **OpenAI Codex team** — for the cross-platform Node.js agent runtime that powers ClickyX's agent mode.
- **Tauri team** — for making cross-platform native desktop apps in Rust actually pleasant.

---

<p align="center">
  <sub>Built with Rust + Tauri + React. Run anywhere. Owned by you.</sub>
</p>
