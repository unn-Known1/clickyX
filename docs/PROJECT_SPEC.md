# ClickyX — Project Specification

> **Last updated:** 2026-06-04
> **Repo:** `github.com/unn-Known1/clickyX`
> **Stack:** Tauri v2 (Rust) + React 19 + TypeScript + Vite + Zustand + react-query

---

## 1. What is ClickyX

ClickyX is a cross-platform, open-source AI desktop companion that lives in the system tray, listens to voice, sees the screen, drives the cursor, runs background agents, and exposes a local HTTP bridge for tool integration.

It is a faithful reimplementation of **HeyClicky** (Farza Majeed, YC W26) — the leading macOS-only, cloud-locked commercial AI desktop companion — rebuilt from scratch in **Rust + Tauri + React** so it runs natively on **Windows, Linux, and macOS** with zero cloud dependency and zero telemetry.

### Project Lineage

| Project | Creator | Status | Role |
|---------|---------|--------|------|
| **HeyClicky** | Farza Majeed (YC W26) | macOS only, subscription | **Primary reference target** |
| **OpenClicky** | Jason Kneen | macOS only, basic subset | Secondary reference (bridge API contract) |
| **ClickyX** | `unn-Known1` | Win / Linux / macOS | This project |

### Design Principles

- **Local-first** — API keys are user-configured; no cloud sync, no hosted OAuth, no telemetry
- **Cross-platform first** — every feature has an equivalent implementation on all 3 platforms
- **Bridge compatibility** — `localhost:32123` HTTP API stays compatible with OpenClicky's spec
- **No macOS lock-in** — no Foundation, SwiftUI, AppKit, or Apple-only framework

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ClickyX App                            │
├─────────────────────────────────────────────────────────────┤
│  UI: System Tray + Floating Panel + Per-Screen Overlay      │
│  Frontend: React 19 + Zustand + react-query + i18next       │
├─────────────────────────────────────────────────────────────┤
│  Rust Backend (src-tauri/src/)                              │
│    audio/      Capture, VAD, STT, TTS, Wake Word, Handoff   │
│    ai/         Anthropic, OpenAI, Catalog, Guidance Tags    │
│    agent/      Codex, Sessions, Skills, Dock                │
│    screen/     xcap capture, Auto-capture, Coordinates      │
│    overlay/    Cursors, Glow, Lifecycle, Screen Router      │
│    cua.rs      enigo input simulation                       │
│    bridge.rs   HTTP API on 127.0.0.1:32123                  │
│    permissions Per-OS real checks (TCC/registry/pactl)      │
│    automation/ Cron + interval scheduler                    │
│    gen3d.rs    Tripo3D API                                  │
│    updater.rs  Platform-aware auto-updater                  │
├─────────────────────────────────────────────────────────────┤
│  Frontend (src/)                                            │
│    App.tsx              Shell, splash, drag-region, tabs    │
│    context/AppContext   Toast + navigation (no window.__)   │
│    store/appStore       Zustand: agents, audio, stats       │
│    bindings.ts          Typed Tauri invoke() wrappers       │
│    hooks/               useConfig, useAgents (react-query)  │
│    components/          Tabs, Settings, Overlay, HUD, etc.  │
│    overlay/OverlayApp   Glow, calibration, waveform, dock   │
└─────────────────────────────────────────────────────────────┘
```

### State Machine

```
Voice pipeline:
  idle → listening → processing → responding → idle

Always-on:
  idle → wake_word_listening → listening (VAD) → processing → idle

Type mode:
  idle → ctrl_tapped → typing → idle
```

---

## 3. Features

### 3.1 System Tray & Panel

- System tray icon — left-click toggles panel, right-click menu (Quick Ask, Settings, Quit)
- Frameless floating panel (356×300–720px), rounded corners, glass backdrop
- `data-tauri-drag-region` titlebar for repositioning
- Pin/unpin (always-on-top), auto-dismiss when unpinned and unfocused
- 4 tabs: **Home, Agents, Connections, Settings** — all lazy-loaded
- Splash screen on startup while config loads
- `openclicky://` deep-link URL scheme — routes to tabs/sections

### 3.2 Voice Pipeline

**Push-to-talk**
- Key-capture hotkey with 5 presets (Shift+Fn, Ctrl+Space, Ctrl+Alt, Shift+Ctrl, Custom)
- `cpal` audio capture, ring buffer pre-buffering, energy-based VU meter

