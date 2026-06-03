# HeyClicky / Clicky macOS App — Complete Feature Analysis (for clickyX Cross-Platform Port)

> **Analysis date**: 2026-06-03
> **Source**: DMG binary (`Clicky.dmg`, 254 MB compressed, 567 MB HFS+ volume)
> **App version**: HeyClicky 1.0.22 (build 30)
> **Bundle ID**: `com.humansongs.clicky`
> **Min OS**: macOS 14.2
>
> **Purpose**: This document reverse-engineers the macOS-only HeyClicky binary to guide the
> **clickyX cross-platform port** (Tauri/Rust + web frontend). Each feature is annotated with
> cross-platform feasibility and clickyX implementation status. The source of truth for build
> decisions is `docs/FEATURE_SPEC.md`.

---

## 1. App Identity & Ecosystem

There are **three versions** of this software:

| Version | Creator | Repo | Status |
|---------|---------|------|--------|
| **Clicky (original)** | Farza Majeed (`farzaa`) | `github.com/farzaa/clicky` | Open-source (MIT), public archive |
| **HeyClicky (commercial)** | Farza Majeed (YC W26) | Private | Y Combinator-backed, cloud-managed |
| **OpenClicky (fork)** | Jason Kneen (`jasonkneen`) | `github.com/jasonkneen/openclicky` | Active open-source fork with extra features |

The **DMG analyzed is HeyClicky 1.0.22** (commercial version), built with Xcode 26.5 on macOS 26.5 SDK.

---

## 2. Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│                   Menu Bar (LSUIElement=true)               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  NSPanel — "Notch" Control Panel                     │  │
│  │  ┌────────────┐ ┌────────────┐ ┌──────────────────┐  │  │
│  │  │  Home Tab   │ │ Agents Tab │ │ Settings Tab     │  │  │
│  │  │  - voice    │ │ - agents   │ │ - API keys       │  │  │
│  │  │  - dock     │ │ - threads  │ │ - voice          │  │  │
│  │  │  - cursors  │ │ - crons    │ │ - permissions    │  │  │
│  │  │  - skills   │ │ - activity │ │ - billing        │  │  │
│  │  └────────────┘ └────────────┘ └──────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Full-Screen Transparent NSPanel — Cursor Overlay    │  │
│  │  • Blue companion cursor (4 color options)           │  │
│  │  • Animated bezier-arc pointing                      │  │
│  │  • Response text bubble + waveform viz               │  │
│  │  • Guided click targets (TARGET/HOVER annotations)   │  │
│  │  • Agent dock icons for background tasks             │  │
│  │  • Captions near coordinates                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Codex Agent HUD Window (separate NSPanel)           │  │
│  │  • Agent progress dashboard                          │  │
│  │  • Task status, file diffs, follow-ups               │  │
│  │  • Multi-agent count badge                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Background Processes                                 │  │
│  │  • Codex Runtime (Node.js sidecar process)            │  │
│  │  • ClickyComputerUseRuntime (Apple Events CUA)        │  │
│  │  • Sparkle Update Checker                             │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### State Machine (CompanionManager)
```
idle → listening → processing → responding → idle
```

Push-to-talk pipeline:
```
Hotkey (Ctrl+Option) → Mic Capture → AssemblyAI (STT) → 
Screenshot (ScreenCaptureKit) → Claude/OpenAI → 
ElevenLabs (TTS) → Overlay [POINT] tags rendered
```

---

## 3. Complete Feature Catalog

### 3.1 Core Voice Interaction
- **Push-to-talk**: Hold `Ctrl+Option`, speak, release
  - **clickyX**: ✅ Implemented with `cpal` crate, global hotkey via `global-hotkey` Rust crate
- **Type mode**: Double-tap `Ctrl` for text input
  - **clickyX**: ⚠️ Config exists, full integration pending
- **Always-on voice mode**: Hands-free, no hotkey needed (barge-in capable)
  - **clickyX**: ⚠️ `activation_mode` config defined, not fully wired
