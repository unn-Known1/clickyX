# ClickyX — Pending Implementation Items

> **Generated:** 2026-06-04
> **Sources:** `FEATURE_SPEC.md`, `FRONTEND_UI_AUDIT.md`, `CLICKY_APP_ANALYSIS.md`, `AGENTS.md`, `specs/001`–`specs/008` tasks.md files, live source tree scan
> **Status:** This document supersedes the "Remaining (non-blocking)" list in `AGENTS.md`. All items here are confirmed unimplemented by cross-referencing source files.

---

## Important Discrepancy Note

`AGENTS.md` claims "All 8 Phases + Full UI Audit Complete ✅" — this analysis found that claim is **optimistic** in several areas:

- Two spec `tasks.md` files contain **unchecked tasks** (T007 hotplug, T011 VAD pause).
- Three backend modules are **entirely stubs**: `permissions.rs`, `accessibility/*.rs`, `bridge.rs` MCP endpoints.
- The audit's own §4.5 "still pending" architecture items (A2, A3, A4, A6, A8, A9, A10, A12) remain unresolved.
- `react-query` is bootstrapped but **zero `useQuery` calls exist** — data layer migration never happened.
- Skills catalog is at **11/63 (17%)** of spec target.
- Waveform visualization uses **randomized fake data**, not real audio amplitude.

---

## BLOCKING — Prevents Core Features from Functioning

### Backend

| ID | Item | File(s) | Spec Ref |
|----|------|---------|----------|
| B-001 | Permissions system is entirely stubs — no real mic/screen/accessibility/camera/notification checks on any platform. All three platform branches log a warning and return immediately. | `src-tauri/src/permissions.rs:153–200` | `FEATURE_SPEC.md §14`, `specs/008` |
| B-002 | Accessibility tree is entirely stubs — no AT-SPI (Linux), UIA (Windows), or AXIsProcessTrusted (macOS) calls made. All three platform files return hardcoded `AccessibilityElement::stub(...)`. | `src-tauri/src/accessibility/windows.rs`, `linux.rs`, `macos.rs` | `FEATURE_SPEC.md §15`, `CLICKY_APP_ANALYSIS.md §3.5` |
| B-003 | MCP tool listing (`GET /mcp/tools`) returns a single hardcoded placeholder. `POST /mcp/call` never invokes a real MCP server process — returns a static format string. | `src-tauri/src/bridge.rs:721–733` | `FEATURE_SPEC.md §8`, `specs/001 FR5` |
| B-004 | VAD pause during TTS playback is incomplete — spec task T011 is unchecked. No audio ducking or guaranteed barge-in suppression during TTS. | `src-tauri/src/audio/pipeline.rs:500–501`, `specs/005-always-on-voice/tasks.md:20` | `FEATURE_SPEC.md §3.2`, `specs/005` |
| B-005 | Display hotplug (monitor connect/disconnect) is not handled — spec task T007 is unchecked. No event listener in window manager or screen router. | `src-tauri/src/overlay/window_manager.rs`, `src-tauri/src/overlay/screen_router.rs`, `specs/003-multi-monitor-overlay/tasks.md:16` | `FEATURE_SPEC.md §6`, `specs/003` |

### Frontend

| ID | Item | File(s) | Spec Ref |
|----|------|---------|----------|
| F-001 | No E2E tests exist — no Playwright, Tauri WebDriver, or Spectron setup anywhere in the repo. | — | `FRONTEND_UI_AUDIT.md §4.6 T2` |
| F-002 | No visual regression tests — no Chromatic, Percy, or screenshot-diff tooling. | — | `FRONTEND_UI_AUDIT.md §4.6 T3` |
| F-003 | `@tanstack/react-query` is bootstrapped in `main.tsx` but zero `useQuery`/`useMutation` calls exist in any hook or component. All data fetching is still raw `useState + useEffect + invoke()`. The data layer migration never happened. | `src/main.tsx:3,7,22`, all `src/hooks/` | `FRONTEND_UI_AUDIT.md §4.5 A2` |

---

## HIGH — Significant Spec Deviation or Major User-Visible Gap

### Backend