**Always-on mode**
- Energy-based VAD with barge-in suppression — actively clears buffer during TTS (ducking)
- Wake word "Hey Clicky" with hysteresis + cooldown
- Audio ducking: `set_ducking()` emits `audio-ducking-changed` event; VAD loop resets on duck

**Voice-agent handoff**
- `VoiceAgentHandoff` in pipeline; after each VAD transcript, phrase-match triggers `voice-agent-handoff` Tauri event carrying `{agent_slug, agent_name, query, trigger_phrase}`

**STT providers:** Deepgram (WebSocket), OpenAI Whisper (HTTP), AssemblyAI (HTTP)

**TTS providers:** ElevenLabs, Cartesia, Microsoft Edge TTS (no key), Deepgram Aura, OpenAI Realtime

**Voice discovery:** Drag-to-rotate orbit picker, 5-provider voice catalog, click-to-select with per-voice accent color auto-applied to overlay

### 3.3 Screen Context & Vision

- Capture all monitors / cursor screen / focused window using `xcap` crate
- Every AI request attaches screenshot as base64 JPEG (max 1280px, quality 0.8)
- **Auto-capture:** `AutoCaptureEngine` with diff-based change detection, configurable interval (1s/3s/5s/10s/30s) and mode, emits `auto-capture-frame` events, event-driven status
- Coordinate normalization: `CoordinateNormalizer` with Y-flip for macOS, per-screen routing

### 3.4 Cursor Overlay

Per-screen transparent `WebviewWindow` (always-on-top, click-through), `macOSPrivateApi: true` for macOS transparency.

**Overlay elements:**
- Animated bezier-arc companion cursor (quadratic bezier, 300ms)
- 4 accent color presets + custom picker; `accent-changed` event propagates to all elements
- Active-control glow — 5 concentric pulsing rings (`show-glow` / `hide-glow` events)
- Calibration box mode — pulsing rect with corner markers (`calibration-start/end` events)
- Rectangles, freehand scribbles, captions, secondary proxy cursors
- Streaming caption with word-by-word reveal and stale-closure fix via `streamingRef`
- Waveform — listens for `audio-level-update` events with real amplitude bars; 500ms fallback
- Processing spinner, agent dock with live status dots
- `AlwaysListeningIndicator` — shown when `always-on-state-changed` fires with `{ active: true }`
- `HighlightOverlay` (pulsing yellow) and `ShapeOverlay` (SVG arrow/curve) for `[HIGHLIGHT]` / `[SHAPE]` tags
- RAF paused on `document.hidden`; all 18+ listeners use `cancelled` + async cleanup pattern
- Display hotplug: `start_hotplug_watcher()` polls monitors every 2s, calls `refresh_windows()` on change, emits `display-config-changed`

**Guidance tags parsed from AI responses:**

| Tag | Effect |
|-----|--------|
| `[POINT:x,y:label]` | Fly cursor to coordinates |
| `[RECT:x,y,w,h:label]` | Rectangle overlay |
| `[SCRIBBLE:x,y;x,y:label]` | Freehand path |
| `[OFFER:slug]` | Agent spawn offer |
| `[HIGHLIGHT:x,y,w,h]` | Pulsing yellow highlight region |
| `[SHAPE:arrow\|curve:x1,y1:x2,y2]` | SVG directional shape |

### 3.5 Agent Mode (Codex Runtime)

- Codex Node.js sidecar process, JSON-RPC over stdio — already cross-platform
- Agent session lifecycle: create → run → stop → archive → resume
- `AgentHUD.tsx` floating window with transcript, diff viewer, activity timeline, drag region
- Agent dock in overlay with live status dots + hover cards
- Voice-agent handoff wired (phrase detection → `voice-agent-handoff` event)
- `agent-state-changed` Tauri event invalidates react-query cache (no polling needed)
- File drag-drop onto agent cards → `agent_attach_files` Tauri command
- Agent slug auto-derived from name (kebab-case); `promptInput` persisted in `sessionStorage`

**Skills catalog: 63/63 implemented**