- **Voice Activity Detection (VAD)**: For always-on mode
  - **clickyX**: ✅ Energy-based VAD in `src-tauri/src/audio/wake_word.rs`
- **Wake word detection**: "Hey Clicky" with configurable sensitivity
  - **clickyX**: ✅ Energy-based wake word with hysteresis + cooldown (`wake_word.rs`)
- **Speech-to-Text providers**: AssemblyAI (`u3-rt-pro` WebSocket), Apple Speech (local), Deepgram
  - **clickyX**: ✅ Deepgram (WebSocket), OpenAI Whisper (HTTP), AssemblyAI (HTTP) — Apple Speech replaced with cross-platform Whisper
- **Text-to-Speech providers**: ElevenLabs (`eleven_flash_v2_5`), AVSpeechSynthesizer (local fallback), Cartesia
  - **clickyX**: ✅ ElevenLabs, Cartesia, Microsoft Edge TTS, Deepgram Aura, OpenAI Realtime — 5 providers vs macOS's 3
- **Realtime voice**: GPT Realtime v2 speech-to-speech pipeline
  - **clickyX**: ✅ OpenAI Realtime API WebSocket support
- **Voice discovery UI**: "Drag to discover voices" with visual orbit picker
  - **clickyX**: ❌ Not implemented (lower priority)
- **Audio level metering**: VU meter with RMS power
  - **clickyX**: ✅ RMS + peak + clipping detection via ring buffer (`capture.rs`)

### 3.2 Screen Context & Vision
- **ScreenCaptureKit** (macOS 14.2+): Captures all monitors on hotkey press
  - **clickyX**: ✅ `scrap` crate for Windows/Linux, re-plumbed for each platform
- **Screenshot attached to every AI query** as vision input
  - **clickyX**: ✅ Base64-encoded screenshot in AI messages
- **Multi-monitor support**: Coordinate mapping per display (`screenN`)
  - **clickyX**: ⚠️ Capture supports all screens, **coordinate normalization across platforms not implemented**
- **Window capture policy**: Configurable (full screen vs. active window)
  - **clickyX**: ✅ Configurable via screen capture settings
- **Auto-capture mode**: Continuous context gathering
  - **clickyX**: ❌ Not implemented

### 3.3 Cursor Overlay System
- **Blue companion cursor**: Floats next to real cursor at all times
  - **clickyX**: ✅ Blue circle with smooth interpolation (`OverlayApp.tsx`)
- **4 color options**: User-selectable (onboarding + settings)
  - **clickyX**: ⚠️ Config exists, accent color support partial
- **Bezier-arc animation**: Smooth curved path to target
  - **clickyX**: ✅ Quadratic bezier arc with control point computation (`overlay.rs`, `OverlayApp.tsx`)
- **Annotation tags** parsed from AI responses:
  - `[POINT:x,y:label]` — Fly cursor to coordinates with label
  - `[TARGET:x,y,r:label]` — Guided click target with radius
  - `[HOVER:x,y,r:label]` — Hover indicator at target
  - `[RECT:x,y,w,h:label]` — Rectangle overlay (clickyX adds this)
  - `[SCRIBBLE:x,y;x,y:label]` — Freehand path (clickyX adds this)
  - `[HIGHLIGHT]` — Highlight work area (macOS-only tag)
  - `[SHAPE:arrow|curve]` — Directional shape overlay (macOS-only tag)
  - **clickyX**: ✅ `guidance.rs` parses POINT, RECT, SCRIBBLE, OFFER via regex. HIGHLIGHT and SHAPE are macOS-only.
- **Annotation lifecycle**: armed → completed → missed (with timeout)
  - **clickyX**: ❌ No lifecycle management — cursors/overlays added but never auto-expired
- **Response text bubble**: Displayed next to cursor with word-by-word reveal
  - **clickyX**: ⚠️ Static caption display only, no streaming word-by-word reveal
