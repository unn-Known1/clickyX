# ClickyX Agent Instructions

## Project Overview

ClickyX is a cross-platform AI desktop companion — voice, screen context, cursor overlay, background agents, computer use, and a local HTTP bridge. Built with **Tauri v2 (Rust) + React 19 + TypeScript**. Runs on Windows, Linux, and macOS. Zero cloud dependency, zero telemetry.

Full specification: `docs/PROJECT_SPEC.md` — the single source of truth for features, architecture, and implementation details.

---

## Key Rules

1. **Cross-platform first** — never write platform-specific code without equivalent implementations for all 3 platforms
2. **No macOS lock-in** — no Foundation, SwiftUI, AppKit, or Apple-only framework
3. **Local-first** — API keys are user-configured; no cloud sync, no hosted OAuth, no telemetry
4. **Bridge compatibility** — `localhost:32123` HTTP API must stay compatible with OpenClicky's spec
5. **Use AppContext** — all toasts and navigation go through `src/context/AppContext.tsx`, never `window.__`
6. **Use typed bindings** — all `invoke()` calls must reference `src/bindings.ts`
7. **Use react-query** — all server data fetching uses `useQuery`/`useMutation` — no raw `useState+useEffect+invoke` for data
8. **Tests for new hooks** — any new hook under `src/hooks/` must have a `.test.ts` sibling

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| App shell | Tauri v2 (Rust + WebView) |
| Audio | `cpal` crate |
| Screen capture | `xcap` crate |
| Input simulation | `enigo` crate |
| HTTP bridge | `actix-web` on `127.0.0.1:32123` |
| Frontend | React 19 + TypeScript + Vite |
| Global state | Zustand (`src/store/appStore.ts`) |
| Data fetching | `@tanstack/react-query` |
| i18n | `i18next` + `react-i18next` (EN/ES/FR/JA) |
| Overlay | Per-screen transparent `WebviewWindow` (`src/overlay/`) |
| AI providers | HTTP/WebSocket — Anthropic, OpenAI, Deepgram, ElevenLabs, etc. |
| Agent runtime | Codex (Node.js, already cross-platform) |
| System TTS | `tts` crate — SAPI (Windows), AVFoundation (macOS), Speech Dispatcher (Linux) |

---

## Verification Commands

```sh
cargo check                   # Rust compile check
cargo test --all-features     # Rust unit tests
npm run build                 # tsc + vite (frontend)
npm test                      # Vitest unit tests
npm run test:e2e              # Playwright E2E
npm run test:visual           # Playwright visual regression
```

---

## Key File Map

### Rust Backend (`src-tauri/src/`)

| File / Dir | Purpose |
|-----------|---------|
| `bridge.rs` | HTTP API on `localhost:32123` — 25+ endpoints, MCP real stdio JSON-RPC |
| `bridge_auth.rs` | Constant-time token auth middleware |
| `audio/pipeline.rs` | VAD loop, audio ducking, voice-agent handoff, always-on mode |
| `audio/handoff.rs` | `VoiceAgentHandoff` — phrase detection → `voice-agent-handoff` event |
| `audio/tts.rs` | TTS providers (ElevenLabs, Cartesia, Edge, Deepgram Aura, OpenAI Realtime, System TTS) |
| `audio/stt.rs` | STT providers (Deepgram, Whisper, AssemblyAI) |
| `audio/voices.rs` | 6-provider voice catalog (includes System TTS) |
| `ai/guidance.rs` | Annotation tag parser — POINT, RECT, SCRIBBLE, OFFER, HIGHLIGHT, SHAPE |
| `ai/app_contexts.rs` | Per-app CUA context injection (VS Code, Figma, Terminal, Blender, etc.) |
| `ai/catalog.rs` | Dynamic model catalog |
| `agent/session.rs` | Agent session lifecycle (create/run/stop/archive) |
| `agent/skills.rs` | Skills loader |
| `agent/codex.rs` | Codex sidecar process management |
| `agent/google.rs` | Google Workspace stub — returns `available: false`; OAuth2 not yet wired (gogcli dependency removed) |
| `screen/capture.rs` | xcap-based screenshot capture |
| `screen/auto_capture.rs` | Diff-based continuous capture engine |
| `screen/coordinate.rs` | Y-flip + coordinate normalization |
| `overlay/window_manager.rs` | Per-screen overlay windows + hotplug watcher |
| `overlay/screen_router.rs` | `CoordinateNormalizer`, `ScreenManager` |
| `overlay/lifecycle.rs` | Annotation lifecycle (armed → completed → missed) |
| `overlay/manager.rs` | Annotation manager + sweep task |
| `cua.rs` | `InputSimulator` — click, scroll, type, background mode |
| `permissions.rs` | Real OS checks — TCC sqlite3 (macOS), registry (Windows), pactl (Linux) |
| `automation/mod.rs` | Cron + interval scheduler with JSON persistence |
| `gen3d.rs` | Tripo3D API |
| `updater.rs` | Platform-aware updater with streaming progress events |
| `config.rs` | Config load/save/export/import/reset |
| `commands/` | Tauri command handlers by domain (`config/panel/chat/ai/screen/overlay/audio/agent/automation/mcp/system/cua_cmds` + `types`); re-exported so `commands::foo` paths keep working |
| `lib.rs` | App setup, plugin registration, deep-link handler |
| `tray.rs` | System tray setup |
| `type_mode.rs` | Double-tap Ctrl type mode |