| Category | Skills |
|----------|--------|
| Screen & Control | screen-point, screen-caption, screenshot, screen-control |
| Google Workspace | gmail, google-calendar, google-drive, google-docs, google-sheets, google-slides |
| Development | github-issues, github-pr, vercel-deploy, docker-manager, npm-helper, repo-operator, code-review, codex |
| Productivity | notion, obsidian, linear, airtable, calendar-assistant, todo-manager |
| Communication | slack, discord, telegram |
| Creative | image-generator, audio-transcriber, video-summarizer |
| System | system-monitor, file-finder, clipboard-manager, network-checker, process-manager, cron-helper, env-manager, git-helper, shell-executor, file-organizer |
| AI / Agent meta | skill-creator, skill-installer, prompt-optimizer, context-summarizer, agent-builder |
| Data / Analytics | csv-analyzer, json-formatter, sql-runner, data-visualizer, api-tester |
| Writing / Content | blog-writer, email-drafter, document-formatter, grammar-checker, citation-finder, summarizer, translator, research-report, meeting-notes |
| Security | password-generator, secret-scanner, dependency-auditor |
| Learning | flashcard-maker, quiz-generator, concept-explainer |
| Web | web-scraper |

### 3.6 Computer Use (CUA)

`InputSimulator` in `cua.rs` using `enigo`:
- `click(x, y)` — native mode (cursor warp) + background mode (no warp)
- `double_click`, `type_text`, `key_press`, `move_cursor`, `scroll(x, y, delta_x, delta_y)`
- Rate-limited (`min_interval_ms`), bounds-safe
- **Background mode (`click_background_platform`):** macOS `osascript click at {x,y}`, Windows `SendMessage` PowerShell, Linux `xdotool click --window`
- **App-specific CUA contexts** (`ai/app_contexts.rs`): per-app tool descriptions injected into AI prompt for VS Code, Figma, Terminal, Blender, Chrome, Premiere, Excel, Notion
- `/scroll` bridge endpoint and `cua_scroll` Tauri command

**Accessibility tree (`accessibility/`):** Real implementations — Linux xdotool+xprop, macOS osascript AppleScript, Windows PowerShell UIA

### 3.7 Permissions

Real OS-level checks and requests — no stubs:
- **macOS:** sqlite3 TCC database, `screencapture` probe for screen, `osascript` for accessibility; `open x-apple.systempreferences:...` to request
- **Windows:** PowerShell `CapabilityAccessManager` registry; `ms-settings:privacy-*` URIs to request
- **Linux:** `pactl info` (mic), `systemctl --user is-active pipewire` (screen), `busctl --user list` (notifications), `pgrep at-spi-bus-laun` (accessibility)

### 3.8 External HTTP Bridge (`localhost:32123`)

25+ endpoints, token auth (`x-openclicky-token` / `Bearer`), actix-cors, SSE events.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check |
| GET | `/events` | SSE event stream |
| GET | `/models` | Model catalog |
| GET | `/audio-level` | Real-time audio RMS/peak |
| GET | `/mcp/tools` | List MCP tools (real stdio JSON-RPC) |
| GET | `/agents` | List agent sessions |
| GET | `/skills` | List bundled skills |
| POST | `/panel/toggle` | Toggle floating panel |
| POST | `/screenshot` | Capture all screens |
| POST | `/cursor` | Show cursor overlay |
| POST | `/cursors` | Multiple cursors |
| POST | `/rectangle` | Rectangle overlay |
| POST | `/scribble` | Freehand path |
| POST | `/caption` | Caption text |
| POST | `/click` | Left-click |
| POST | `/scroll` | Scroll at coordinates |
| POST | `/clear` | Clear overlays |
| POST | `/speak` | TTS output |
| POST | `/transcribe` | STT transcription |
| POST | `/notify` | Desktop notification |
| POST | `/mcp/call` | MCP tool call (real stdio) |
| POST | `/v1/messages` | Anthropic proxy |
| POST | `/v1/responses` | OpenAI proxy |
| POST | `/agent/create` | Create agent session |
| POST | `/agent/{slug}/run` | Run agent |
| POST | `/agent/{slug}/stop` | Stop agent |
| GET | `/agent/{slug}/status` | Agent status |

Full reference: `docs/BRIDGE_API.md`

**MCP integration:** Real stdio JSON-RPC — spawns server process, sends `initialize` + `tools/list`/`tools/call`, parses results.

### 3.9 AI Integration

| Provider | Models | Usage |
|----------|--------|-------|
| Anthropic | claude-sonnet-4, claude-opus-4 | Main chat + vision |
| OpenAI | gpt-4o, o3-mini, gpt-4o-realtime | Chat, agent mode, realtime voice |
| Deepgram | nova-2 | STT WebSocket |
| ElevenLabs | eleven_flash_v2_5 | TTS |
| Google Gemini | gemini-* | Optional fallback |
| OpenRouter | any | User-configurable override |
| NVIDIA AI | llama-3.1-* | via OpenAI-compatible base URL |

### 3.10 Automations