- **Waveform visualization**: Animated during TTS playback
  - **clickyX**: ❌ Not implemented
- **Spinner**: During processing
  - **clickyX**: ❌ Not implemented
- **Secondary markers**: Temporary markers via API
  - **clickyX**: ✅ Multiple cursor support in overlay
- **Caption display**: Brief labels near coordinates
  - **clickyX**: ✅ Via `show_caption` bridge endpoint
- **Agent dock icons**: Show background agent status in overlay
  - **clickyX**: ✅ SVG-based agent dock with status dots (`dock.rs`, `OverlayApp.tsx`)
- **System cursor visibility probe**: Monitors Mac cursor state
  - **clickyX**: ❌ Not needed cross-platform (each platform handles cursor visibility differently)

### 3.4 Agent Mode (Codex Runtime)
- **Background agent spawning**: Say "clicky agent" or type commands
  - **clickyX**: ✅ Agent spawning via Codex sidecar process
- **Codex Node.js runtime**: Bundled as sidecar process (dual-arch: arm64 + x86_64)
  - **clickyX**: ✅ Codex is already cross-platform (Node.js), same JSON-RPC over stdio
- **Child worker spawning**: Agents spawn sub-agents for parallel tasks
  - **clickyX**: ✅ Supported via Codex runtime
- **Agent HUD dashboard**: Status, progress, file diffs, activity timeline
  - **clickyX**: ⚠️ `AgentsTab` with chat and status but no separate floating HUD window
- **Agent dock in overlay**: Per-session status dots + hover card
  - **clickyX**: ✅ Implemented with SVG status dots + captions
- **Task types**:
  - Code/build/preview
  - Research & reports
  - File/shell operations
  - Document generation (PDF, DOCX, spreadsheets)
  - Repo scaffolding
  - Frontend builds
  - Web search
- **RPC protocol**: JSON-RPC style with `BootRuntimeCommand`, `ToolExecutionRequestedEvent`, etc.
  - **clickyX**: ✅ Same JSON-RPC over stdio protocol (`codex.rs`)
- **Scheduled/Cron agents**: Recurring agent tasks on intervals
  - **clickyX**: ✅ Full automation engine with cron parser + 30s tick loop (`automation/mod.rs`)
- **Handoff system**: Switch between voice and agent modes seamlessly
  - **clickyX**: ❌ Voice pipeline and agent system are independent, no handoff

### 3.5 Computer Use & Automation (CUA)
- **Directed local actions** (voice → immediate execution):
  - App launch (known apps)
  - Folder/web open
  - System volume control
  - Spotify control
  - Reminders (add/count)
  - Messages search
  - Keyboard typing
  - Mouse click
  - Key presses
  - **clickyX**: ⚠️ CUA config exists (`ComputerUseConfig`), but **no actual CUA driver code** exists for any platform. Click handler is a no-op.
- **Native CUA**: CGEvent-based click/type/key (cursor warp) — macOS only
  - **clickyX**: ❌ Cross-platform equivalent needed: `SendInput` (Windows), `libxdo`/`xdotool` (Linux), `CGEvent` (macOS)
- **Background Computer Use (BCU)**: Separate app via `SLEventPostToPid` (no cursor warp) — macOS only
  - **clickyX**: ❌ Not implemented
- **Element location detector**: Beta tool for pixel-accurate pointing
  - **clickyX**: ❌ Not implemented
- **Accessibility tree grounding**: Alternative UI element detection
  - **clickyX**: ❌ Not implemented
- **Apple Events automation**: For driving target apps — macOS only
  - **clickyX**: ❌ Not portable, no cross-platform equivalent planned
- **App-specific skill tables**: 10+ hardcoded app skill contexts (Premiere, Final Cut, Terminal, Xcode, Figma, Excel, VSCode, Shopify, Notion, Blender) — **macOS-only**
  - **clickyX**: ❌ Not implemented