### Frontend (`src/`)

| File | Purpose |
|------|---------|
| `App.tsx` | Shell: lazy tabs, splash screen, titlebar drag-region, panel drop zone, deep-link handler, `aria-current` on tabs |
| `AgentHUDApp.tsx` | Floating HUD window entry point |
| `main.tsx` | React 19 root — `QueryClientProvider` + i18n bootstrap |
| `bindings.ts` | **All typed `invoke()` wrappers — use this, never raw `invoke`** |
| `context/AppContext.tsx` | Toast + navigation — use `showToast()` and `setActiveTab()` here |
| `store/appStore.ts` | Zustand: agents, audio, today stats, attention items, status counts |
| `i18n/index.ts` | i18next config — EN/ES/FR/JA |
| `utils/agentStatus.ts` | `agentStatusColor()` / `agentStatusLabel()` — do not duplicate |
| `utils/sounds.ts` | `Sounds.agentLaunch()` etc. — sound effect player |
| `global.d.ts` | `window.__paletteSection`, `window.__deepLinkPending` |
| `hooks/useConfig.ts` | react-query config CRUD |
| `hooks/useAgents.ts` | react-query agents + mutations + `agent-state-changed` invalidation |
| `hooks/useChat.ts` | Streaming chat with per-session `sessionIdRef` scoping |
| `hooks/useConversations.ts` | Multi-thread conversation history |
| `components/HomeTab.tsx` | Hero, dynamic suggestions, agent dock strip, empty-state CTA |
| `components/AgentsTab.tsx` | Agent CRUD, skill management, slug auto-derive, drag-drop, HUD pop-out |
| `components/AgentHUD.tsx` | Floating HUD — transcript, diff, activity timeline |
| `components/ConnectionsTab.tsx` | Google Workspace status (shows unavailable message, no gogcli), MCP CRUD, automations, app usage log |
| `components/SettingsTab.tsx` | 7 sections with icon nav, group headers, scroll memory |
| `components/SettingsSections/AppearanceSettings.tsx` | Theme, accent variants, color picker |
| `components/SettingsSections/OverlayPrefsSettings.tsx` | Cursor size, opacity |
| `components/SettingsSections/CaptureSettings.tsx` | Auto-capture config |
| `components/SettingsSections/VoiceSettings.tsx` | PTT presets, STT/TTS, always-on, voice discovery |
| `components/CommandPalette.tsx` | Ctrl+K fuzzy palette |
| `components/StatusBar.tsx` | Audio meter, capture state, attention pill, today stats |
| `components/HotkeyInput.tsx` | Key-capture widget |
| `components/SkeletonLoader.tsx` | `SkeletonLine`, `SkeletonCard`, `SkeletonList` |
| `components/OnboardingWizard.tsx` | 5-step first-run wizard |
| `components/OnboardingMedia.tsx` | Onboarding video with SVG fallback |
| `components/Icon.tsx` | Shared SVG icon set (30+ icons) |
| `components/UpdateBanner.tsx` | Auto-updater notification |
| `components/AboutDialog.tsx` | Version + links dialog |
| `components/ModelSelector.tsx` | react-query model list; filters by configured providers; shows setup prompt when no API key |
| `overlay/OverlayApp.tsx` | Glow, calibration, waveform (real amplitude), cursors, captions, dock, HIGHLIGHT/SHAPE, AlwaysListeningIndicator; pet sprite shown while AI active or always-listening (deprecated — see REVIEW_REPORT P1) |
| `overlay/overlay.css` | Overlay-specific styles |
| `styles/theme.css` | All panel styles, semantic color tokens, 6 accent variants |