| ID | Item | File(s) | Spec Ref |
|----|------|---------|----------|
| B-006 | Voice-agent handoff not wired — `handoff.rs` struct exists but the flow of STT transcript → trigger detection → confirmation prompt → Codex agent spawn is never connected. Voice pipeline and agent system remain independent. | `src-tauri/src/audio/handoff.rs` | `FEATURE_SPEC.md §3`, `specs/005 FR2`, `CLICKY_APP_ANALYSIS.md §3.4` |
| B-007 | Google Workspace integration requires pre-installed `gogcli` CLI with no OAuth flow, no install helper, and no bundled binary. The UI only shows a status check. | `src-tauri/src/agent/google.rs:55–152`, `src/components/ConnectionsTab.tsx` | `FEATURE_SPEC.md §9`, `CLICKY_APP_ANALYSIS.md §3.6` |
| B-008 | CUA `scroll(delta_x, delta_y)` method is absent from `cua.rs` despite being required by spec FR1.6. | `src-tauri/src/cua.rs`, `specs/006-cua-click-execution/spec.md FR1.6` | `FEATURE_SPEC.md §3.5` |
| B-009 | Skills catalog: **11 of 63** spec-target skills implemented (17%). Entire missing categories: Google Workspace, GitHub/dev tools, Creative (Blender, animations), Productivity (Notion, Linear, Obsidian, Airtable), Communication (iMessage, Spotify), AI meta-skills, System (cua-driver, dev-setup-doctor), and more. | `skills/` directory | `FEATURE_SPEC.md §7.1`, `CLICKY_APP_ANALYSIS.md §3.7` |
| B-010 | Agent HUD is an inline tab, not a separate floating window. The spec and macOS original use a dedicated 980×560 `NSPanel`-equivalent with progress dashboard, task status, file diffs, and activity timeline. | `src/components/AgentsTab.tsx` | `FEATURE_SPEC.md §7`, `CLICKY_APP_ANALYSIS.md §3.4` |
| B-011 | File drag-drop onto agent cards is missing in both the Rust event handler and the frontend — no `onDrop` handlers on agent cards. | `src/components/AgentsTab.tsx`, `src/components/HomeTab.tsx`, `src-tauri/src/agent/` | `FEATURE_SPEC.md §7`, `FRONTEND_UI_AUDIT.md §2.2` |
| B-012 | macOS overlay transparency is blocked — requires Tauri >2.11.2 with `macos-private-api`. Current version produces an opaque overlay on macOS. | `src-tauri/tauri.conf.json` | `FEATURE_SPEC.md §6`, `AGENTS.md` |

### Frontend

| ID | Item | File(s) | Spec Ref |
|----|------|---------|----------|
| F-004 | `GeneralSettings.tsx` is a 319-line monolith handling theme, overlay prefs, accent color, cursor size, and auto-capture — split is deferred but still pending. | `src/components/SettingsSections/GeneralSettings.tsx` | `FRONTEND_UI_AUDIT.md §4.4 L15` |
| F-005 | No accent-based theme variants (e.g. "Sunset", "Forest") — only `--accent` and `--accent-hover` CSS variables exist; no named palettes. | `src/styles/theme.css` | `FRONTEND_UI_AUDIT.md §4.4 L4`, `AGENTS.md` |
| F-006 | No semantic color token system — no `--color-success`, `--color-danger`, `--color-warning` tokens. Success/error/warning states use hardcoded hex values. | `src/styles/theme.css` | `FRONTEND_UI_AUDIT.md §7 Phase E.1` |
| F-007 | File drag-drop onto agent cards not implemented in frontend — no `onDrop` handlers. | `src/components/AgentsTab.tsx`, `src/components/HomeTab.tsx` | `FRONTEND_UI_AUDIT.md §2.2` |
| F-008 | File drag-drop onto the main panel (non-chat) not implemented — spec §2 requires attaching files to any interaction from the floating panel itself. | `src/App.tsx` | `FEATURE_SPEC.md §2`, `FRONTEND_UI_AUDIT.md §2.2` |
| F-009 | Only `SettingsTab` is lazy-loaded. `HomeTab`, `AgentsTab`, and `ConnectionsTab` are eagerly imported, increasing TTI. | `src/App.tsx:3–5` | `FRONTEND_UI_AUDIT.md §4.5 A8` |
| F-010 | No panel drag handle — the frameless window has no `data-tauri-drag-region` attribute or visible affordance for repositioning the panel. | `src/App.tsx`, `src/styles/theme.css` | `FRONTEND_UI_AUDIT.md §2.2` |
| F-011 | No MCP server health check or "Test" button — users cannot validate a server command before saving. | `src/components/ConnectionsTab.tsx` | `FRONTEND_UI_AUDIT.md §2.2` |
| F-012 | Google Workspace auth flow UI is absent — only a status display exists; no OAuth setup, credential entry, or gogcli installation guide. | `src/components/ConnectionsTab.tsx` | `FEATURE_SPEC.md §9`, `FRONTEND_UI_AUDIT.md §2.2` |
| F-013 | Multiple PTT shortcuts not supported in UI — spec requires several configurable options (Shift+Fn, Ctrl+Option, etc.); UI exposes only a single `HotkeyInput`. | `src/components/SettingsSections/VoiceSettings.tsx` | `FEATURE_SPEC.md §3.1`, `FRONTEND_UI_AUDIT.md §2.2` |
| F-014 | No always-listening overlay indicator — when wake-word mode is active there is no visual feedback in the overlay beyond the StatusBar. | `src/overlay/OverlayApp.tsx` | `FRONTEND_UI_AUDIT.md §2.2` |
| F-015 | `openclicky://` deep-link navigation not handled in the frontend router — `window.__paletteSection` exists but is not a URL scheme handler. | `src/App.tsx`, `src/global.d.ts` | `FEATURE_SPEC.md §12`, `FRONTEND_UI_AUDIT.md §2.2` |

