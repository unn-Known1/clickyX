# ClickyX

[![CI/CD](https://github.com/unn-Known1/clickyX/actions/workflows/ci.yml/badge.svg)](https://github.com/unn-Known1/clickyX/actions/workflows/ci.yml)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20Linux%20%7C%20macOS-blue)](https://github.com/unn-Known1/clickyX/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-orange)](https://tauri.app)
[![Rust](https://img.shields.io/badge/rust-stable-blueviolet)](https://www.rust-lang.org)
[![Version 0.2.3](https://img.shields.io/badge/version-0.2.3-informational)](https://github.com/unn-Known1/clickyX/releases/tag/v0.2.3)
[![Local-First](https://img.shields.io/badge/local--first-yes-success)]()
[![Telemetry](https://img.shields.io/badge/telemetry-none-success)]()

> Cross-platform AI desktop companion — voice, screen context, cursor overlay, background agents, computer use, chat co-pilot, and a local HTTP bridge. Runs on Windows, Linux, and macOS. Free, open-source, offline-capable. Zero cloud dependency, zero telemetry.

---

## What is ClickyX?

ClickyX is a **Rust + Tauri + React** reimplementation of [HeyClicky](https://github.com/farzaa/clicky) (the leading macOS-only AI desktop companion by Farza Majeed, YC W26) — built from scratch to run natively on all three major desktop platforms with no subscription, no telemetry, and no hosted services.

It is not a chatbot. It is a **runtime**: system-tray UI, transparent per-screen overlay, `localhost:32123` HTTP bridge, Codex agent runtime, computer-use engine, automation scheduler, and a full skill system — all user-owned and locally operated.

**New in 0.2.3 — Jarvis chat co-pilot + TypeSafe Jev decisions:** the focused window is judged by the Jev System-One decision model (intent, danger 1–9, should-reply), your chat model drafts 3 replies, Jev ranks them, and the winner is pasted **fill-only — never auto-sent**. WeChat/banking windows are hard-blocked, and every run shows exactly what was read plus its judge cost. See [docs/JEV_JARVIS_IMPLEMENTATION_REPORT.md](docs/JEV_JARVIS_IMPLEMENTATION_REPORT.md) and [docs/PRIVACY.md](docs/PRIVACY.md).

---

## Quick Start

```sh
git clone https://github.com/unn-Known1/clickyX.git
cd clickyX
npm install
npm run tauri dev        # hot-reload dev mode
npm test                 # Vitest unit tests
npm run tauri build      # production binary
```

Artifacts land in `src-tauri/target/release/bundle/`:
- **Windows** — `.msi` and `.exe`
- **macOS** — `.dmg` and `.app`
- **Linux** — `.deb` and `.AppImage`

---

## Feature Overview

| Category | What's included |
|----------|----------------|
| **Voice** | Push-to-talk (key-capture, 5 presets), always-on VAD with barge-in suppression, wake word "Hey Clicky", STT (Deepgram/Whisper/AssemblyAI), TTS (ElevenLabs/Cartesia/Edge/Deepgram Aura/OpenAI Realtime/**System TTS — offline, no key**), drag-to-rotate voice-discovery orbit picker |
| **Screen** | All-monitor / cursor / focused-window capture via `xcap`, auto-capture with diff detection, coordinate normalization, multi-monitor per-screen overlay routing |
| **Overlay** | Animated bezier-arc cursor, 5-ring active-control glow, calibration box, rectangles, scribbles, captions, streaming text bubble, real-amplitude waveform, agent dock, HIGHLIGHT/SHAPE annotation tags, display hotplug detection; pet sprite visible only during active AI operations |
| **Agents** | Codex Node.js sidecar, session lifecycle, floating HUD window, 64 bundled skills, voice-agent handoff, file drag-drop onto cards |
| **Computer Use** | `enigo`-based click/double-click/scroll/type/key on all platforms; background mode (no cursor warp); app-specific CUA context injection |
| **Chat** | react-markdown + syntax highlighting, conversation sidebar, per-session stream scoping, draft persistence, stop/cancel, drag-drop images, model selector filtered to configured providers |
| **Jarvis co-pilot** ✨ | Judge → draft-3 → rank → fill-only paste for any chat app; danger/intent badges, what-was-read + cost, blocklist, encrypted local KB, `Ctrl+Shift+J`, opt-in auto-trigger |
| **Decisions (Jev)** | TypeSafe System-One `choice`/`noul`/`score` over OpenRouter, TypeSafe-direct, Bocha, Vercel, or Zen; presets + connectivity test in Settings |
| **Connections** | Google Workspace (status shown, OAuth2 setup required), MCP CRUD (real stdio JSON-RPC), automation cron/interval + run history, app usage log |
| **Bridge API** | 29+ endpoints on `localhost:32123` — REST + SSE, token auth, CORS, Anthropic/OpenAI proxy, MCP tool routing, `/jarvis/*` co-pilot tier (full reference: `docs/BRIDGE_API.md`) |
| **Automations** | Cron + interval scheduling, JSON persistence, agent binding, run history |
| **3D Generation** | Tripo3D API + Three.js GLB orbit viewer |
| **Theming** | 6 named accent variants, system/light/dark, semantic CSS tokens |
| **i18n** | EN, ES, FR, JA via i18next |
| **Tests** | Vitest unit + Playwright E2E + Playwright visual regression |

---

## Architecture

```
┌───────────────────────────────────────────────────────┐
│  System Tray + Floating Panel + Per-Screen Overlay    │
│  React 19 · Zustand · react-query · i18next           │
├───────────────────────────────────────────────────────┤
│  Rust Backend (src-tauri/src/)                        │
│  audio/   VAD · STT · TTS · wake word · handoff        │
│  ai/      Anthropic · OpenAI · Jev decisions · guidance tag parser │
│  jarvis/   blocklist · extract · judge · kb.enc · fill-only paste  │
│  agent/   Codex · sessions · 64 skills · dock         │
│  screen/  xcap · auto-capture · coordinates           │
│  overlay/ cursors · glow · lifecycle · screen router  │
│  cua.rs   enigo input (native + background mode)      │
│  bridge.rs  HTTP API 127.0.0.1:32123 (+ /jarvis/* tier)        │
│  permissions  real TCC/registry/pactl checks          │
│  automation/  cron + interval scheduler               │
├───────────────────────────────────────────────────────┤
│  Frontend (src/)                                      │
│  App.tsx · AppContext · appStore (Zustand)            │
│  bindings.ts — typed invoke() wrappers                │
│  hooks/ useConfig · useAgents (react-query)            │
│  overlay/ OverlayApp — glow · waveform · dock         │
└───────────────────────────────────────────────────────┘
```

---

## Configuration

Auto-created on first run:

| Platform | Path |
|----------|------|
| Linux | `~/.config/clickyx/config.json` |
| macOS | `~/Library/Application Support/clickyx/config.json` |
| Windows | `%APPDATA%/clickyx/config.json` |

Full schema: [docs/CONFIGURATION.md](docs/CONFIGURATION.md)

---

## AI Providers

Configure keys in **Settings → AI Providers**:

| Provider | Key format | Notes |
|----------|-----------|-------|
| Anthropic | `sk-ant-...` | Claude models |
| OpenAI | `sk-proj-...` | GPT + realtime voice |
| ElevenLabs | `xi-...` | TTS |
| Deepgram | `dg-...` | STT WebSocket |
| AssemblyAI | — | STT HTTP |
| NVIDIA / OpenRouter | any | Set custom Base URL under OpenAI section |
| TypeSafe Jev | Jev / OpenRouter / Gateway key | Decision models (`choice`/`noul`/`score`) — configured in **Settings → Jev Jarvis**, never used for chat |

---

## External HTTP Bridge

`localhost:32123` — compatible with OpenClicky's spec.

```sh
# Health check
curl http://localhost:32123/health

# Capture screen and get base64 image
curl -X POST http://localhost:32123/screenshot \
     -H "x-openclicky-token: YOUR_TOKEN"

# Show cursor at coordinates
curl -X POST http://localhost:32123/cursor \
     -H "Content-Type: application/json" \
     -d '{"x": 500, "y": 300, "label": "here"}'
```

Full endpoint reference: [docs/BRIDGE_API.md](docs/BRIDGE_API.md)

The `/jarvis/*` tier (`analyze`/`fill`/`status`/`test`) exposes the co-pilot over HTTP and is always token-gated — same tier as clicks and screenshots.

---

## Why ClickyX?

- **HeyClicky alternative for Windows and Linux** — the macOS-only companion, reimplemented natively for all three desktop OSes.
- **Free and open-source (MIT)** — no subscription, no seat limits, no hosted OAuth.
- **Private by design** — local-first, no telemetry, keychain-backed keys, encrypted stores; read [docs/PRIVACY.md](docs/PRIVACY.md) and [SECURITY.md](SECURITY.md).
- **Offline-capable** — System TTS, local skills, and file-backed config work with no network; only your chosen AI endpoints are ever contacted.
- **Scriptable** — 29+ bridge endpoints plus MCP stdio routing automate the whole runtime from any local process.

Keywords: AI desktop assistant, voice assistant, computer use agent, screen-aware chatbot, chat co-pilot, auto-reply drafts, Windows AI companion, Linux AI assistant, macOS productivity app, open-source, self-hosted, privacy-first, Tauri, Rust.

---

## Build & Test

```sh
npm install                      # install JS deps
npm run build                    # tsc + vite (frontend)
npm test                         # Vitest unit tests
npm run test:e2e                 # Playwright E2E
npm run test:visual              # visual regression
npm run test:visual:update       # update baselines
cargo check                      # Rust compile check
cargo test --all-features        # Rust unit tests
npm run tauri build              # full production binary
```

---

## Documentation

| File | Purpose |
|------|---------|
| [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md) | Full feature specification, architecture, implementation details |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Complete config schema reference |
| [docs/BRIDGE_API.md](docs/BRIDGE_API.md) | `localhost:32123` endpoint reference |
| [docs/JEV_JARVIS_IMPLEMENTATION_REPORT.md](docs/JEV_JARVIS_IMPLEMENTATION_REPORT.md) | Jev + Jarvis design, API surfaces, phased plan |
| [docs/PRIVACY.md](docs/PRIVACY.md) | What Jarvis reads, where it goes, how to wipe it |
| [docs/SETUP.md](docs/SETUP.md) | Developer environment setup |
| [AGENTS.md](AGENTS.md) | AI coding agent instructions for this codebase |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines |
| [SECURITY.md](SECURITY.md) | Security policy |

---

## Contributing

Pull requests, bug reports, and feature requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

1. Fork the repo
2. Create a branch: `git checkout -b feat/your-feature`
3. Commit: `git commit -m 'feat: add ...'`
4. Push and open a PR against `master`

---

## License

[MIT](LICENSE) — free for personal and commercial use.

---

## Acknowledgments

- **Farza Majeed** — for [HeyClicky](https://github.com/farzaa/clicky) (YC W26), the design and feature reference for ClickyX
- **Jason Kneen** — for [OpenClicky](https://github.com/jasonkneen/openclicky), which defined the `localhost:32123` bridge contract
- **OpenAI Codex team** — for the cross-platform Node.js agent runtime
- **Tauri team** — for making cross-platform native desktop apps in Rust practical
- **TypeSafe AI** — for the Jev System-One decision model (user key, user endpoint)
- **[jev-chat-jarvis](https://github.com/jev-chat/jev-chat-jarvis)** (MIT) — the chat co-pilot pattern that inspired Jarvis mode; see `LICENSE`/`NOTICE`

---

<p align="center"><sub>Built with Rust + Tauri + React · Run anywhere · Owned by you</sub></p>