### Tests

| File | Covers |
|------|--------|
| `src/context/AppContext.test.tsx` | Toast add/dismiss/error, navigation |
| `src/hooks/useChat.test.ts` | Empty state, streaming, cancel, clear |
| `src/hooks/useConversations.test.ts` | Create/delete/update/persist/rename |
| `src/hooks/useAgents.test.ts` | Agent list, mutations, error paths |
| `src/hooks/useConfig.test.ts` | Config load/update, error paths |
| `src/hooks/useAiConfig.test.ts` | AI config load/update |
| `src/hooks/useAudioConfig.test.ts` | Audio config load/update |
| `src/hooks/useOverlay.test.ts` | Overlay commands + args |
| `src/hooks/useScreenCapture.test.ts` | Capture commands, error paths |
| `src/hooks/useVision.test.ts` | Data-URL parsing, ordering, remove |
| `src/components/CommandPalette.test.tsx` | Search, keyboard nav, click, backdrop |
| `src/utils/agentStatus.test.ts` | Status color/label, map completeness |
| `src/test-setup.ts` | Global Tauri mocks + react-i18next mock |
| `e2e/app.spec.ts` | Tab bar, tab switching, Ctrl+K |
| `e2e/chat.spec.ts` | Chat messages area, input focus |
| `e2e/settings.spec.ts` | Settings tab navigation |
| `e2e/visual.spec.ts` | `toHaveScreenshot()` for 4 tabs + palette + status bar |

---

## Build Status

- `cargo check` — passes (run from `src-tauri/`)
- `cargo test --all-features` — passes (139 Rust tests)
- `npm run build` — passes (TypeScript + Vite)
- `npm test` — 12 test files, 90 cases passing
- CI: Check (ubuntu: build + unit + clippy `-D warnings` + `cargo fmt --check`) + Build (ubuntu/windows/macos) + E2E (ubuntu, Playwright) — **PASSING**
- Release: v0.2.0 tagged; GitHub releases ship as **drafts** until manually published (the updater only sees published releases)
- Flatpak: Build passing
- macOS: `--bundles dmg,app` + `macOSPrivateApi: true` for overlay transparency

---

## Dependencies

```json
"react-markdown": "^9",
"remark-gfm": "^4",
"rehype-highlight": "^7",
"highlight.js": "^11",
"three": "^0.170",
"i18next": "^23",
"react-i18next": "^14",
"@tanstack/react-query": "^5",
"zustand": "^5",
"@tauri-apps/plugin-updater": "^2",
"@tauri-apps/plugin-deep-link": "^2"
```

Dev:
```json
"@types/three": "^0.170",
"@testing-library/user-event": "^14",
"@playwright/test": "^1",
"eslint": "^10",
"typescript-eslint": "^8",
"eslint-plugin-react-hooks": "^7",
"globals": "^16"
```

---

## Git Config

```sh
git config user.name "unn-Known1"
git config user.email "ptelgm.yt@gmail.com"
```

---

## External Action Items (requires repo owner, not code changes)

| Item | Action |
|------|--------|
| macOS signing | Set `APPLE_SIGNING_IDENTITY`, `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_NOTARIZATION_USERNAME`, `APPLE_NOTARIZATION_PASSWORD` as GitHub secrets |
| Windows signing | Set `WINDOWS_SIGNING_CERT` (base64 PFX) and `WINDOWS_SIGNING_PASSWORD` as GitHub secrets |
| Update signing (P0-T3) | Generate once (`minisign -G -p update.pub -s update.key`); set `UPDATE_SIGNING_KEY_B64` (base64 of the secret key file) and `UPDATE_SIGNING_PUBKEY` (pubkey string). Without these, release artifacts ship unsigned and the in-app updater refuses them |
| Audio assets | Add `.mp3` files to `public/sounds/` (see `public/sounds/README.md`) |
| Onboarding video | Add `intro.mp4` to `public/onboarding/` (SVG fallback already rendered) |
