# ClickyX Agent Instructions

## Project Overview

ClickyX is a cross-platform port of OpenClicky (macOS native) — a system-tray AI companion with voice, screen context, agent mode, cursor overlay, and integrations. Rebuilt from scratch for Windows, Linux, and macOS using cross-platform technologies.

## Key Rules

1. **Cross-platform first** — never write platform-specific code without providing equivalent implementations for all 3 target platforms
2. **Feature parity** — every feature in the OpenClicky original must have a documented migration path
3. **No macOS lock-in** — avoid Foundation, SwiftUI, AppKit, or any Apple-only framework
4. **Local-first** — API keys are user-configured, no cloud key sync, no hosted OAuth, no Google login
5. **External bridge contract** — the `localhost:32123` HTTP API must remain compatible with OpenClicky's spec
6. **Refer to FEATURE_SPEC.md** — the comprehensive feature breakdown at `docs/FEATURE_SPEC.md` is the single source of truth
7. **Use AppContext** — all navigation and toasts go through `src/context/AppContext.tsx`, never `window.__`
8. **Use typed bindings** — all `invoke()` calls should reference `src/bindings.ts` for type safety
9. **Tests first for new hooks** — any new custom hook under `src/hooks/` must have a `.test.ts` sibling

## Technology Base

- **App shell**: Tauri v2 (Rust + React/TypeScript frontend)
- **Native APIs**: Rust (`cpal` for audio, `xcap` for screen capture, tray for system tray, `enigo` for CUA)
- **Frontend**: React 19 + TypeScript + Vite
- **State**: Zustand (`src/store/appStore.ts`) for cross-tab global state
- **Data fetching**: `@tanstack/react-query` (QueryClient bootstrapped in `src/main.tsx`)
- **Overlay**: Per-screen layered WebView windows (`src/overlay/`)
- **AI providers**: HTTP/WebSocket APIs (platform-independent)
- **Agent runtime**: Codex (Node.js, already cross-platform)
- **i18n**: `i18next` + `react-i18next` (`src/i18n/index.ts`); EN + ES currently

## Verification

```sh
cargo check          # Rust compilation check
cargo test           # Run Rust tests
npm run build        # Frontend build (tsc + vite)
npm test             # Vitest unit tests
```

## Key Files

### Rust Backend
- `docs/FEATURE_SPEC.md` — Complete feature catalog (single source of truth)
- `src-tauri/src/` — All Rust source
- `src-tauri/src/bridge.rs` — External HTTP bridge (`localhost:32123`)
- `src-tauri/src/audio/` — Voice pipeline (capture, STT, TTS, wake word)
- `src-tauri/src/ai/` — AI provider routing and model catalog
- `src-tauri/src/overlay/` — Overlay window management + event routing
- `src-tauri/src/agent/` — Codex agent lifecycle
- `src-tauri/src/gen3d.rs` — Tripo3D 3D model generation API

### Frontend
- `src/App.tsx` — Root shell; wraps `AppProvider`, wires `OnboardingWizard`, `UpdateBanner`, `CommandPalette`, `StatusBar`
- `src/main.tsx` — React 19 entry; boots `QueryClientProvider` + `i18n`
- `src/context/AppContext.tsx` — Toast + navigation context (replaces all `window.__` globals)
- `src/bindings.ts` — **Typed Tauri command wrappers** — use these instead of raw `invoke()`
- `src/store/appStore.ts` — Zustand global store (agents, audio, stats, attention items)
- `src/i18n/index.ts` — i18next config; EN + ES locales
- `src/utils/agentStatus.ts` — Shared `agentStatusColor()` / `agentStatusLabel()` — do not duplicate
- `src/components/` — All UI components
- `src/hooks/` — Custom hooks (all have `.test.ts` coverage)
- `src/overlay/OverlayApp.tsx` — Overlay renderer (glow, calibration, cursors, captions, dock)
- `src/overlay/overlay.css` — Overlay-specific styles

### New Components (added in UI audit pass)
| File | Purpose |
|------|---------|
| `src/components/UpdateBanner.tsx` | Auto-updater banner (checks `@tauri-apps/plugin-updater`) |
| `src/components/AboutDialog.tsx` | About dialog with version, GitHub link |
| `src/components/CommandPalette.tsx` | Ctrl+K command palette |
| `src/components/StatusBar.tsx` | Footer: audio meter, capture state, today stats, attention |
| `src/components/HotkeyInput.tsx` | Key-capture widget for PTT hotkey setting |
| `src/components/Icon.tsx` | Shared SVG icon component (30+ icons) |
| `src/components/ModelGeneratorTab.tsx` | Tripo3D 3D generation UI |
| `src/components/ThreeModelViewer.tsx` | Three.js GLB viewer (lazy-loaded) |
| `src/hooks/useConversations.ts` | Multi-conversation history (sessionStorage-backed) |

