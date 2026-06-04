# ClickyX — Cross-Platform Feature Specification

Derived from OpenClicky (macOS native) — a comprehensive AI companion with voice, screen context, agent mode, cursor overlay, and integrations.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    ClickyX App                           │
├─────────────────────────────────────────────────────────┤
│  UI Layer: Menu Bar Tray + Floating Panel + Overlay     │
├─────────────────────────────────────────────────────────┤
│  State Machine: CompanionManager (voice state, AI flow) │
├─────────────────────────────────────────────────────────┤
│  Voice Pipeline: PTT/WakeWord → STT → LLM → TTS        │
├─────────────────────────────────────────────────────────┤
│  AI Providers: Anthropic, OpenAI, Codex, Deepgram       │
├─────────────────────────────────────────────────────────┤
│  Agent Mode: Codex runtime, child workers, skills       │
├─────────────────────────────────────────────────────────┤
│  Screen Context: Screenshot capture, CUA, pointing      │
├─────────────────────────────────────────────────────────┤
│  External Bridge: HTTP/SSE local API for agents         │
├─────────────────────────────────────────────────────────┤
│  Integrations: GitHub, Google Workspace, Automations    │
├─────────────────────────────────────────────────────────┤
│  Storage: Local API keys, UserDefaults, JSON files      │
└─────────────────────────────────────────────────────────┘
```

---

## 1. Menu Bar & System Tray

| Feature | macOS (Original) | Windows | Linux | Priority |
|---------|------------------|---------|-------|----------|
| System tray icon with custom rendering | NSStatusItem (rotated triangle, 18x18) | Windows Tray Icon API | libappindicator / tray | P0 |
| Left-click toggles floating panel | NSPanel show/hide | NotifyIcon Click | Tray menu click | P0 |
| Right-click context menu | Quick Ask, Settings, Task History, Quit | ContextMenuStrip | GtkMenu | P0 |
| Dynamic agent status items in tray | Up to 5 per-agent icons with status color | Multiple NotifyIcons or submenu | Submenu indicators | P1 |
| Drag-and-drop onto agent icons | NSView drag registration | WM_DROPFILES / IDropTarget | GTK drag_dest_set | P1 |
| Pin/unpin panel | isPanelPinned toggle | Keep window always-on-top | Keep above | P1 |

---

## 2. Floating Panel / Main UI

| Feature | macOS (Original) | Cross-Platform Notes |
|---------|------------------|----------------------|
| Borderless rounded-corner panel | NSPanel, borderless, cornerRadius 28 | Frameless window with rounded corners + drop shadow |
| Liquid glass backdrop | NSVisualEffectView vibrancy | Acrylic (Win10+) / blurred background |
| 4 tabs: Home, Agents, Connections, Settings | SwiftUI TabView | TabWidget / TabBar |
| Home tab: hero card, suggestions grid, quick prompt input | OpenClickyNotchHeroCard, autocomplete | Custom widget set |
| Chat mode with transcript history | Last 8 entries inline | Chat message list |
| File drag-and-drop onto panel | NSPasteboard fileURL accept | Drag-drop handler on window |
| Auto-dismiss on click-outside (unpinned) | NSEvent local/global monitor | Deactivate event / focus lost |
| Pin toggle for persistent panel | @Published isPanelPinned | Always-on-top window flag |
| Theme support (system/light/dark) | @AppStorage theme | System theme detection + manual |

### Panel Dimensions
- Min width: 356px, Min height: 300px, Max height: 720px
- Build with: Tauri (Rust backend + web frontend) or Electron

---

## 3. Voice / Audio Pipeline

### 3.1 Push-to-Talk

| Feature | macOS (Original) | Cross-Platform Notes |
|---------|------------------|----------------------|
| Global keyboard shortcut (Ctrl+Option) | CGEvent tap (system-wide) | Global hotkey (RegisterHotKey / global shortcut lib) |
| Multiple shortcut options | Shift+Fn, Ctrl+Option, Shift+Ctrl, Ctrl+Opt+Space, Shift+Ctrl+Space | Configurable hotkey binding |
| Audio capture with AVAudioEngine | 256 sample buffer, Float32 | PortAudio / miniaudio / cpal (Rust) |
| Permissions: microphone | AVCaptureDevice.requestAccess | MediaDevices.getUserMedia (web) or system prompt |
| VU meter / audio power level | RMS power 0.0-1.0, 30ms sampling | Audio level analysis from PCM |
| Pre-buffering before provider ready | Up to 360 buffers queued | Ring buffer implementation |
| Auto-submit vs manual-submit modes | shouldAutomaticallySubmitFinalDraft | Configurable per-platform |

### 3.2 Wake Word ("Hey Clicky")

| Feature | macOS (Original) | Cross-Platform Notes |
|---------|------------------|----------------------|
| On-device wake word detection | SFSpeechRecognizer (on-device) | Porcupine / Vosk / Whisper.cpp (on-device) |
| Three activation modes | Push-to-talk, Toggle listening, Always listening | Same modes |
| Audio ducking on wake | System volume -> 8%, restore on finish | System audio ducking API |
| Wake phrase variants | "hey clicky", "hay clicky", "hey cliquey", "hay cliquey" | Configurable wake phrase |

### 3.3 Speech-to-Text (STT)

| Feature | macOS (Original) | Cross-Platform Notes |
|---------|------------------|----------------------|
| Apple Speech (on-device) | SFSpeechRecognizer | Replace with Whisper.cpp / Vosk |
| Deepgram | WebSocket API | Same API (HTTP or WS) |
| AssemblyAI | HTTP API | Same API |
| OpenAI Whisper | HTTP API | Same API |
| Automatic provider selection | First configured in priority order | Same priority logic |
| Streaming partial results | Real-time transcript update stream | WebSocket or chunked HTTP |
| Contextual keyterms for accuracy | Domain-specific term injection | Same — inject into recognition config |

### 3.4 Text-to-Speech (TTS)

| Feature | macOS (Original) | Cross-Platform Notes |
|---------|------------------|----------------------|
| ElevenLabs streaming | HTTP PCM stream @ 22.05kHz | Same HTTP API |
| Cartesia TTS | HTTP PCM stream | Same API |
| Microsoft Edge TTS | WebSocket MP3 -> decoded to PCM | Same WS endpoint (no key needed) |
| Deepgram Aura | WebSocket PCM stream | Same API |
| OpenAI Realtime | WebSocket bidirectional | Same API |
| Sentence-pipelined streaming | StreamingTTSSession: detect sentences, fetch parallel, play in order | Same architecture |
| Filler phrases ("one moment...") | Pre-rendered PCM cached on disk | Same — pre-fetch and cache |
| Playback volume control | AVAudioEngine mixer volume | Platform audio output |
| Response captions (on-screen) | OpenClickyResponseCaptionFont (13 fonts) | Same — overlay text rendering |
| Voice discovery (orbit picker) | Drag-to-rotate orbit of voice nodes, click-to-select | `VoiceDiscovery` component + `voices.rs` with per-provider voice lists, per-voice accent color auto-applies to overlay |

---

## 4. Screen Capture & Context

| Feature | macOS (Original) | Cross-Platform Notes |
|---------|------------------|----------------------|
| Capture all screens as JPEG | ScreenCaptureKit | Windows.Graphics.Capture / DXGI Desktop Duplication |
| Capture cursor screen only | NSEvent.mouseLocation + display lookup | Cursor position API |
| Capture focused window | SCContentFilter with desktopIndependentWindow | Focused window HWND |
| Max dimension 1280px, quality 0.8 | NSBitmapImageRep JPEG | Sharp / ImageMagick / built-in encode |
| Exclude own app windows | Bundle ID filter | Window class/title filter |
| Pre-warm shareable content cache | Cached 3s, proactive warmup | Same — cache scan results |
| Coordinate system: AppKit -> Core Graphics | Y-flip conversion | Windows: top-left origin, Y-down (native) |
| Application usage logging | Track encountered apps | Same — helpful for context |
| Auto-capture mode | Continuous context gathering with diff-based change detection | `AutoCaptureEngine` with interval/mode config, `set_on_capture` callback emits `auto-capture-frame` event |

---

## 5. AI / LLM Integration

### 5.1 Provider Routing

| Feature | macOS (Original) | Cross-Platform Notes |
|---------|------------------|----------------------|
| Claude (Anthropic) | SDK first (Claude Agent SDK via Node.js bridge), HTTP API fallback | Same dual-path pattern |
| OpenAI / GPT models | OpenAI Responses API, SSE streaming | Same HTTP API |
| Codex (Agent Mode) | Codex app-server binary via stdio JSON-RPC | Same — Codex is cross-platform (Node.js) |
| Deepgram Voice Agent | WebSocket bidirectional voice | Same API |
| Model catalog with provider mapping | OpenClickyModelCatalog (voice, speech, CUA, codex) | Same model registry pattern |

### 5.2 Claude Integration

| Feature | macOS (Original) | Cross-Platform Notes |
|---------|------------------|----------------------|
| Claude Agent SDK bridge | Node.js process via JSON-RPC over stdio | Same — Node.js cross-platform |
| Direct HTTP API fallback | Anthropic Messages API with SSE | Same HTTP API |
| System prompts with tool definitions | claude_agent_sdk_tools, caching headers | Same — adjust file paths |
| Vision analysis (screenshot base64) | image_base64 in messages | Same API |
| Token caching (prompt caching) | anthropic-beta headers | Same |

### 5.3 OpenAI Integration

| Feature | macOS (Original) | Cross-Platform Notes |
|---------|------------------|----------------------|
| Responses API | responses.create with streaming | Same API |
| Vision analysis | image_url base64 | Same |
| Realtime API (bidirectional voice) | WebSocket wss://api.openai.com/v1/realtime | Same WebSocket (platform-independent) |
| Tool/function calling | openclicky_use_computer, openclicky_use_screen_context | Same tool definitions |

### 5.4 Response Streaming & Visual Guidance

| Feature | macOS (Original) | Cross-Platform Notes |
|---------|------------------|----------------------|
| Parse [POINT:x,y:label] tags | Regex match, coordinate scaling | Same tag format |
| Parse [RECT:x,y,w,h:label] tags | Rectangle overlay creation | Same |
| Parse [SCRIBBLE:x,y;x,y:label] tags | Scribble overlay creation | Same |
| Coordinate scaling: screenshot pixels -> display points | Calibration offset applied | Same scaling math |
| Screen selection: screenNumber tag -> correct display | Multi-display lookup | Same |
| Agent offer detection | responseOffersAgentSpawn regex | Same |
| Trailing tag fragment stripping for TTS | stripTrailingVisualGuidanceTagFragment | Same — prevents speaking partial tags |

---

## 6. Cursor Overlay & Visual Guidance

| Feature | macOS (Original) | Cross-Platform Notes |
|---------|------------------|----------------------|
| Per-screen overlay window | NSWindow per screen, level screenSaver | Layered window per monitor (Windows) / compositor overlay |
| Click-through overlay | ignoresMouseEvents = true | WS_EX_TRANSPARENT / input region pass-through |
| Bezier arc flight animation | Quadratic bezier, 60fps Timer | Same animation math |
| Triangle cursor avatar | Equitable triangle, configurable accent | SVG/Canvas rendering |
| 4 accent color presets | 4 swatches (blue, purple, green, orange) + custom picker | `OverlayPrefs::accent_presets`; `accent-changed` event applies to all overlay elements |
| Pet sprite animation | Running left/right, idle, waving states | Sprite sheet animation |
| Speech bubble with streaming text | Character-by-character timer, random delays | Same text streaming |
| Active control glow | 5 concentric rounded rects, pulsing blur | Similar glow shader |
| Secondary proxy cursors | Multiple temporary markers | Same — array of cursor objects |
| Visual guidance scribbles | Smooth bezier path with trim animation | Same — SVG path animation |
| Visual guidance rectangles | Top-left corner draw-in with dashes | Same stroke animation |
| Calibration box mode | Pulsing rect replaces avatar when calibrating | Same |
| Agent dock window | NSPanel, vertical agent stack, drag/drop, hover cards | Frameless panel, same layout |

### Coordinate Systems
- macOS: AppKit bottom-left origin -> SwiftUI top-left origin (Y-flip)
- Windows: native top-left origin (no flip needed)
- Linux: Wayland top-left origin (per-monitor)
- All guidance coordinates must be normalized to a common system

---

## 7. Agent Mode / Codex Runtime

| Feature | macOS (Original) | Cross-Platform Notes |
|---------|------------------|----------------------|
| Codex process management | Child process with stdin/stdout JSON-RPC | Same — Codex is Node.js, runs on all platforms |
| Codex home directory | ~/Library/Application Support/OpenClicky | Platform-appropriate app data dir |
| Config TOML generation | Model, skills, MCP server config | Same template — paths differ |
| Agent session lifecycle | Create, run, stop, archive, resume | Same state machine |
| Child worker spawning | Parallel agent tasks | Same |
| File lease coordination | Codex file lease system | Same |
| HUD dashboard | NSPanel 980x560, chat transcript, session management | Frameless window, same layout |
| Agent dock (status icons in overlay) | Per-session status dots + hover card | Same UI pattern |
| Drag-drop files onto agents | NSDragOperation | HTML5 drag-drop / similar |

### 7.1 Bundled Skills (63 skills)

| Category | Skills |
|----------|--------|
| **Screen & Control** | openclicky-screen-control (point, caption, screenshot, speak, clear), openclicky-screen-tour (multi-marker tours, speech, overlays) |
| **Google Workspace** | google-workspace-gogcli (Gmail, Calendar, Drive, Docs, Sheets, Slides, Chat, Contacts, Tasks, Admin, Groups) |
| **Development** | github-code-review, github-issues, github-pr-workflow, github-repo-management, codex, clicky-repo-operator, vercel-deploy, prototyping |
| **Creative** | creative-studio, animations |
| **Productivity** | apple-notes, apple-reminders, airtable, notion, linear, obsidian, maps, findmy |
| **Content** | youtube-content, research-reports, email-assistant, artifact-management |
| **Communication** | imessage, polymarket, spotify |
| **AI/Agent** | specialist-builder, openclicky-specialist-agents, skill-creator, skill-installer, find-skills, optimize-openclicky-skills |
| **System** | cua-driver, dev-setup-doctor |
| **Other** | blender, excalidraw, ocr-and-documents, powerpoint |

Skills are bundled in `AppResources/OpenClicky/OpenClickyBundledSkills/` and governed by `_shared/OpenClickySkillCompatibilityPolicy.md` with 4 permission classes.

---

## 8. External Control Bridge (HTTP API)

| Feature | macOS (Original) | Cross-Platform Notes |
|---------|------------------|----------------------|
| Local HTTP server | NWListener TCP on 127.0.0.1:32123 | TCP listener (same) — use actix-web (Rust) / Node.js / embedded HTTP |
| SSE event stream | GET /events — text/event-stream | Same SSE protocol |
| Token authentication | x-openclicky-token or Bearer, constant-time compare | Same |
| CORS preflight | OPTIONS handler | Same |
| MCP tool descriptors | GET /mcp/tools — tool list | Same JSON schema |
| All endpoints | See full table below | Platform-independent HTTP |

### HTTP Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | /health | Health check |
| GET | /mcp/tools | List tools |
| GET | /events | SSE stream |
| POST | /cursor | Show cursor pointer |
| POST | /cursors | Show multiple cursors |
| POST | /scribble | Draw freehand overlay |
| POST | /rectangle | Draw rectangle highlight |
| POST | /caption | Show caption text |
| POST | /screenshot | Capture screenshot |
| POST | /click | Left-click coordinates |
| POST | /clear | Clear overlay |
| POST | /speak | TTS speak |
| POST | /notify | Desktop notification |
| POST | /mcp/call | Single MCP tool call |
| POST | /mcp | JSON-RPC MCP |
| POST | /v1/messages | Anthropic proxy |
| POST | /v1/responses | OpenAI proxy |

### MCP Tools Exposed

1. `show_cursor` / `openclicky_point` — point at (x,y) with optional caption, duration, accent
2. `show_cursors` / `openclicky_point_many` — multiple secondary points
3. `show_caption` — caption text on screen
4. `show_scribble` — freehand path overlay
5. `show_highlight` / `show_rectangle` — rectangle overlay
6. `screenshot` — capture screen(s)
7. `click` / `openclicky_click` — left-click at coordinates
8. `speak` — TTS output
9. `notify` — system notification
10. `clear` — clear all overlays

---

## 9. Google Workspace Integration

| Feature | macOS (Original) | Cross-Platform Notes |
|---------|------------------|----------------------|
| Local CLI tool | gogcli (macOS brew install) | gogcli binaries available for Linux/Windows |
| Secure credential storage | OAuth client JSON, macOS Keychain | Platform keychain (no hosted OAuth) |
| Read scopes | Gmail, Calendar, Drive, Docs, Sheets, Slides, Chat, Contacts, Tasks, Admin, Groups | Same API scopes |
| Write guard | Explicit user intent required for writes | Same safety policy |
| Status check | Settings UI + check-gogcli-workspace.sh | Platform-appropriate status check |

---

## 10. Automations

| Feature | macOS (Original) | Cross-Platform Notes |
|---------|------------------|----------------------|
| Schedule model | Interval (seconds) + Cron (5-field) | Same |
| JSON persistence | ~/Library/Application Support/OpenClicky/automations.json | Platform app data dir |
| Timer tick | 30-second RunLoop timer | Same interval timer |
| System automations | "App skill discovery" every 6h (protected) | Same |
| Agent binding | Optional specialist agent slug per automation | Same |
| Automation editor UI | Name, Prompt, Schedule, Agent picker, Enabled toggle | Same form fields |

---

## 11. 3D Model Generation

| Feature | macOS (Original) | Cross-Platform Notes |
|---------|------------------|----------------------|
| Prompt-based 3D generation | Tripo3D API (text_to_model) | Same REST API |
| Styles | low_poly_stylized, clay, voxel, game_asset, realistic | Same |
| GLB output | Downloaded, saved to disk | Same |
| 3D viewer | SceneKit + GLTFSceneKit | Three.js / babylon.js / bevy |
| Polling | 2s interval, 300s timeout | Same |
| Security | Blocks private IP downloads | Same — server-side validation |

---

## 12. Desktop Widgets

| Feature | macOS (Original) | Cross-Platform Notes |
|---------|------------------|----------------------|
| Active Agents widget | Status dots, titles, captions | Platform widget system or in-app panel |
| Today Stats widget | Agents, Voice, Review counts | Same |
| Needs Attention widget | Failed agents, permissions, credentials | Same |
| Widget snapshot JSON | App group container, 15-min refresh | Local file or IPC |
| Deep links | openclicky://agents, settings, logs, memory | Custom URL scheme or in-app navigation |

---

## 13. Settings & Persistence

### Settings Sections

| Section | Key Options |
|---------|-------------|
| General | Cursor toggle, tutor mode, theme, glass tint/frosting, font, avatar style, cursor size |
| Voice | Response voice model, realtime voice, Deepgram config, activation mode, transcription provider, response captions, TTS provider, volume |
| AI Providers | API keys (OpenAI, Anthropic, ElevenLabs, Cartesia, Deepgram, AssemblyAI), Codex model, agent dock position |
| Computer Use | Screen pointing model, CUA backend, native CUA toggle, Background Computer Use |
| Permissions | Accessibility, Screen Recording, Microphone, Camera, Full Disk Access, notifications |
| Agents | (delegated to agent store) |
| Automations | (automation CRUD UI) |
| System & Logs | Google Workspace status, MCP servers, memory, widgets, logs, support |

### Persistence Mechanisms

| Data | Mechanism |
|------|-----------|
| General preferences | UserDefaults / localStorage |
| API keys | Secure storage (encrypted) |
| Automation schedules | JSON file |
| Agent sessions | JSON file |
| Widget snapshots | JSON file |
| Codex config | TOML file |
| MCP server config | Codex config.toml |
| Memory files | Plain text / markdown files |

---

## 14. Permissions (Platform-Specific)

| Permission | macOS | Windows | Linux |
|-----------|-------|---------|-------|
| Microphone | AVCaptureDevice.requestAccess | MediaCaptureInitialization | PulseAudio/ALSA |
| Screen Recording | ScreenCaptureKit | DXGI Desktop Duplication | PipeWire / X11 |
| Accessibility | AXIsProcessTrusted | UI Automation | AT-SPI / DBus |
| Notifications | UNUserNotificationCenter | Toast Notifications | D-Bus notifications |
| Camera | AVCaptureDevice.requestAccess | MediaCapture | V4L2 |

---

## 15. Technology Recommendations

### Option A: Tauri (Rust + Web Frontend) — RECOMMENDED
- **Backend**: Rust for system-level APIs (audio capture, screen capture, overlay windows, HTTP bridge, process management)
- **Frontend**: HTML/CSS/JS (React, Svelte, or Vue) for panel UI, settings, agent dashboard
- **Native plugins**: Custom Rust plugins for tray, overlay, global hotkeys, audio pipeline
- **Pros**: Small binary, cross-platform (Windows, Linux, macOS), strong ecosystem
- **Cons**: Need to write overlay rendering in native Rust or use WebView overlay with transparency

### Option B: Electron + Native Addons
- **Backend**: Node.js with native addons (C++/N-API) for system APIs
- **Frontend**: React/Vue/Svelte in Chromium
- **Pros**: Rapid UI development, large ecosystem
- **Cons**: Large binary, higher memory usage; overlay window transparency tricky

### Option C: Cross-Platform with Flutter
- **Desktop**: Windows, Linux, macOS from single codebase
- **Pros**: Single language (Dart), good UI toolkit
- **Cons**: Platform channels needed for system APIs; overlay compositing limited

### Critical Native Components (Must be per-platform)

1. **System tray** — Tauri tray API / Electron Tray / Flutter system_tray
2. **Global hotkeys** — global-hotkey (Rust) / electron-global-shortcut
3. **Audio capture** — cpal (Rust) / WebRTC / PortAudio
4. **Screen capture** — scrap (Rust) / DXGI (Windows) / PipeWire (Linux)
5. **Overlay window** — Platform-specific layered windows (always-on-top, click-through, per-monitor)
6. **Accessibility/UI Automation** — WinRT UI Automation (Windows) / AT-SPI (Linux)
7. **File system watcher** — notify (Rust) / fs.watch

---

## 16. Build & Distribution

| Feature | macOS (Original) | Cross-Platform Notes |
|---------|------------------|----------------------|
| Auto-updater | Sparkle (appcast.xml) | Tauri updater / electron-updater |
| Code signing | Apple Developer signing | MS Authenticode (Windows) / GPG (Linux) |
| Notarization | Apple notarization | Windows SmartScreen, Linux Flatpak/Snap |
| Release DMG | GitHub Releases | Platform packages (.exe, .msi, .AppImage, .deb, .rpm) |
| CI/CD | GitHub Actions | Same — expand matrix |

---

## 17. Implementation Phases

### Phase 1: Core Foundation (Months 1-2)
- System tray with menu
- Floating panel UI (basic)
- Global hotkey registration
- Local HTTP bridge
- Config file loading
- Platform overlay window (basic)

### Phase 2: Voice Pipeline (Months 2-4)
- Audio capture and playback
- Push-to-talk with multiple shortcut options
- Speech-to-text providers (OpenAI Whisper local, Deepgram)
- Text-to-speech providers (ElevenLabs, Edge)
- Audio level visualization
- Basic voice -> AI -> TTS pipeline

### Phase 3: AI Integration (Months 3-5)
- Claude API integration (SDK bridge + HTTP)
- OpenAI API integration
- Model catalog and provider selection
- Streaming response handling
- Visual guidance tag parsing ([POINT], [RECT], [SCRIBBLE])
- System prompt construction

### Phase 4: Agent Mode (Months 4-7)
- Codex process management
- Agent session lifecycle
- Agent HUD/dashboard
- Bundled skills loading
- Agent dock with status indicators
- File drag-drop to agents

### Phase 5: Screen Context & Overlay (Months 5-8)
- Screen capture (all screens, cursor screen, focused window)
- Cursor overlay with bezier arc animation
- Visual guidance overlays (scribble, rectangle, glow)
- Secondary proxy cursors
- Coordinate system normalization
- Calibration

### Phase 6: Advanced Features (Months 7-10)
- Wake word detection
- Google Workspace integration
- Automations system
- 3D model generation
- Desktop widgets
- MCP server configuration
- External control bridge (SSE, tool calls)
- Inference proxy endpoints

### Phase 7: Polish & Distribution (Months 9-12)
- Settings UI (all sections)
- Permission management
- Auto-updater
- Code signing
- Platform packages
- CI/CD pipeline
- Documentation

---

*Generated from OpenClicky codebase analysis — comprehensive feature catalog for cross-platform rebuild*