### Infrastructure

| ID | Item | File(s) | Spec Ref |
|----|------|---------|----------|
| I-001 | macOS release produces a bare `.app` bundle instead of a distributable `.dmg` — users cannot install via standard macOS drag-to-Applications. | `.github/workflows/release.yml:51` | `FEATURE_SPEC.md §16`, `AGENTS.md` |
| I-002 | macOS code signing secrets not configured — `APPLE_SIGNING_IDENTITY`, `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD` are undocumented as configured; notarization step is gated and likely skipped. | `.github/workflows/release.yml:63,75–77` | `FEATURE_SPEC.md §16`, `AGENTS.md` |
| I-003 | Windows code signing not configured — no `signtool.exe` or Authenticode certificate step; SmartScreen will block unsigned downloads. | `.github/workflows/release.yml` | `FEATURE_SPEC.md §16` |

### HeyClicky Parity

| ID | Item | File(s) | Spec Ref |
|----|------|---------|----------|
| P-001 | Background Computer Use (BCU) mode not implemented — HeyClicky sends input without warping the visible cursor; cross-platform equivalent not in `cua.rs`. | `src-tauri/src/cua.rs`, `specs/006/spec.md FR3` | `CLICKY_APP_ANALYSIS.md §3.5` |
| P-002 | No app-specific CUA skill contexts — HeyClicky injects per-app tool descriptions for 10+ apps (Premiere, Figma, VSCode, Xcode, etc.). No equivalent exists. | `src-tauri/src/agent/`, `src-tauri/src/ai/` | `CLICKY_APP_ANALYSIS.md §3.5` |

---

## MEDIUM — UX Gaps, Architectural Debt, Incomplete Features

### Backend

| ID | Item | File(s) | Spec Ref |
|----|------|---------|----------|
| B-013 | 76 `dead_code` warnings in `cargo check` — can mask real unused stubs being shipped. | `src-tauri/src/` | `AGENTS.md` build status |
| B-014 | No Rust unit tests for most modules — only `pipeline.rs` has tests. `bridge.rs`, `cua.rs`, `gen3d.rs`, `tray.rs`, `updater.rs`, `config.rs`, `agent/google.rs`, `agent/skills.rs`, `automation/mod.rs` have zero coverage. | `src-tauri/src/` | `FEATURE_SPEC.md §17` |
| B-015 | Audio ducking during always-on voice not implemented — spec requires system volume drop to 8% on wake and restore on finish. | `src-tauri/src/audio/pipeline.rs`, `src-tauri/src/audio/tts.rs` | `FEATURE_SPEC.md §3.2`, `specs/005 FR1` |
| B-016 | `openclicky://` URL scheme not registered in Tauri config — no deep-link plugin configuration found. | `src-tauri/tauri.conf.json` | `FEATURE_SPEC.md §12`, `FRONTEND_UI_AUDIT.md §2.2` |
| B-017 | Typed Tauri bindings in `src/bindings.ts` are hand-written, not generated from Rust source via `ts-rs` or `specta`. Will silently drift when Rust commands change. | `src/bindings.ts`, `src-tauri/Cargo.toml` | `FRONTEND_UI_AUDIT.md §4.5 A3` |

### Frontend