### 3.6 Integrations
- **GitHub**: Via Composio MCP
- **Google Workspace**: Gmail, Calendar, Drive, Docs, Sheets, Slides, Chat, Contacts, Tasks, Admin
- **Notion**: Query and manage
- **Linear**: Issue tracking
- **Obsidian**: Note-taking
- **Spotify**: Voice control
- **Maps**: Place search, detail overlay
- **Stocks**: Quote API, widgets
- **Image search**: Search and display
- **Airtable**: Database management
- **Apple Notes & Reminders**: Native integration
- **iMessage**: Send/read messages
- **FindMy**: Location tracking
- **YouTube**: Content research

### 3.7 Bundled Agent Skills
The macOS binary bundles **28+ named skills** (e.g., `clicky-artifacts`, `clicky-build-preview`).
The FEATURE_SPEC (§7.1) catalogs **63 skills across 10 categories**.

**clickyX**: Currently bundles **4 skills** (`screenshot`, `screen-point`, `screen-caption`, `manage-codex`) as `.toml` descriptors. The entry-point `.js` files referenced by the `.toml` files are not yet present in the repo. This is the largest delta from feature parity.

### 3.8 Features in clickyX Not Present in macOS Original

The clickyX port adds these features (not in HeyClicky DMG):

- **3D Model Generation**: Prompt-based 3D via Tripo3D API with polling (`src-tauri/src/gen3d.rs`)
- **Automation Engine**: Full cron/interval scheduler with JSON persistence, 30s tick loop (`src-tauri/src/automation/mod.rs`)
- **MCP Server Management**: CRUD UI for MCP servers (name, command, args, env vars) — independent of Codex
- **Widget Dashboard**: 3 active widgets (Active Agents, Today Stats, Needs Attention) in Connections tab
- **Log Viewer**: Built-in log viewer with rotation at 5MB (`src-tauri/src/lib.rs`, `commands.rs`)
- **Config Export/Import/Reset**: Full config JSON export/import/reset via Tauri commands
- **Auto-Updater**: Custom platform-aware updater supporting MSI/DMG/AppImage (`src-tauri/src/updater.rs`)
- **Multi-Platform Permissions**: Per-OS check/request stubs for all required permissions (`src-tauri/src/permissions.rs`)
- **Model Catalog with Remote Fetching**: Fetches model lists from OpenAI-compatible base URLs (`src-tauri/src/ai/catalog.rs`)

### 3.9 UI Components (311+ Views in macOS Original)
- **Notch panel** (main UI shell): Home, Agents, Settings, Crons, Threads tabs
  - **clickyX**: ✅ Home, Agents, Connections, Settings tabs
- **Agent HUD**: Floating dashboard, agent chips, activity timeline
  - **clickyX**: ⚠️ AgentsTab with inline chat + status, no separate floating HUD window
- **Voice picker**: Waveform picker, voice discovery map, orbit node picker
  - **clickyX**: ❌ Not implemented
- **Permissions guide**: Drag-to-accept permission setup, step progress strip
  - **clickyX**: ⚠️ Basic permission check/request stubs exist, no guide UI
- **Widgets**: Place, Stock, Image, Response cards (macOS)
  - **clickyX**: ✅ Different widget set — Active Agents, Today Stats, Needs Attention
- **Onboarding**: Pre-sign-in intro modal with color picker, voice selection, skill catalog
  - **clickyX**: ❌ Not implemented
- **Paywall**: Agent paywall HUD, plan cards, usage summary — **omitted by design** (local-first)
- **Settings pages**: Shortcuts, Microphone, Voice, Crons, Integrations, Permissions, Billing
  - **clickyX**: ✅ Settings sections for General, Voice, AI Providers, Computer Use, Permissions, System & Logs