- Cron (5-field) and interval (seconds) scheduling
- JSON persistence in platform app-data dir
- 30s tick loop + `AutomationEngine`
- Cron expression UI in `ConnectionsTab` alongside interval
- Run history: `get_automation_runs` → last 10 runs with timestamp, status, duration

### 3.11 3D Model Generation

- Tripo3D API (`text_to_model`), 2s polling, 300s timeout
- Styles: low_poly_stylized, clay, voxel, game_asset, realistic
- `ThreeModelViewer.tsx` — Three.js GLB viewer with OrbitControls (lazy-loaded)

### 3.12 Chat UI

- `react-markdown` + `remark-gfm` + `rehype-highlight` rendering
- `useConversations` — multi-thread history with `sessionStorage` persistence
- Draft persistence, copy/regenerate per message, timestamps
- Stop/cancel streaming (per-session `sessionIdRef` scoping — no cross-contamination)
- Drag-and-drop image attachments, ↑ arrow fills last message
- Conversation sidebar: list, create, delete, rename

### 3.13 Settings

| Section | Key Controls |
|---------|-------------|
| Appearance | Theme (system/light/dark), 6 accent variants (sunset, forest, ocean, lavender, rose, amber), custom color picker |
| Overlay | Cursor size, opacity, show/hide prefs |
| Capture | Auto-capture mode, interval, event-driven status |
| Voice & Audio | PTT shortcuts (5 presets + custom), STT/TTS provider, always-on config, voice discovery |
| AI Providers | API keys for all providers, model selection, system prompt |
| Computer Use | CUA backend, native mode toggle |
| Permissions | Per-permission check + request, OS-specific guidance |
| System & Logs | Log viewer (5MB rotation, filter, search, copy), language switcher (EN/ES/FR/JA), About |
| 3D Models | Tripo3D key + generator UI |

Scroll position is remembered per sub-tab.

### 3.14 Connections Tab

- **Google Workspace:** OAuth flow UI (`google_workspace_auth_start`), gogcli setup guide, connected state with email/scopes, disconnect
- **MCP Servers:** CRUD with tag-array args editor, `env` key=value editor, "Test" button, search/filter
- **Automations:** CRUD with cron/interval UI, run history, agent binding, toggle
- **App Usage Log:** Collapsible table of encountered apps with time/interactions/last-seen, clear button

### 3.15 Onboarding & First Run

- 5-step wizard (microphone, screen recording, accessibility, camera, notifications)
- Camera permission step reconciled with PermissionsSettings
- `OnboardingIntro` component — video with animated SVG fallback
- Gated on `onboarding_completed` config flag

### 3.16 Distribution & CI/CD

| Platform | Artifact | Signing |
|----------|----------|---------|
| Windows | `.msi` + `.exe` | `signtool` (needs `WINDOWS_SIGNING_CERT` secret) |
| macOS | `.dmg` + `.app` + `.zip` | `codesign --deep --options runtime` (needs `APPLE_SIGNING_IDENTITY` secret) |
| Linux | `.deb` + `.AppImage` | GPG (optional) |
| Linux (extra) | Flatpak (`flatpak/com.clickyx.ClickyX.yml`) | — |
| Linux (extra) | RPM (`packaging/clickyx.spec`) | — |

- CI: `cargo check` + `cargo test --all-features` + `npm run build` on Ubuntu
- Build matrix: ubuntu / windows / macos
- Nightly: 3-platform build → pre-release with artifacts
- Release: tag-triggered (`v*`), `git-cliff` changelog generation
- Auto-updater: `check_for_update_with_delta()` + streaming progress (`update-download-progress` events)
- `macOSPrivateApi: true` in `tauri.conf.json` for overlay transparency

### 3.17 Frontend Architecture

| File | Purpose |
|------|---------|
| `src/App.tsx` | Shell: lazy tabs, splash, titlebar drag-region, panel drop, deep-link handler, aria-current |
| `src/context/AppContext.tsx` | Toast + navigation context — replaces all `window.__` globals |
| `src/store/appStore.ts` | Zustand: agents, audio, today stats, attention, status counts |
| `src/bindings.ts` | Typed Tauri `invoke()` wrappers — use instead of raw `invoke` |
| `src/hooks/useConfig.ts` | react-query `useQuery` + `useMutation` for config |
| `src/hooks/useAgents.ts` | react-query `useQuery` (5s refetch) + `agent-state-changed` invalidation |
| `src/hooks/useChat.ts` | Streaming chat, per-session scoping via `sessionIdRef`, vision fallback |
| `src/hooks/useConversations.ts` | Multi-thread history, sessionStorage persistence |
| `src/components/AgentHUD.tsx` | Floating HUD window with transcript/diff/timeline |
| `src/components/SkeletonLoader.tsx` | `SkeletonLine`, `SkeletonCard`, `SkeletonList` |
| `src/utils/sounds.ts` | `playSound()` / `Sounds.*` — agent launch/done/error sounds |
| `src/i18n/` | i18next EN + ES + FR + JA locales |