| ID | Item | File(s) | Spec Ref |
|----|------|---------|----------|
| F-016 | All data hooks use raw `useState + useEffect + invoke()` — no request deduplication, no background refetching, no stale-while-revalidate from react-query. | `src/hooks/useConfig.ts`, `src/hooks/useAgents.ts`, others | `FRONTEND_UI_AUDIT.md §4.5 A2, A6` |
| F-017 | Most hooks lack cancellation on unmount and stale-state guards — can cause `setState` on unmounted components. Only `useChat.ts` has proper cleanup. | `src/hooks/useConfig.ts`, `src/hooks/useAgents.ts` | `FRONTEND_UI_AUDIT.md §4.5 A6` |
| F-018 | Overlay registers 11 `listen()` calls in `useEffect` — if any `.then()` resolves after unmount before cleanup runs, React will warn about setState on an unmounted component. | `src/overlay/OverlayApp.tsx` | `FRONTEND_UI_AUDIT.md §5` |
| F-019 | `startStreamingCaption` has a stale-closure bug — the `entry` object captured at stream start can be replaced by state updates mid-stream. | `src/overlay/OverlayApp.tsx` | `FRONTEND_UI_AUDIT.md §5` |
| F-020 | Pet sprite animation runs a 60fps `requestAnimationFrame` loop even when the overlay window is hidden — unnecessary CPU usage. | `src/overlay/OverlayApp.tsx` | `FRONTEND_UI_AUDIT.md §5` |
| F-021 | Agent `promptInput` not persisted across tab navigation or page reload — stored as component state only. | `src/components/AgentsTab.tsx` | `FRONTEND_UI_AUDIT.md §5` |
| F-022 | Agent slug must be manually entered in create form — should auto-derive from the name field (kebab-case). | `src/components/AgentsTab.tsx` | `FRONTEND_UI_AUDIT.md §5` |
| F-023 | No automation run history UI — the automation editor supports create/toggle/delete/cron but shows no past run records, outcomes, or last-run timestamp. | `src/components/ConnectionsTab.tsx` | `FEATURE_SPEC.md §10`, `FRONTEND_UI_AUDIT.md §2.2` |
| F-024 | MCP server `args` field uses fragile comma-separated text input — breaks if any argument contains a comma. | `src/components/ConnectionsTab.tsx` | `FRONTEND_UI_AUDIT.md §5` |
| F-025 | Agent status widgets show only running/idle counts — "done" and "error" states are not surfaced. | `src/components/StatusBar.tsx`, `src/store/appStore.ts` | `FRONTEND_UI_AUDIT.md §5` |
| F-026 | Home tab suggestion chips are hardcoded — no dynamic suggestions from recent usage, screen context, or AI model. | `src/components/HomeTab.tsx` | `FRONTEND_UI_AUDIT.md §5` |
| F-027 | No "Create your first agent" empty-state CTA on Home tab — `AgentDockStrip` renders nothing when `agents.length === 0`. | `src/components/HomeTab.tsx` | `FRONTEND_UI_AUDIT.md §5` |
| F-028 | No `aria-current="page"` on active main tab buttons — tabs use `aria-selected` but not the `aria-current` pattern. | `src/App.tsx` | `FRONTEND_UI_AUDIT.md §4.4 L7` |
| F-029 | Global `stream-event` listener tied to `ChatTab` — only one chat session can stream simultaneously; multi-session streaming is architecturally blocked. | `src/hooks/useChat.ts`, `src/components/ChatTab.tsx` | `FRONTEND_UI_AUDIT.md §4.5 A9` |
| F-030 | `useState`-as-store pattern persists across complex components — Zustand is not used for local component state that needs sharing. | multiple components | `FRONTEND_UI_AUDIT.md §4.5 A10` |
| F-031 | No splash screen, startup update check progress, or release notes modal on launch. | `src/App.tsx` | `FRONTEND_UI_AUDIT.md §2.2` |

### Infrastructure

| ID | Item | File(s) | Spec Ref |
|----|------|---------|----------|
| I-004 | No Flatpak, Snap, or RPM packaging — only `.AppImage` and `.deb` are produced for Linux. | `.github/workflows/release.yml` | `FEATURE_SPEC.md §16` |
| I-005 | `cargo test` is not run in CI — Rust unit tests (in `pipeline.rs`) are never automatically validated. | `.github/workflows/ci.yml` | `AGENTS.md` |
| I-006 | No delta/patch update mechanism — full binary download on every update. | `src-tauri/src/updater.rs` | `FEATURE_SPEC.md §16` |

### HeyClicky Parity