### 3.10 Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+Option` (hold) | Push-to-talk voice capture |
| `Ctrl` (double-tap) | Type mode (text input) |
| `Esc` | Cancel/interrupt |
| Configurable | All hotkeys user-recordable via `ClickyHotkeyRecorder` |
| **clickyX**: ✅ Configurable global hotkeys via `global-hotkey` Rust crate

### 3.11 Data & Analytics (macOS Original)
- **PostHog**: Usage analytics (`phc_xcQPygmhTMzzYh8wNW92CCwoXmnzqyChAixh8zgpqC3C`)
- **Sentry**: Crash/error tracking (DSN embedded)
- **Supabase**: Auth and data persistence
- **Sparkle 2**: Auto-update framework (appcast + DSA signature)
- **clickyX**: ⚠️ **All omitted by design** per local-first principle. No telemetry, no cloud auth, no hosted services. Auto-updater is custom (`updater.rs`), not Sparkle-based.

---

## 4. External Control Bridge (localhost:32123 HTTP API)

The HeyClicky macOS app exposes a local HTTP API for agent-driven control. This is **critical for clickyX parity** — it's the contract between Codex agents and the desktop app.

### 4.1 Endpoints (from FEATURE_SPEC §8)

| Method | Path | Purpose | clickyX Status |
|--------|------|---------|----------------|
| GET | `/health` | Health check | ✅ Routed |
| GET | `/mcp/tools` | List MCP tool descriptors | ⚠️ Handler exists, **not routed** |
| GET | `/events` | SSE event stream | ⚠️ Handler exists, **not routed** |
| POST | `/cursor` | Show cursor pointer | ⚠️ Handler exists, **not routed** |
| POST | `/cursors` | Show multiple cursors | ⚠️ Handler exists, **not routed** |
| POST | `/scribble` | Draw freehand overlay | ⚠️ Handler exists, **not routed** |
| POST | `/rectangle` | Draw rectangle highlight | ⚠️ Handler exists, **not routed** |
| POST | `/caption` | Show caption text | ⚠️ Handler exists, **not routed** |
| POST | `/screenshot` | Capture screenshot | ⚠️ Handler exists, **not routed** |
| POST | `/click` | Left-click coordinates | ⚠️ Handler exists, **not routed** (no-op) |
| POST | `/clear` | Clear all overlays | ⚠️ Handler exists, **not routed** |
| POST | `/speak` | TTS output | ⚠️ Handler exists, **not routed** |
| POST | `/notify` | Desktop notification | ⚠️ Handler exists, **not routed** |
| POST | `/mcp/call` | Single MCP tool call | ⚠️ Handler exists, **not routed** |
| POST | `/v1/messages` | Anthropic proxy | ✅ Routed |
| POST | `/v1/responses` | OpenAI proxy | ✅ Routed |

**Note**: **12 of 16 bridge handlers exist but are not wired** in the routing table (`bridge.rs:897-913`). This is the single biggest gap in clickyX's bridge parity.

### 4.2 MCP Tools Exposed

1. `show_cursor` / `openclicky_point` — point at (x,y) with caption/duration/accent
2. `show_cursors` / `openclicky_point_many` — multiple secondary points
3. `show_caption` — caption text on screen
4. `show_scribble` — freehand path overlay
5. `show_highlight` / `show_rectangle` — rectangle overlay
6. `screenshot` — capture screen(s)
7. `click` / `openclicky_click` — left-click at coordinates
8. `speak` — TTS output
9. `notify` — system notification
10. `clear` — clear all overlays

### 4.3 Missing from clickyX Bridge
- **Authentication**: No `x-openclicky-token` or Bearer auth middleware (FEATURE_SPEC §8 requirement)
- **CORS preflight**: No OPTIONS handler
- **Agent endpoints**: `/agents`, `/agent/create`, `/agent/{slug}/run`, `/agent/{slug}/stop`, `/agent/{slug}/status` — routed in clickyX but not in the spec

---

## 5. AI Model Configuration