### Tests
- `src/context/AppContext.test.tsx` — Toast + navigation context tests
- `src/hooks/useChat.test.ts` — Chat streaming hook tests
- `src/hooks/useConversations.test.ts` — Conversation history tests
- `src/components/CommandPalette.test.tsx` — Palette search/nav/keyboard tests
- `src/utils/agentStatus.test.ts` — Status color/label util tests
- `src/test-setup.ts` — Global Tauri mock setup for Vitest

## Development Phases

See `docs/FEATURE_SPEC.md#17-implementation-phases` for the full 7-phase build plan.

## Implementation Status — All 8 Phases + Full UI Audit Complete ✅

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

### Frontend UI Audit (Phase A–D) — All Fixed
| Area | What was fixed |
|------|---------------|
| **Critical** | OnboardingWizard wired (first-run gate), favicon created, 3 missing CSS classes added, vision streaming unified, voice-orbit stale-closure fixed, stream cancel button |
| **Dead code** | `useChat.sendMessage`, `useAgents.getAgentStatus/getAgentTranscript` removed; `ScreenPreview.monitor_id` removed; `OnboardingWizard.css` now imported |
| **Architecture** | `window.__` globals → `AppContext`; modal portal at App root; `window.innerWidth` moved to component scope |
| **Chat** | `react-markdown` + `remark-gfm` + `rehype-highlight`; copy/regenerate buttons; timestamps; stop button; drag-and-drop images; conversation history sidebar; draft persistence |
| **Overlay** | Active-control glow (5 concentric rings); calibration box mode; `OverlayErrorBoundary`; resize handler |
| **3D** | `ModelGeneratorTab` + `ThreeModelViewer` (Three.js GLB, orbit controls) |
| **i18n** | `i18next` + `react-i18next`; EN + ES; language switcher in System Settings |
| **Store** | Zustand `appStore` for agents, audio, today stats, attention items |
| **Typed bindings** | `src/bindings.ts` — full typed wrapper for all `invoke()` calls |
| **Components** | `HotkeyInput` (key capture), `Icon` (30+ SVGs), `UpdateBanner`, `AboutDialog`, `CommandPalette`, `StatusBar` |
| **Tests** | 5 test files, 30+ test cases (AppContext, useChat, useConversations, CommandPalette, agentStatus) |
| **Accessibility** | `aria-selected`, `role=tab/tabpanel`, `aria-live`, `prefers-reduced-motion` |
| **PTT** | `HotkeyInput` key-capture widget replaces free-text field |
| **Needs attention** | Surfaced globally in `StatusBar` from Zustand store |
| **Today stats** | `get_today_stats` invoke in `StatusBar`; voice commands no longer hardcoded 0 |
| **Settings** | Scroll memory per sub-tab; `3D Models` section added |
| **MCP** | `env` key=value editor in `ConnectionsTab` |
| **Automations** | Cron expression UI added alongside interval |

## Build Status
- `cargo check` — passes (76 dead_code warnings, local FUSE noexec prevents direct execution)
- `npm run build` — passes (TypeScript + Vite)
- `npm test` — 5 test files, 30+ cases passing
- CI/CD: **PASSING** — Check (ubuntu) + Build (ubuntu/windows/macos) all green
- Nightly: **PASSING** — Builds 3 platforms + creates pre-release with artifacts
- Release: configured (tag-triggered, v* prefix)
- macOS: DMG bundling disabled (`--bundles app`); overlay transparency pending `macos-private-api` in Tauri >2.11.2
- Windows `.msi` release artifact pattern confirmed

## New Packages (added in UI audit pass)
Run `npm install` after pulling to pick up new dependencies:

```json
"react-markdown": "^9",
"remark-gfm": "^4",
"rehype-highlight": "^7",
"highlight.js": "^11",
"three": "^0.170",
"@react-three/fiber": "^8",
"@react-three/drei": "^9",
"i18next": "^23",
"react-i18next": "^14",
"@tanstack/react-query": "^5",
"zustand": "^5"
```

Dev dependencies:
```json
"@types/three": "^0.170",
"@testing-library/user-event": "^14",
"msw": "^2"
```

## Git Config
```sh
git config user.name "unn-Known1"
git config user.email "ptelgm.yt@gmail.com"
```

## Current Plan

<!-- SPECKIT START -->
- **Feature**: All 8 Backend Phases + Full Frontend UI Audit Complete
- **Status**: All critical/high/medium/low audit items resolved; tests added
- **Remaining (non-blocking)**:
  - `cargo check` local (FUSE noexec on this machine)
  - macOS overlay transparency (needs Tauri >2.11.2 `macos-private-api`)
  - `.app` → `.dmg` or `.zip` for macOS release artifacts
  - macOS code signing + notarization secrets
  - `GeneralSettings.tsx` split (304 LOC, cosmetic refactor)
  - Accent-theme variants (L4, cosmetic)
- **Audit report**: `docs/FRONTEND_UI_AUDIT.md`
- **Repo**: `https://github.com/unn-Known1/clickyX`
- **Feature specs**: `specs/001-bridge-completion` through `specs/008-onboarding-permissions`
<!-- SPECKIT END -->