### 3.18 Testing

| Suite | Files | Coverage |
|-------|-------|----------|
| Vitest (unit) | `src/context/AppContext.test.tsx`, `useChat.test.ts`, `useConversations.test.ts`, `CommandPalette.test.tsx`, `agentStatus.test.ts` | 30+ cases |
| Playwright E2E | `e2e/app.spec.ts`, `e2e/chat.spec.ts`, `e2e/settings.spec.ts` | Tab switching, Ctrl+K, input |
| Playwright visual | `e2e/visual.spec.ts` | `toHaveScreenshot()` for all 4 tabs + palette + status bar |
| Rust unit | `config.rs` (15), `gen3d.rs` (9), `agent/skills.rs` (10), `automation/mod.rs` (20+) | 50+ cases |

Run commands:
```sh
npm test                     # Vitest unit tests
npm run test:e2e             # Playwright E2E
npm run test:visual          # Playwright visual regression
npm run test:visual:update   # Update visual baselines
cargo test --all-features    # Rust unit tests
```

---

## 4. Technology Reference

| HeyClicky (macOS) | ClickyX (Cross-platform) |
|-------------------|--------------------------|
| Swift + SwiftUI + AppKit | Tauri v2 (Rust + React 19 + TypeScript) |
| NSPanel per-screen | Per-screen `WebviewWindow` (transparent, always-on-top) |
| ScreenCaptureKit | `xcap` crate |
| AVFoundation / AVAudioEngine | `cpal` crate |
| CGEvent / Apple Events | `enigo` crate |
| SFSpeechRecognizer | Deepgram / Whisper / AssemblyAI |
| AVSpeechSynthesizer | Microsoft Edge TTS (no key needed) |
| Sparkle 2 auto-update | Custom `updater.rs` |
| Supabase / PostHog / Sentry | **Omitted** — local-first, zero telemetry |
| Codex (Node.js sidecar) | Codex (same — already cross-platform) |
| 28+ bundled skills | 63 bundled skills (full catalog) |

---

## 5. Configuration

Config auto-created on first run:

| Platform | Path |
|----------|------|
| Linux | `~/.config/clickyx/config.json` |
| macOS | `~/Library/Application Support/clickyx/config.json` |
| Windows | `%APPDATA%/clickyx/config.json` |

Key fields: `bridge_token`, `theme`, `hotkeys[]`, `api_keys[]`, `ai.*`, `audio.*`, `audio.always_on_config`, `overlay.*`, `computer_use.*`, `mcp_servers[]`, `automations[]`, `onboarding_completed`.

Full schema: `docs/CONFIGURATION.md`

---

## 6. External Dependencies Only (not resolvable in source)

| Item | Action needed |
|------|--------------|
| macOS code signing | Set `APPLE_SIGNING_IDENTITY`, `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_NOTARIZATION_USERNAME`, `APPLE_NOTARIZATION_PASSWORD` as GitHub repo secrets |
| Windows code signing | Set `WINDOWS_SIGNING_CERT` (base64 PFX) and `WINDOWS_SIGNING_PASSWORD` as GitHub repo secrets |
| Audio assets | Place `agent-launch.mp3`, `agent-done.mp3`, `agent-close.mp3`, `wake.mp3`, etc. in `public/sounds/` (see README there) |
| Onboarding video | Place `intro.mp4` in `public/onboarding/` (SVG fallback is already rendered) |

---

## 7. Key Documentation

| File | Purpose |
|------|---------|
| `docs/PROJECT_SPEC.md` | **This file** — single source of truth |
| `docs/CONFIGURATION.md` | Full config schema reference |
| `docs/BRIDGE_API.md` | Complete `localhost:32123` endpoint reference |
| `docs/SETUP.md` | Developer setup guide |
| `docs/FRONTEND_UI_AUDIT.md` | Historical audit report (all items resolved) |
| `CHANGELOG.md` | Full version history |
| `AGENTS.md` | Agent/AI coding instructions for this codebase |
| `CONTRIBUTING.md` | Contribution guidelines |
| `SECURITY.md` | Security policy |