| Model (macOS Original) | Model (clickyX) | Provider | Usage |
|-------|---------|----------|-------|
| Claude Opus 4.6 | claude-sonnet-4-20250514 | Anthropic | Main chat/vision (canonical model) |
| Claude Sonnet 4.6 | claude-sonnet-4-20250514 | Anthropic | Fast fallback / element location |
| GPT-5.5 | gpt-4o, o3-mini | OpenAI | Codex agent mode |
| GPT-Realtime-2 | gpt-4o-realtime-preview | OpenAI | Speech-to-speech voice mode |
| Gemini (API key) | Gemini (API key) | Google | Optional fallback |
| OpenRouter (custom) | OpenRouter | OpenRouter | User-configurable override |
| AssemblyAI u3-rt-pro | AssemblyAI | AssemblyAI | Streaming STT |
| ElevenLabs flash_v2_5 | eleven_flash_v2_5 | ElevenLabs | TTS |
| Apple Speech | Whisper.cpp (local) | Whisper | Local STT (replacement for macOS-only) |
| AVSpeechSynthesizer | Microsoft Edge TTS | Edge | Local TTS fallback |

---

## 6. Backend Services

### macOS Original (Cloud-Dependent)
| Service | URL/Endpoint | Purpose |
|---------|-------------|---------|
| Anthropic API | `https://api.anthropic.com/v1/messages` | Claude chat |
| OpenAI API | `https://api.openai.com/v1/chat/completions` | GPT chat |
| OpenAI Realtime | `wss://api.openai.com/v1/realtime?model=` | Realtime voice |
| AssemblyAI | `wss://streaming.assemblyai.com/v3/ws` | STT streaming |
| Codex Worker | `https://clicker-proxy-v2.farza-0cb.workers.dev` | Agent proxy |
| Supabase | `https://mrpvynsdsnimuisyhkow.supabase.co` | Auth + data |
| PostHog | `https://us.i.posthog.com` | Analytics |
| Sentry | `https://76fcb993634d4929a3a7c921d853aa93@o4511254886154240.ingest.us.sentry.io/4511254887137280` | Error tracking |
| Sparkle | `https://farzaa.github.io/clicky-releases/appcast.xml` | Auto-update |

### clickyX (Local-First)
| Service | URL/Endpoint | Purpose | Notes |
|---------|-------------|---------|-------|
| Anthropic API | `https://api.anthropic.com/v1/messages` | Claude chat | User-configured key |
| OpenAI API | `https://api.openai.com/v1/chat/completions` | GPT chat | User-configured key |
| OpenAI Realtime | `wss://api.openai.com/v1/realtime?model=` | Realtime voice | User-configured key |
| AssemblyAI | `https://api.assemblyai.com/v2/` | STT | HTTP, not WS |
| Deepgram | `wss://api.deepgram.com/v1/listen` | STT | WebSocket |
| ElevenLabs | `https://api.elevenlabs.io/v1/` | TTS | User-configured key |
| OpenAI Whisper | `https://api.openai.com/v1/audio/transcriptions` | STT | User-configured key |
| Microsoft Edge TTS | `wss://speech.platform.bing.com/` | TTS | No key needed |
| Cartesia | `https://api.cartesia.ai/` | TTS | User-configured key |
| Tripo3D | `https://api.tripo3d.ai/` | 3D generation | User-configured key |
| **No cloud auth** | N/A | Supabase/PostHog/Sentry | **Omitted by design** |

---

## 7. Bundled Assets (macOS Original)

### Audio Files
- **Agent sounds**: `agent-close.mp3`, `agent-done.mp3`, `agent-launch.mp3`
- **UI sounds**: `clicky-question.wav`, `clicky-surprised.wav`, `clicky-text-close.wav`, etc.
- **Voice previews**: 10 realtime voices + 12 additional voice previews (MP3)
- **Sound effects**: `hatching.wav`, `skill-down.wav`, `skill-up.wav`, etc.

