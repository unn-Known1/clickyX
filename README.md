# ClickyX

[![CI/CD](https://github.com/unn-Known1/clickyX/actions/workflows/ci.yml/badge.svg)](https://github.com/unn-Known1/clickyX/actions/workflows/ci.yml)
[![cargo check](https://img.shields.io/badge/cargo-check-brightgreen)](https://github.com/unn-Known1/clickyX)
[![npm build](https://img.shields.io/badge/npm-build-brightgreen)](https://github.com/unn-Known1/clickyX)

Cross-platform AI companion — a port of [OpenClicky](https://github.com/jasonkneen/openclicky) for Windows, Linux, and macOS. System-tray AI with voice, screen context, agent mode, cursor overlay, and external HTTP API control.

Built with **Tauri v2** (Rust backend + React/TypeScript frontend).

## Features

| Category | Capabilities |
|----------|-------------|
| **Voice** | Push-to-talk, STT (Deepgram, OpenAI Whisper, AssemblyAI), TTS (ElevenLabs, Cartesia, Microsoft Edge, Deepgram Aura), wake word, VU meter |
| **AI Providers** | Anthropic Claude, OpenAI GPT, **NVIDIA AI Foundation** (OpenAI-compatible endpoint), extensible provider system with dynamic model discovery |
| **Screen Context** | Screen capture (all monitors, cursor screen, focused window), JPEG encoding, coordinate normalization |
| **Agent Mode** | Codex runtime management, agent session lifecycle, bundled skills (screen control, codex), agent dock with status indicators |
| **Cursor Overlay** | Animated cursor guidance, bezier arc flight, rectangles, scribbles, speech bubbles, secondary proxy cursors |
| **System Tray** | Left-click panel toggle, right-click menu (Quick Ask, Settings, Quit), agent status indicators |
| **External Bridge** | HTTP API on `localhost:32123` (REST + SSE), MCP tools, AI proxy endpoints, fully OpenClicky-compatible |
| **Automations** | Interval/cron scheduling, agent binding, system app discovery |
| **Theming** | System/Light/Dark, glass backdrop, configurable accent colors |

## Prerequisites

- **Node.js 24+**
- **Rust toolchain** (stable, 1.96+)
- **Platform-specific deps**:
  - **Linux**: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libappindicator3-dev`, `librsvg2-dev`
  - **Windows**: Visual Studio Build Tools
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
┌─────────────────────────────────────────────────────┐
│                   ClickyX App                        │
├─────────────────────────────────────────────────────┤
│  UI Layer: System Tray + Floating Panel + Overlay    │
├─────────────────────────────────────────────────────┤
│  Rust Backend:                                       │
│    ├─ audio/     Capture, STT, TTS, Pipeline        │
│    ├─ ai/        Anthropic, OpenAI, Catalog, Vision │
│    ├─ agent/     Codex, Sessions, Skills, Dock      │
│    ├─ screen/    Capture, Coordinate Systems        │
│    ├─ bridge.rs  HTTP API (127.0.0.1:32123)         │
│    └─ overlay.rs Cursor Guidance, Visual Elements   │
├─────────────────────────────────────────────────────┤
│  Frontend (React + TypeScript):                      │
│    ├─ Home       Chat, Screen Preview               │
│    ├─ Agents     Session Management, Skills         │
│    ├─ Connections Integrations, Automations         │
│    └─ Settings   All Configuration Sections         │
└─────────────────────────────────────────────────────┘
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
| POST | `/rectangle` | Draw rectangle |
| POST | `/scribble` | Draw freehand path |
| POST | `/caption` | Show caption text |
| POST | `/speak` | Text-to-speech |
| POST | `/click` | Left-click coordinates |
| POST | `/v1/messages` | Anthropic proxy |
| POST | `/v1/responses` | OpenAI proxy |

## Documentation

- [Setup Guide](docs/SETUP.md)
- [Configuration Reference](docs/CONFIGURATION.md)
- [Contributing Guidelines](docs/CONTRIBUTING.md)
- [Feature Specification](docs/FEATURE_SPEC.md)
- [Phase 1: Core Foundation](specs/001-core-foundation/)
- [Phase 2: Voice Pipeline](specs/002-voice-pipeline/)
- [Phase 3: AI Integration](specs/003-ai-integration/)
- [Phase 4: Agent Mode](specs/004-agent-mode/)
- [Phase 5: Screen Context & Overlay](specs/005-screen-context-overlay/)
- [Phase 6: Advanced Features](specs/006-advanced-features/)
- [Phase 7: Polish & Distribution](specs/007-polish-distribution/)

## License

MIT
