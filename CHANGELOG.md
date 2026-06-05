# Changelog

All notable changes to ClickyX are documented here.

## [Unreleased]

---

## [0.1.2] - 2026-06-05

### Fixed — Cross-Platform Compilation

- **Linux**: Resolved all 17 Linux build/runtime bugs — missing dependencies, packaging, and system integration
- **macOS**: Resolved all 17 macOS build/runtime/signing bugs — privacy descriptions via `Info.plist`, code signing compatibility, NSIS config cleanup
- **Windows**: Fixed `embed_resource` VERSION duplication causing LNK1123; fixed `MessageBoxA` type mismatch (`c_char` vs `u8`); removed invalid `webviewInstallMode` from NSIS config
- **VoicePipeline**: Made `Send+Sync` by moving `AudioCapture` (with non-Send `cpal::Stream`) to a dedicated capture thread — eliminates deadlock risk in async contexts
- **Tray**: Fixed exit prevention so the app lives in tray instead of fully quitting on window close
- **Config**: Fixed `cfg-gated` field access on non-Windows, `map_err` return type mismatch in screen capture, `Option<&str>` vs `Option<String>` type mismatch in accessibility

### Changed — Infrastructure

- **CI**: Linux builds now run on `ubuntu-22.04` instead of `ubuntu-latest` — produces binaries with glibc 2.35 compatibility for older Ubuntu/Debian systems
- **DEB**: Updated package dependencies to match Ubuntu 22.04 (`libxdo3` replaces `libxdo1`)

---

## [0.1.1] - 2026-06-04

### Added — Frontend UI Audit (Phase A–D)

- **AppContext** replaces all `window.__` globals for toast notifications and tab navigation
- **Zustand global store** (`src/store/appStore.ts`) for agents, audio level, today stats, attention items
- **react-query** (`@tanstack/react-query`) bootstrapped in `src/main.tsx`
- **i18n** with `i18next` + `react-i18next`; English and Spanish locales
- **CommandPalette** component — Ctrl+K shortcut, search over all settings sections and tabs
- **StatusBar** component — audio meter, capture state, today's stats, attention count
- **UpdateBanner** component — auto-updater banner via `@tauri-apps/plugin-updater`
- **AboutDialog** component — version, GitHub link
- **HotkeyInput** component — key-capture widget replacing free-text PTT field
- **Icon** component — 30+ named SVG icons
- **ModelGeneratorTab** component — Tripo3D 3D model generation UI
- **ThreeModelViewer** component — Three.js GLB orbit viewer (lazy-loaded)
- `useConversations` hook — multi-conversation history backed by sessionStorage
- Conversation history sidebar in ChatTab
- Chat message timestamps, copy button, regenerate button
- Stop streaming button in ChatTab
- Drag-and-drop image attachment in ChatTab
- Draft message persistence in ChatTab
- `react-markdown` + `remark-gfm` + `rehype-highlight` for markdown rendering
- Scroll memory per settings sub-tab
- 3D Models section in SettingsTab
- Cron expression UI for automations (alongside interval)
- MCP server `env` key=value editor in ConnectionsTab
- Onboarding wizard wired as first-run gate (`onboarding_completed` flag)
- `src/bindings.ts` — typed wrappers for all `invoke()` calls
- `src/utils/agentStatus.ts` — shared `agentStatusColor` / `agentStatusLabel` utilities
- Favicon (`public/favicon.svg`)

### Fixed — Frontend

- Safe environment-aware mock Tauri v2 API fallbacks in browser environments to prevent UI crashes during development and testing
- `window.__` globals replaced with `AppContext` throughout
- Modal portal mounted at App root
- `window.innerWidth` moved to component scope (no SSR hazard)
- Voice orbit stale-closure fix in `OverlayApp.tsx`
- Overlay `OverlayErrorBoundary` added
- Overlay resize handler wired
- Active-control glow (5 concentric rings) on overlay
- Calibration box mode on overlay
- `AgentDockStrip` auto-derive slug from name
- `useChat.sendMessage` dead code removed
- `useAgents.getAgentStatus` / `getAgentTranscript` dead code removed
- `ScreenPreview.monitor_id` removed

### Added — Backend (All 8 Phases)