| ID | Item | File(s) | Spec Ref |
|----|------|---------|----------|
| P-003 | No bundled audio assets — HeyClicky ships `agent-close.mp3`, `agent-done.mp3`, `agent-launch.mp3`, `clicky-question.wav`, `clicky-surprised.wav`, and 22+ voice preview MP3s. | `public/` | `CLICKY_APP_ANALYSIS.md §7` |
| P-004 | No onboarding intro video or splash media — HeyClicky ships `onboarding-intro-v2.mp4` and a 660×400 welcome image. | `public/` | `CLICKY_APP_ANALYSIS.md §7` |
| P-005 | `[HIGHLIGHT]` and `[SHAPE:arrow|curve]` annotation tags not parsed — `ai/guidance.rs` only handles POINT, RECT, SCRIBBLE, OFFER. | `src-tauri/src/ai/guidance.rs` | `CLICKY_APP_ANALYSIS.md §3.3` |
| P-006 | Waveform visualization uses randomized fake bar heights — spec requires real audio amplitude data from `capture.rs` at <50ms latency. | `src/overlay/OverlayApp.tsx` | `specs/004/spec.md`, `CLICKY_APP_ANALYSIS.md §3.3` |

### Documentation

| ID | Item | File(s) | |
|----|------|---------|--|
| D-001 | `CONFIGURATION.md` schema is incomplete — missing: `bridge_token`, `computer_use.*`, `overlay.accent_presets`, `audio.always_on_config`, `audio.vad_sensitivity`, `mcp_servers[]`, `automations[]`, `onboarding_completed`. | `docs/CONFIGURATION.md` | |
| D-003 | No bridge API reference — no `BRIDGE_API.md` documenting `localhost:32123` endpoints for external tool authors. | `docs/` | |

---

## LOW — Polish, Cosmetic, Optional

| ID | Category | Item | File(s) |
|----|----------|------|---------|
| F-032 | Frontend | Deprecated `window.__setActiveTab` and `window.__showToast` still declared in `global.d.ts` — available for accidental misuse. | `src/global.d.ts:3–5` |
| F-033 | Frontend | No `Suspense` boundary on `AgentsTab`, `ChatTab`, or `ConnectionsTab` — only `SettingsTab` is lazy-loaded. | `src/App.tsx:3–5` |
| F-034 | Frontend | Single 2,089+ line `theme.css` monolith — no CSS modules, design token files, or per-component splitting. | `src/styles/theme.css` |
| F-035 | Frontend | Only EN and ES i18n locales — structure exists for more but no additional translations. | `src/i18n/index.ts` |
| F-036 | Frontend | Settings sub-navigation has no icons or visual grouping. | `src/components/SettingsTab.tsx` |
| F-037 | Frontend | No branded empty-state illustrations or loading skeleton variants. | `src/styles/` |
| I-007 | Infrastructure | `SETUP.md` has wrong repository URL — `https://github.com/clickyx/clickyx.git` instead of `https://github.com/unn-Known1/clickyX`. | `docs/SETUP.md:37` |
| D-002 | Docs | `SETUP.md` wrong clone URL (same as I-007). | `docs/SETUP.md:37` |
| D-004 | Docs | No `CHANGELOG.md` despite `cliff.toml` being present for conventional-commit generation. | root directory |
| P-007 | Parity | App usage logging has no frontend surface — data is collected backend-only with no UI to view or manage it. | `src/components/ConnectionsTab.tsx` |

---

## Summary Counts

| Severity | Backend | Frontend | Infrastructure | Parity | Docs | Total |
|----------|---------|----------|----------------|--------|------|-------|
| BLOCKING | 5 | 3 | — | — | — | **8** |
| HIGH | 7 | 12 | 3 | 2 | — | **24** |
| MEDIUM | 5 | 16 | 3 | 4 | 2 | **30** |
| LOW | — | 6 | 1 | 1 | 3 | **11** |
| **Total** | **17** | **37** | **7** | **7** | **5** | **73** |

---

## Recommended Implementation Order

Based on severity and dependencies:

1. **B-001, B-002** — Real permissions + accessibility (nothing works without these on real devices)
2. **B-003** — Real MCP integration (core value proposition)
3. **B-004, B-005** — Voice pipeline completeness (T011 VAD pause, T007 hotplug)
4. **F-003** — Migrate hooks to react-query (unlocks deduplication, background refetch)
5. **B-006** — Wire voice-agent handoff
6. **B-008** — CUA scroll method
7. **F-001** — Set up Playwright E2E tests
8. **I-001, I-002, I-003** — Distribution signing (required before public release)
9. **B-009** — Expand skills catalog (high user-visible value)
10. **P-006** — Wire real waveform amplitude data
