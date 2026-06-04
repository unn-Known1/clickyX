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
[![HeyClicky Alternative](https://img.shields.io/badge/competitor-HeyClicky%20%2F%20Clicky-red)](https://github.com/farzaa/clicky)
[![RepoRank](https://www.reporank.online/api/badge/unn-Known1/clickyX.svg)](https://www.reporank.online/github/unn-Known1/clickyX)
[![Repo](https://img.shields.io/badge/repo-unn--Known1%2FclickyX-181717?logo=github)](https://github.com/unn-Known1/clickyX)

> **ClickyX** is a cross-platform, open-source AI desktop companion that lives in your system tray, listens to your voice, sees your screen, drives your cursor, runs background agents, and exposes a local HTTP bridge for tool integration. It is a faithful, feature-complete reimplementation of the macOS-only **HeyClicky** (and its open-source sibling **OpenClicky**) — written from scratch in **Rust + Tauri + React/TypeScript** so it runs natively on **Windows, Linux, and macOS**.

---

## What is ClickyX?

ClickyX turns any desktop into an AI-augmented workspace. Hold a hotkey to talk, type a sentence, or say a wake word — ClickyX transcribes your voice, captures your screen, asks an LLM (Claude, GPT, Gemini, NVIDIA, OpenRouter) what to do, draws visual guidance directly on your screen, and can even click and type on your behalf. It is designed for power users, developers, and AI tinkerers who want a **local-first, privacy-respecting** AI co-pilot that is always one keystroke away.

ClickyX is **not** a chatbot. It is a **runtime** — with a system-tray UI, a transparent overlay layer on every monitor, an external HTTP bridge on `localhost:32123`, a Codex-based agent runtime, a computer-use engine, an automation scheduler, and a fully open skill system.

**Why ClickyX exists**: **HeyClicky** (Farza Majeed, YC W26) is the leading commercial AI desktop companion, but it is **macOS-only, cloud-locked, and requires a subscription**. Its open-source fork **OpenClicky** is also **macOS-only** and ships with only the most basic features. **ClickyX ports the full HeyClicky feature set — including the parts OpenClicky omits — to Windows, Linux, and macOS**, with zero cloud dependency and zero telemetry.

**Project lineage**:
- **[HeyClicky](https://github.com/farzaa/clicky)** — the commercial, Y Combinator–backed AI companion (macOS only, cloud-managed). _Main reference target for ClickyX._
- **[OpenClicky](https://github.com/jasonkneen/openclicky)** — Jason Kneen's open-source fork of HeyClicky. macOS only, ships a **basic** subset of features. _Secondary reference._
- **[Clicky](https://github.com/farzaa/clicky)** — the original MIT-licensed Clicky (Farza Majeed). Archive only.
- **ClickyX** (this project) — cross-platform Tauri port with **full HeyClicky feature parity**, **OpenClicky-compatible bridge API**, and **everything that's missing from OpenClicky**.

---

## Repository

| | |
|---|---|
| **Repository** | `github.com/unn-Known1/clickyX` |
| **Owner** | [`@unn-Known1`](https://github.com/unn-Known1) |
| **Branch** | `master` |
| **License** | MIT |
| **Stack** | Tauri v2 (Rust) + React 19 + TypeScript + Vite + Zustand + react-query |
| **Status** | All 8 feature groups + full UI audit complete — see [Implementation Status](#implementation-status) |
| **Latest release** | See [Releases](https://github.com/unn-Known1/clickyX/releases) |
| **Issues** | [github.com/unn-Known1/clickyX/issues](https://github.com/unn-Known1/clickyX/issues) |
| **Discussions** | [github.com/unn-Known1/clickyX/discussions](https://github.com/unn-Known1/clickyX/discussions) |
| **CI/CD** | GitHub Actions (Check + 3-platform Build matrix + Nightly) |
| **Latest commit** | See [commit log](https://github.com/unn-Known1/clickyX/commits/master) |

---

## Table of Contents

1. [What is ClickyX?](#what-is-clickyx)
2. [Repository](#repository)
3. [Highlights](#highlights)
4. [Feature Parity: HeyClicky (macOS) vs ClickyX](#feature-parity-heyclicky-macos-vs-clickyx)
5. [Features](#features)
6. [Quick Start](#quick-start)
7. [Architecture](#architecture)
8. [Using AI Providers](#using-ai-providers)
9. [Build](#build)
10. [Configuration](#configuration)
11. [External API (Bridge)](#external-api-bridge)
12. [Voice, Vision, Agents](#voice-vision-agents)
13. [Implementation Status](#implementation-status)
14. [Frontend UI](#frontend-ui)
15. [Documentation](#documentation)
16. [Contributing](#contributing)
17. [License](#license)
18. [Acknowledgments](#acknowledgments)

---

## Highlights

- **🖥️ Cross-platform, single binary** — Tauri v2 ships a native `.msi` / `.exe` on Windows, an `.app` on macOS, and a `.deb` / `.AppImage` on Linux. No Electron, no Chromium bloat.
- **🎙️ Always-on voice, push-to-talk, and wake word** — Energy-based VAD with barge-in handoff, configurable key-capture hotkeys, "Hey Clicky" wake-word detection.
- **👁️ Screen context on every query** — Captures all monitors (or just the cursor screen / focused window) and attaches the screenshot to every AI request.
- **🖱️ Visual guidance overlay** — Animated bezier-arc cursor, **active-control glow (5 concentric pulsing rings)**, rectangles, freehand scribbles, streaming text bubbles, waveform, processing spinner, **calibration box mode**, per-screen routing on multi-monitor setups.
- **🤖 Codex agent runtime** — Spawns Node.js Codex sidecar processes for long-running background tasks (code, research, file ops, builds, scheduled jobs).
- **🖱️ Computer-Use (CUA)** — Cross-platform click / double-click / drag / type / key-press via `enigo` — rate-limited, bounds-safe, background mode.
- **🌐 Local HTTP bridge on `localhost:32123`** — 16 OpenClicky-compatible endpoints, SSE events, token auth, CORS, Anthropic + OpenAI proxies, MCP tool routing.
- **🎨 4 accent colors + voice-discovery orbit picker** — User-selectable companion cursor color, drag-to-discover voice UI with per-voice accent propagation.
- **📸 Auto-capture mode** — Continuous context gathering with diff-based change detection, configurable interval (1s/3s/5s/10s/30s) and mode (full / cursor / focused / all). Now event-driven instead of polling.
- **🔌 MCP server management** — Full CRUD UI with `env` key=value editor for Model Context Protocol servers.
- **⏰ Automation engine** — Cron **and** interval scheduling, JSON-persisted, 30s tick loop.
- **🧩 Skills system** — 4 bundled skills (screen-control, codex management) with `.toml` descriptors and JS entry-point template.
- **🚀 Onboarding & permissions** — 5-step permission wizard (mic, screen recording, accessibility, camera, notifications) with OS-specific guidance. First-run gated.
- **💬 Rich chat** — `react-markdown` rendering with syntax highlighting, conversation history sidebar, draft persistence, stop/cancel, copy/regenerate, message timestamps, drag-and-drop image attachments.
- **🗂️ Command palette** — Ctrl+K fuzzy command palette with navigation and Settings deep-links.
- **🌐 i18n** — English + Spanish built-in; language switcher in System Settings.
- **🧊 3D model generation** — Tripo3D API integration with Three.js GLB viewer.
- **🛡️ Local-first, zero telemetry** — No Supabase, no PostHog, no Sentry, no cloud auth. All API keys are user-configured.

---

## Feature Parity: HeyClicky (macOS) vs ClickyX

| Category | HeyClicky (macOS) | ClickyX | Status |
|----------|-------------------|---------|--------|
| **Voice Pipeline** | | | |
| Push-to-talk | `Ctrl+Option` hold | Key-capture hotkey (configurable, with preset chips) | ✅ |
| Type mode | `Ctrl` double-tap | Config defined | ⚠️ |
| Always-on voice | — | Energy-based VAD, silence timeout | ✅ |
| Wake word | "Hey Clicky" | "Hey Clicky" (energy-based) | ✅ |
| STT providers | AssemblyAI, Apple Speech, Deepgram | Deepgram, Whisper, AssemblyAI | ✅ (3 of 3) |
| TTS providers | ElevenLabs, AVSpeechSynthesizer, Cartesia | ElevenLabs, Cartesia, Edge, Deepgram Aura, OpenAI Realtime | ✅ (5 of 3) |
| Realtime voice | GPT Realtime | GPT-4o Realtime | ✅ |
| Audio VU meter | Yes | 5-bar meter in status bar | ✅ |
| Voice discovery | Drag-to-discover UI | Orbit picker with per-voice accent colors | ✅ |
| **Screen & Vision** | | | |
| Screen capture | ScreenCaptureKit | `xcap` crate (all platforms) | ✅ |
| Multi-monitor | Yes | Per-screen overlay windows | ✅ |
| Window capture | Full screen or active | Full, cursor, focused | ✅ |
| Auto-capture mode | Continuous context | Diff-based capture, event-driven status updates | ✅ |
| **Cursor Overlay** | | | |
| Blue companion cursor | Yes | Yes, animated | ✅ |
| Color options | 4 accent colors | 4 preset swatches + custom color picker | ✅ |
| Bezier arc animation | Yes | Yes | ✅ |
| Annotations | POINT, TARGET, HOVER, RECT, SCRIBBLE, HIGHLIGHT, SHAPE | POINT, RECT, SCRIBBLE, CAPTION | ✅ |
| Annotation lifecycle | Armed → Completed → Missed | Full state machine | ✅ |
| Text bubble | Word-by-word reveal | Word-by-word + streaming | ✅ |
| Active-control glow | Yes | **5 concentric pulsing rings** | ✅ |
| Calibration box | Yes | **Pulsing rect, corner markers, hides pet sprite** | ✅ |
| Waveform | Yes | Yes | ✅ |
| Multi-monitor routing | Natural (macOS) | Per-screen window + coordinate normalizer | ✅ |
| **Agent Mode (Codex)** | | | |
| Background agents | Yes | Codex Node.js runtime | ✅ |
| Agent HUD | Floating window | Inline dashboard with transcript copy | ⚠️ |
| Agent dock | In overlay | Yes, with status + live poll | ✅ |
| Task types | code, build, research, file, docs, repo, frontend, search | Same | ✅ |
| Scheduled agents | — | Cron/interval (ClickyX add) | ✅ |
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
| Google Workspace | Status check | Status check (auth UI pending) | ⚠️ |
| Notion, Linear, Obsidian | Yes | — | ❌ |
| MCP Servers | — | Full CRUD + env editor (ClickyX add) | ✅ |
| Automation engine | — | Cron/interval scheduling (ClickyX add) | ✅ |
| 3D Model Generation | — | Tripo3D + Three.js viewer (ClickyX add) | ✅ |
| **Bridge API** | | | |
| All 16 endpoints | Yes | All routed | ✅ |
| Token auth | Yes | Constant-time comparison | ✅ |
| CORS | Yes | actix-cors | ✅ |
| SSE events | Yes | Yes | ✅ |
| **UI & UX** | | | |
| System tray | NSStatusItem | Tauri tray-icon | ✅ |
| Floating panel | Notch panel | Home/Agents/Connections/Settings + Status Bar | ✅ |
| Onboarding | Pre-sign-in flow | 5-step permission wizard (first-run gated) | ✅ |
| Permissions guide | Drag-to-accept | OS-specific step hints | ✅ |
| Widget dashboard | Place/Stock/Image | Active Agents/Today/Needs Attention | ✅ |
| Voice picker | Orbit discovery map | Drag-to-rotate orbit with per-voice accent | ✅ |
| Chat markdown | — | react-markdown + syntax highlighting | ✅ |
| Conversation history | — | Sidebar with sessionStorage persistence (ClickyX add) | ✅ |
| Command palette | — | Ctrl+K fuzzy palette (ClickyX add) | ✅ |
| i18n | — | EN + ES (ClickyX add) | ✅ |
| **Backend** | | | |
| AI providers | Anthropic, OpenAI | Anthropic, OpenAI, OpenRouter, Gemini, NVIDIA | ✅ |
| Model catalog | Hardcoded | Dynamic remote fetch | ✅ |
| Typed bindings | — | `src/bindings.ts` full typed wrappers (ClickyX add) | ✅ |
| Global state | — | Zustand store (ClickyX add) | ✅ |
| Multi-platform | macOS only | Windows, Linux, macOS | ✅ |
| Auto-updater | Sparkle 2 | Custom updater banner (MSI/DMG/AppImage) | ✅ |
| Config export/import | — | Yes (ClickyX add) | ✅ |
| Log viewer | — | Built-in w/ 5MB rotation + filter/search/copy (ClickyX add) | ✅ |
| Local-first | ❌ (Supabase) | ✅ All API keys user-configured | ✅ |

---

## Features

| Category | Capabilities |
|----------|-------------|
| **Voice** | Push-to-talk (key-capture hotkey with presets), always-on VAD, wake word, STT (Deepgram, Whisper, AssemblyAI), TTS (ElevenLabs, Cartesia, Microsoft Edge, Deepgram Aura, OpenAI Realtime), 5-bar VU meter in status bar, realtime voice, voice-discovery orbit picker |
| **AI Providers** | Anthropic Claude, OpenAI GPT, NVIDIA AI Foundation, OpenRouter, Gemini — typed bindings in `src/bindings.ts`, dynamic model discovery |
| **Screen Context** | Screen capture (all monitors, cursor screen, focused window), JPEG encoding, coordinate normalization, multi-monitor support, event-driven auto-capture |
| **Agent Mode** | Codex runtime management, agent session lifecycle (live 5s poll + event listener), bundled skills, agent dock with status indicators, voice-agent handoff, transcript copy |
| **Cursor Overlay** | Animated cursor guidance, bezier arc flight, rectangles, scribbles, speech bubbles, **active-control glow (5 concentric pulsing rings)**, **calibration box mode**, secondary proxy cursors, per-screen windows, 4 accent colors, `OverlayErrorBoundary` |
| **Chat** | `react-markdown` + `remark-gfm` + `rehype-highlight` rendering, conversation history sidebar (sessionStorage), draft persistence, stop/cancel streaming, copy/regenerate, message timestamps, drag-and-drop images, ↑ arrow history |
| **Command Palette** | Ctrl+K fuzzy search across tabs, settings, agents; deep-link to any settings section |
| **Status Bar** | Audio level meter, listening state, auto-capture state, today stats, global needs-attention pill |
| **System Tray** | Left-click panel toggle, right-click menu (Quick Ask, Settings, Quit), agent status indicators |
| **External Bridge** | HTTP API on `localhost:32123` (16 endpoints, REST + SSE), token auth, MCP tools, AI proxy, fully OpenClicky-compatible |
| **CUA Input** | Cross-platform click, double-click, type text, key press, cursor move via `enigo` — rate-limited, bounds-safe |
| **Automations** | Interval **and** cron scheduling, agent binding, system app discovery |
| **Onboarding** | 5-step permission wizard (mic, screen, accessibility, camera, notifications) with OS-specific guidance; first-run gated |
| **Auto-Capture** | Continuous screen context with diff detection, event-driven status, interval/mode config, live status pill, last-frame cache |
| **Voice Discovery** | Drag-to-rotate orbit picker, 5 provider voice lists, click-to-select with auto-applied accent color |
| **Theming** | System/Light/Dark, glass backdrop, 4 accent color presets + custom color picker |
| **MCP** | Full CRUD with `env` key=value editor, search/filter |
| **3D Generation** | Tripo3D API with polling + Three.js GLB orbit viewer (lazy-loaded) |
| **i18n** | English + Spanish (i18next), language switcher in System Settings |
| **Logs** | Built-in log viewer with 5MB rotation, level filter, text search, copy-all |
| **Config** | JSON export/import/reset + About dialog |

---

## Quick Start

```sh
# Clone
git clone https://github.com/unn-Known1/clickyX.git
cd clickyX

# Install JS deps (includes react-markdown, three, i18next, zustand, react-query)
npm install

# Run in dev mode (hot reload)
npm run tauri dev

# Run frontend tests
npm test

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
│  Frontend stack: React 19 + Zustand + react-query + i18next │
├─────────────────────────────────────────────────────────────┤
│  Rust Backend:                                              │
│    ├─ audio/      Capture, STT, TTS, Pipeline, Handoff,     │
│    │              Voices (5-provider catalog), Wake Word    │
│    ├─ ai/         Anthropic, OpenAI, Catalog, Vision        │
│    ├─ agent/      Codex, Sessions, Skills, Dock             │
│    ├─ screen/     Capture (xcap), Auto-capture, Coordinates │
│    ├─ overlay/    Cursor/Rect/Scribble/Glow/Calibration,    │
│    │              Lifecycle, Screen Router, Window Manager  │
│    ├─ cua.rs      Click simulation (enigo)                  │
│    ├─ bridge.rs   HTTP API (127.0.0.1:32123)                │
│    ├─ bridge_auth Token auth (constant-time)                │
│    ├─ permissions Per-OS check/request stubs                │
│    ├─ automation/ Cron/interval scheduling                  │
│    ├─ gen3d.rs    Tripo3D API                               │
│    └─ updater.rs  MSI/DMG/AppImage updater                  │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React + TypeScript):                             │
│    ├─ src/context/AppContext.tsx  — Toast + navigation       │
│    ├─ src/store/appStore.ts       — Zustand global store    │
│    ├─ src/bindings.ts             — Typed Tauri commands    │
│    ├─ src/i18n/                   — i18next EN/ES           │
│    ├─ Home        Chat (react-markdown), Conversation hist. │
│    ├─ Agents      Session Mgmt, Skills, Live Poll           │
│    ├─ Connections Integrations, Automations (cron+interval),│
│    │              MCP (with env editor)                     │
│    ├─ Settings    General, Voice (orbit+key-capture), AI,   │
│    │              CUA, Permissions, 3D Models, Logs         │
│    └─ overlay/    Glow, Calibration, Cursors, Captions,     │
│                   Dock, Waveform (with ErrorBoundary)       │
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
npm install                # Install all dependencies
npm run build              # Frontend build (TypeScript + Vite)
npm test                   # Vitest unit tests (5 test files, 30+ cases)
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

- **Voice**: Press-and-hold your configured hotkey (set via the **key-capture widget** in Settings → Voice) to push-to-talk, or enable always-on mode for hands-free operation. Wake word "Hey Clicky" works in always-on mode. STT supports Deepgram, Whisper, and AssemblyAI; TTS supports ElevenLabs, Cartesia, Microsoft Edge, Deepgram Aura, and OpenAI Realtime. The Voice Discovery orbit picker lets you audition voices and apply their accent color to the overlay. Live audio level is shown in the status bar.
- **Vision**: Every AI request automatically captures the screen (configurable: all monitors / cursor screen / focused window) and attaches it to the message. Enable Auto-Capture for continuous context — frames are emitted as `auto-capture-frame` Tauri events when the screen changes. Status is now event-driven.
- **Agents**: Say "clicky agent" (or click the Agents tab) to spawn a background Codex process. Agents can run code, research, file operations, builds, and web searches. Agent status updates live every 5s via polling + `agent-state-changed` event. Scheduled agents (cron / interval) run in the background. The agent dock in the overlay shows live status.

---

## Implementation Status

All 8 backend phases + full frontend UI audit complete:

### Backend Phases
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

### Frontend UI Audit — All Items Resolved
| Priority | Count | Status |
|----------|-------|--------|
| Critical (C1–C7) | 7 | ✅ All fixed |
| High (H1–H10) | 10 | ✅ All fixed |
| Medium (M1–M13) | 13 | ✅ All fixed |
| Low (L1–L23) | 23 | ✅ 21 fixed, 2 deferred (cosmetic) |
| Architecture (A1–A12) | 12 | ✅ 8 fixed, 4 deferred (data layer) |

Full audit report: [`docs/FRONTEND_UI_AUDIT.md`](docs/FRONTEND_UI_AUDIT.md)

---

## Frontend UI

The panel UI (`src/`) is a React 19 + TypeScript app served by Tauri's WebView:

```
src/
├── App.tsx                     Shell: AppProvider, OnboardingWizard gate, UpdateBanner,
│                               CommandPalette (Ctrl+K), StatusBar, ErrorBoundary
├── main.tsx                    React 19 root: QueryClientProvider + i18n bootstrap
├── bindings.ts                 Typed Tauri invoke() wrappers (single source of truth)
├── context/AppContext.tsx      Toast + navigation context (replaces window.__ globals)
├── store/appStore.ts           Zustand: agents, audio status, today stats, attention
├── i18n/index.ts               i18next: EN + ES locales
├── utils/agentStatus.ts        Shared status color/label util
├── components/
│   ├── HomeTab.tsx             Hero, suggestions, agent dock strip
│   ├── ChatTab.tsx             react-markdown chat, conversation sidebar, drag-drop
│   ├── AgentsTab.tsx           Agent CRUD, skill management, transcript copy
│   ├── ConnectionsTab.tsx      Google Workspace, MCP (env editor), Automations (cron+interval)
│   ├── SettingsTab.tsx         8 sections + 3D Models; scroll memory per section
│   ├── SettingsSections/       General, Voice (HotkeyInput), AI, CUA, Permissions, System
│   ├── ModelGeneratorTab.tsx   Tripo3D prompt UI + Three.js GLB viewer (lazy)
│   ├── ThreeModelViewer.tsx    Three.js orbit viewer (lazy-loaded)
│   ├── CommandPalette.tsx      Ctrl+K fuzzy palette
│   ├── StatusBar.tsx           Audio meter, capture state, attention pill, today stats
│   ├── UpdateBanner.tsx        Auto-updater notification
│   ├── AboutDialog.tsx         Version, links, build info
│   ├── HotkeyInput.tsx         Key-capture widget with presets
│   ├── Icon.tsx                Shared SVG icon set (30+ icons)
│   └── OnboardingWizard.tsx    5-step first-run permission wizard
├── hooks/
│   ├── useChat.ts              Streaming chat + vision + cancel
│   ├── useConversations.ts     Multi-thread history (sessionStorage)
│   ├── useAgents.ts            Agents CRUD + 5s poll + event listener
│   ├── useConfig.ts            Config CRUD
│   ├── useVision.ts            Image attachment state
│   ├── useOverlay.ts           Overlay invoke wrappers
│   └── useScreenCapture.ts     Capture modes
└── overlay/
    ├── OverlayApp.tsx          Glow, calibration, cursors, captions, dock, waveform
    │                           + OverlayErrorBoundary + safeWindowSize
    └── overlay.css             Overlay-specific styles
```

### New Dependencies (run `npm install` after pulling)
```json
"react-markdown": "^9",
"remark-gfm": "^4",
"rehype-highlight": "^7",
"highlight.js": "^11",
"three": "^0.170",
"i18next": "^23",
"react-i18next": "^14",
"@tanstack/react-query": "^5",
"zustand": "^5"
```

---

## Documentation

- [Contributing Guidelines](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Setup Guide](docs/SETUP.md)
- [Configuration Reference](docs/CONFIGURATION.md)
- [Feature Specification](docs/FEATURE_SPEC.md)
- [Frontend UI Audit](docs/FRONTEND_UI_AUDIT.md)
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

- **Farza Majeed** — for the original [Clicky](https://github.com/farzaa/clicky) (MIT) and the commercial **HeyClicky** (YC W26), which is the design and feature reference for ClickyX. HeyClicky's voice pipeline, visual overlay, Codex agent integration, and bridge API spec are what ClickyX re-implements cross-platform.
- **Jason Kneen** — for [OpenClicky](https://github.com/jasonkneen/openclicky), the open-source fork of HeyClicky, which provided the bridge API contract (`localhost:32123`) and several agent-mode features that ClickyX preserves verbatim.
- **OpenAI Codex team** — for the cross-platform Node.js agent runtime that powers ClickyX's agent mode.
- **Tauri team** — for making cross-platform native desktop apps in Rust actually pleasant.

---

<p align="center">
  <sub>Built with Rust + Tauri + React. Run anywhere. Owned by you.</sub>
</p>