- Phase 1: Bridge API completion — all `/v1/messages`, `/v1/responses`, `/models`, `/screenshot`, overlay endpoints, `/speak`, `/transcribe`, `/audio-level`, `/events` (SSE), `/notify`, `/mcp/tools`, `/mcp/call`, `/agents`, `/agent/*`, `/skills`
- Phase 2: Annotation lifecycle — cursor, rectangle, scribble, caption, clear with per-screen targeting; annotation TTL/sweep
- Phase 3: Multi-monitor overlay — per-screen WebView windows, screen router, window manager
- Phase 4: Streaming overlay UI — streaming caption support, pet sprite, glow rings
- Phase 5: Always-on voice — wake word detection, VAD, silence timeout, always-on pipeline
- Phase 6: CUA click execution — `enigo`-based click injection, rate limiting
- Phase 7: Skills system — skill loader, 11 built-in skills, per-agent skill enable/disable
- Phase 8: Onboarding & permissions — permission checks per platform (stub), onboarding config flag
- `bridge_token` authentication via `X-Bridge-Token` header
- Auto-capture subsystem with diff threshold and configurable interval
- `type_mode` toggle with double-tap timeout
- Tripo3D 3D model generation API (`gen3d.rs`)
- Automation CRUD with interval and cron scheduling
- MCP server configuration management
- Agent session store with transcript
- Model catalog with NVIDIA NIM support
- Configurable `openai_base_url` for any OpenAI-compatible endpoint
- 4 default accent color presets in overlay config

### Added — Infrastructure

- GitHub Actions CI: Check (ubuntu) + Build matrix (ubuntu/windows/macos)
- Nightly workflow: builds all 3 platforms, creates pre-release with artifacts
- Release workflow: tag-triggered (`v*`), produces `.AppImage`, `.deb`, `.exe`, `.msi`
- `cargo check` passes (76 dead_code warnings noted, non-blocking)
- `npm run build` passes (TypeScript + Vite)
- `npm test` — 5 test files, 30+ cases (Vitest)
- `cliff.toml` for conventional-commit changelog generation
- `.gitattributes`, `SECURITY.md`, `CONTRIBUTING.md`, `LICENSE`
- Release profile: LTO fat, strip symbols, codegen-units=1

### Tests Added

- `src/context/AppContext.test.tsx` — toast + navigation context
- `src/hooks/useChat.test.ts` — streaming chat hook
- `src/hooks/useConversations.test.ts` — conversation history
- `src/components/CommandPalette.test.tsx` — search, navigation, keyboard
- `src/utils/agentStatus.test.ts` — color/label utility
- `src/test-setup.ts` — global Tauri mock setup

### Accessibility

- `aria-selected` on tab buttons
- `role=tab/tabpanel` on main navigation
- `aria-live` on toast container
- `prefers-reduced-motion` respected

---

## [0.1.0] - 2026-06-03

### Added

- Initial ClickyX project scaffolding — Tauri v2 + React 19 + TypeScript + Vite
- Core Rust backend structure: `main.rs`, `lib.rs`, `commands.rs`
- `config.rs` — JSON config load/save with platform config dir
- `bridge.rs` — actix-web HTTP server on `localhost:32123`
- `audio/` — cpal audio capture, Deepgram STT, ElevenLabs TTS, PTT pipeline
- `ai/` — Anthropic and OpenAI providers, streaming, model catalog
- `overlay/` — multi-monitor WebView overlay windows
- `agent/` — Codex agent session store, skills loader, Google Workspace check
- `screen/` — xcap screen capture, JPEG encoding
- `cua.rs` — enigo-based click injection
- `gen3d.rs` — Tripo3D API integration
- `permissions.rs` — permission check stubs (per-platform)
- `tray.rs` — system tray icon and menu
- `updater.rs` — Tauri updater integration
- Frontend: HomeTab, ChatTab, AgentsTab, ConnectionsTab, SettingsTab and all sub-sections
- Frontend: OnboardingWizard, OverlayApp
- NVIDIA NIM API support via configurable `openai_base_url`
- Cross-platform CI/CD (Linux, Windows, macOS)

[Unreleased]: https://github.com/unn-Known1/clickyX/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/unn-Known1/clickyX/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/unn-Known1/clickyX/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/unn-Known1/clickyX/releases/tag/v0.1.0