### Video
- `onboarding-intro-v2.mp4`
- `paywall-intro-v2.mp4`

### Images
- 256x256 app icon (with 32x32 and 128x128 variants)
- 578x578 promotional screenshot (with XMP metadata)
- 964x604 UI screenshots
- 660x400 welcome splash
- 4 status/tray icon variants (100x100)

### Codex Runtime (Bundled Node.js Agent)
- `bin/codex` — Main runtime binary
- `vendor/` — Node.js modules for arm64 + x86_64
- `path/rg` — ripgrep bundled for search

---

## 8. Permissions Required

| Permission | macOS | Windows | Linux | Purpose |
|------------|-------|---------|-------|---------|
| Microphone | AVCaptureDevice.requestAccess | MediaCaptureInitialization | PulseAudio/ALSA | Voice capture |
| Screen Recording | ScreenCaptureKit | DXGI Desktop Duplication | PipeWire / X11 | Screenshot capture |
| Accessibility | AXIsProcessTrusted | UI Automation | AT-SPI / DBus | Global hotkeys |
| Notifications | UNUserNotificationCenter | Toast Notifications | D-Bus | System notifications |
| Camera | AVCaptureDevice.requestAccess | MediaCapture | V4L2 | (Future use) |

**clickyX**: ✅ Platform-specific check/request stubs exist in `src-tauri/src/permissions.rs` (lines 42-214).

---

## 9. Key Differentiators for clickyX — Implementation Status

Since clickyX is a **Tauri-based cross-platform port**, here is the actual parity status:

| Priority | Feature | macOS (Original) | clickyX | Status |
|----------|---------|-------------------|---------|--------|
| **P1** | Menu bar / system tray | NSStatusItem | Tauri system-tray | ✅ |
| **P1** | Push-to-talk voice | AVAudioEngine + CGEvent | `cpal` + `global-hotkey` | ✅ |
| **P1** | Screen capture | ScreenCaptureKit | `scrap` crate | ✅ |
| **P1** | Cursor overlay (basic) | NSPanel per-screen | Single Tauri overlay window | ⚠️ Single window, not per-screen |
| **P2** | Anthropic/OpenAI routing | SDK + HTTP | Direct HTTP + provider routing | ✅ |
| **P2** | Multi-provider fallback | Priority-ordered | Priority-ordered catalog | ✅ |
| **P3** | Codex agent runtime | Node.js sidecar | Same (cross-platform) | ✅ |
| **P3** | Agent spawning/monitoring | JSON-RPC over stdio | Same | ✅ |
| **P3** | Automation engine | RunLoop timer | Cron parser + 30s tick | ✅ (clickyX adds) |
| **P3** | MCP server management | Codex config.toml | Full CRUD UI | ✅ (clickyX adds) |
| **P4** | [POINT]/[RECT]/[SCRIBBLE] tag parsing | Regex match | `guidance.rs` parser | ✅ |
| **P4** | Bezier arc cursor animation | 60fps Timer | Quadratic bezier | ✅ |
| **P4** | Companion cursor | Triangle avatar | Circle with interpolation | ✅ |
| **P4** | Agent dock in overlay | NSPanel icons | SVG status dots | ✅ |
| **P4** | Multi-monitor coordinate mapping | screenNumber lookup | **Not implemented** | ❌ |
| **P4** | Annotation lifecycle | armed→completed→missed | `lifecycle.rs` + `manager.rs` + sweep task | ✅ |
| **P4** | Response bubble word-by-word | Character-by-character timer | `OverlayApp.tsx` streaming caption | ✅ |
| **P4** | Waveform visualization | Animated during TTS | `OverlayApp.tsx` Waveform component | ✅ |
| **P4** | Processing spinner | Animated during processing | `OverlayApp.tsx` Spinner component | ✅ |
| **P5** | External bridge (16/16 endpoints) | NWListener TCP 32123 | **All routes wired** | ✅ |
| **P5** | Bridge auth (token/CORS) | x-openclicky-token | `bridge_auth.rs` + `actix-cors` | ✅ |
| **P5** | CUA / click execution | CGEvent / SendInput | `cua.rs` InputSimulator (enigo) | ✅ |
| **P6** | Wake word | SFSpeechRecognizer | Energy-based VAD | ✅ |
| **P6** | 3D generation | Tripo3D API | Same (`gen3d.rs`) | ✅ (clickyX adds) |
| **P6** | Widget dashboard | Place/Stock/Image cards | Active Agents/Today/Needs Attention | ✅ (clickyX adds) |
| **P6** | Log viewer | Console.app | Built-in viewer | ✅ (clickyX adds) |
| **P6** | Config export/import/reset | UserDefaults | JSON export/import | ✅ (clickyX adds) |
| **P6** | Auto-updater | Sparkle | Custom platform-aware | ✅ (clickyX adds) |
| **P6** | Always-on voice | AVAudioEngine | VAD wired, activation_mode config | ⚠️ |
| **P6** | Bundled skills | 28+ (macOS) / 63 (spec) | 4 skills + JS entry points + template | ⚠️ |
| **P6** | Voice-agent handoff | Seamless switch | Independent systems | ❌ |
| **P6** | Google Workspace | gogcli CLI | Not integrated | ❌ |
| **P6** | Voice discovery UI | Orbit picker | Not implemented | ❌ |
| **P6** | Onboarding wizard | Permission guide | Not implemented | ❌ |
| **P6** | Accessibility tree / Element location | Beta tools | Not implemented | ❌ |

