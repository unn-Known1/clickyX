# ClickyX

[![CI/CD](https://github.com/unn-Known1/clickyX/actions/workflows/ci.yml/badge.svg)](https://github.com/unn-Known1/clickyX/actions/workflows/ci.yml)
[![cargo check](https://img.shields.io/badge/cargo-check-brightgreen)](https://github.com/unn-Known1/clickyX)
[![npm build](https://img.shields.io/badge/npm-build-brightgreen)](https://github.com/unn-Known1/clickyX)

Cross-platform AI companion — a port of [OpenClicky](https://github.com/jasonkneen/openclicky) (macOS native) for **Windows, Linux, and macOS**. System-tray AI with voice, screen context, agent mode, cursor overlay, automation, and external HTTP API control.

Built with **Tauri v2** (Rust backend + React/TypeScript frontend).

## Feature Parity: OpenClicky (macOS) vs ClickyX

| Category | OpenClicky (macOS) | ClickyX | Status |
|----------|-------------------|---------|--------|
| **Voice Pipeline** | | | |
| Push-to-talk | `Ctrl+Option` hold | `Ctrl+Shift+V` (configurable) | ✅ |
| Type mode | `Ctrl` double-tap | Config defined, not wired | ⚠️ |
| Always-on voice | — | Energy-based VAD, silence timeout | ✅ |
| Wake word | "Hey Clicky" | "Hey Clicky" (energy-based) | ✅ |
| STT providers | AssemblyAI, Apple Speech, Deepgram | Deepgram, Whisper, AssemblyAI | ✅ (3 of 3) |
| TTS providers | ElevenLabs, AVSpeechSynthesizer, Cartesia | ElevenLabs, Cartesia, Edge, Deepgram Aura | ✅ (4 of 3) |
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

## Features

| Category | Capabilities |
|----------|-------------|
| **Voice** | Push-to-talk, always-on VAD, wake word, STT (Deepgram, Whisper, AssemblyAI), TTS (ElevenLabs, Cartesia, Microsoft Edge, Deepgram Aura), audio VU meter, realtime voice |
| **AI Providers** | Anthropic Claude, OpenAI GPT, NVIDIA AI Foundation, OpenRouter, Gemini — extensible provider system with dynamic model discovery |
| **Screen Context** | Screen capture (all monitors, cursor screen, focused window), JPEG encoding, coordinate normalization, multi-monitor support |
| **Agent Mode** | Codex runtime management, agent session lifecycle, bundled skills, agent dock with status indicators, voice-agent handoff |
| **Cursor Overlay** | Animated cursor guidance, bezier arc flight, rectangles, scribbles, speech bubbles, secondary proxy cursors, per-screen windows |
| **System Tray** | Left-click panel toggle, right-click menu (Quick Ask, Settings, Quit), agent status indicators |
| **External Bridge** | HTTP API on `localhost:32123` (16 endpoints, REST + SSE), token auth, MCP tools, AI proxy, fully OpenClicky-compatible |
| **CUA Input** | Cross-platform click, double-click, type text, key press, cursor move via `enigo` — rate-limited, bounds-safe |
| **Automations** | Interval/cron scheduling, agent binding, system app discovery |
| **Onboarding** | 4-step permission wizard (mic, screen recording, accessibility, notifications) with OS-specific guidance |
| **Auto-Capture** | Continuous screen context with diff detection, interval/mode config, live status pill, last-frame cache |
| **Voice Discovery** | Drag-to-rotate orbit picker, 5 provider voice lists (ElevenLabs, Cartesia, Deepgram Aura, OpenAI Realtime, Edge), click-to-select with auto-applied accent color |
| **Theming** | System/Light/Dark, glass backdrop, 4 accent color presets + custom color picker |

## Prerequisites

- **Node.js 24+**
- **Rust toolchain** (stable, 1.96+)
- **Platform-specific deps**:
  - **Linux**: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libappindicator3-dev`, `librsvg2-dev`, `libasound2-dev`
  - **Windows**: Visual Studio Build Tools, WebView2
  - **macOS**: Xcode Command Line Tools

See [docs/SETUP.md](docs/SETUP.md) for full details.

## Quick Start

```sh
npm ci
npm run tauri dev       # Development mode with hot reload
npm run tauri build     # Production build
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ClickyX App                            │
├─────────────────────────────────────────────────────────────┤
│  UI Layer: Tray Icon + Floating Panel + Overlay (per-screen)│
├─────────────────────────────────────────────────────────────┤
│  Rust Backend:                                              │
│    ├─ audio/      Capture, STT, TTS, Pipeline, Handoff     │
│    ├─ ai/         Anthropic, OpenAI, Catalog, Vision        │
│    ├─ agent/      Codex, Sessions, Skills, Dock             │
│    ├─ screen/     Capture (xcap), Coordinate Systems        │
│    ├─ overlay/    Cursor/Rect/Scribble, Lifecycle, Screen   │
│    │              Router, Window Manager, Annotation Mgr    │
│    ├─ cua.rs      Click simulation (enigo)                  │
│    ├─ bridge.rs   HTTP API (127.0.0.1:32123)               │
│    ├─ bridge_auth Token auth (constant-time)                │
│    └─ automation/ Cron/interval scheduling                  │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React + TypeScript):                              │
│    ├─ Home        Chat, Screen Preview                     │
│    ├─ Agents      Session Management, Skills, HUD          │
│    ├─ Connections Integrations, Automations, MCP           │
│    └─ Settings    AI, Voice, CUA, Permissions, Logs        │
└─────────────────────────────────────────────────────────────┘
```

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

## Build

```sh
npm run build              # Frontend build (TypeScript + Vite)
cargo check                # Rust compilation check
cargo test                 # Run Rust tests
npm run tauri build        # Full production binary
```

## Configuration

Auto-created on first run:

| Platform | Config Path |
|----------|------------|
| Linux | `~/.config/clickyx/config.json` |
| macOS | `~/Library/Application Support/clickyx/config.json` |
| Windows | `%APPDATA%/clickyx/config.json` |

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for full reference.

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

## Documentation

- [Setup Guide](docs/SETUP.md)
- [Configuration Reference](docs/CONFIGURATION.md)
- [Contributing Guidelines](docs/CONTRIBUTING.md)
- [Feature Specification](docs/FEATURE_SPEC.md)
- [DMG Reverse-Engineering Analysis](docs/CLICKY_APP_ANALYSIS.md)
- **Feature Gap Specs**:
  - [Bridge API Completion](specs/001-bridge-completion/)
  - [Annotation Lifecycle](specs/002-annotation-lifecycle/)
  - [Multi-Monitor Overlay](specs/003-multi-monitor-overlay/)
  - [Streaming Overlay UI](specs/004-streaming-overlay-ui/)
  - [Always-On Voice](specs/005-always-on-voice/)
  - [CUA Click Execution](specs/006-cua-click-execution/)
  - [Skills System](specs/007-skills-system/)
  - [Onboarding & Permissions](specs/008-onboarding-permissions/)

## License

MIT