---

## 10. Open Source Repos for Reference

| Repo | What it has |
|------|-------------|
| `github.com/farzaa/clicky` | Original Clicky (Swift, Cloudflare Worker, MIT) — archive |
| `github.com/jasonkneen/openclicky` | OpenClicky fork (Swift, Codex, HTTP bridge, agent mode) — most relevant |
| `github.com/farzaa/clicky-releases` | Sparkle appcast + release artifacts |
| `github.com/conscious-engines/clicky` | Fork with MLX local inference + LM Studio support |
| `github.com/unn-Known1/clickyX` | **This project** — cross-platform Tauri port |

---

## 11. Technology Stack Reference

| Clicky (macOS) | clickyX (Cross-platform) |
|----------------|-------------------------|
| Swift + SwiftUI | Tauri (Rust + web frontend) |
| AppKit (NSPanel) | Tauri window + platform-native overlays |
| ScreenCaptureKit | `scrap` crate / `xcap` crate |
| AVFoundation/AVAudioEngine | `cpal` crate + `rodio` for playback |
| Cloudflare Worker proxy | Direct HTTP + provider routing |
| Codex (Node.js) | Codex (already cross-platform) |
| Sparkle 2 | Custom platform updater (`updater.rs`) |
| PostHog + Sentry | **Omitted** (local-first) |
| Supabase | **Omitted** (local-first) |
| CGEvent / Apple Events | `enigo` crate (cross-platform input simulation) |
| CUA stubs | `cua.rs` — InputSimulator with native + background modes |
| Bridge route stubs | `bridge.rs` — All 16 endpoints wired + auth + CORS |
| Annotation lifecycle (armed→missed) | `overlay/lifecycle.rs` + `overlay/manager.rs` + sweep task |
| Word-by-word response bubble | `OverlayApp.tsx` — StreamingCaption with char reveal |
| Waveform visualization | `OverlayApp.tsx` — Waveform component with random bars |
| Processing spinner | `OverlayApp.tsx` — Spinner SVG component |
| SFSpeechRecognizer | Whisper.cpp (local STT) |
| AVSpeechSynthesizer | Microsoft Edge TTS (no-key fallback) |
| Apple Notes/Reminders/iMessage | **Not portable** — no direct equivalent |
| 28+ macOS skills | `skills/` — 4 skills with JS entry points + template + validator |
