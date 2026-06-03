# Tasks: Core Foundation

## Phase 1: Setup

### Goal

Scaffold the Tauri v2 project with React + TypeScript, install all Rust
and Node dependencies, and establish the project directory structure.

### Independent Test Criteria

- `cargo check` passes in `src-tauri/`
- `npm run build` passes in `src/`
- `cargo tauri build --debug` produces a runnable binary

### Implementation Tasks

- [x] T001 Scaffold Tauri v2 project with React TypeScript template via `npm create tauri-app`
- [x] T002 Add Rust crate dependencies to `src-tauri/Cargo.toml` (actix-web, serde, serde_json, tokio, dirs)
- [x] T003 [P] Create Rust source files in `src-tauri/src/` (main.rs, tray.rs, bridge.rs, config.rs, overlay.rs, commands.rs)
- [x] T004 [P] Create React component files in `src/` (App.tsx, HomeTab.tsx, SettingsTab.tsx, useConfig.ts, theme.css)
- [x] T005 Verify `cargo check` and `npm run build` both pass

---

## Phase 2: Foundational

### Goal

Implement the core data model (AppConfig, AppState), config file
load/save logic, and Tauri command interface that all user stories
depend on.

### Independent Test Criteria

- Config loads from disk on startup with fallback to defaults
- Config writes to disk when updated
- Tauri commands respond to frontend `invoke()` calls

### Implementation Tasks

- [x] T006 Implement `AppConfig` struct with serde derive in `src-tauri/src/config.rs`
- [x] T007 Implement `AppState` runtime state struct with panel_visible, panel_pinned, active_tab, app_mode in `src-tauri/src/lib.rs`
- [x] T008 Implement config load function with default fallback in `src-tauri/src/config.rs`
- [x] T009 Implement config save function in `src-tauri/src/config.rs`
- [x] T010 Implement platform-specific config directory resolution using `dirs` crate in `src-tauri/src/config.rs`
- [x] T011 Implement Tauri commands (get_config, update_config, toggle_panel, get_panel_state, get_app_state) in `src-tauri/src/commands.rs`
- [x] T012 Register all Tauri commands in `src-tauri/src/lib.rs` with `.invoke_handler()`
- [x] T013 Set up multi-window Tauri config in `src-tauri/tauri.conf.json` (main panel window + overlay)
- [x] T014 [P] Create React `useConfig` hook wrapping `invoke('get_config')` and `invoke('update_config')` in `src/hooks/useConfig.ts`

---

## Phase 3: System Tray (US1)

### Goal

The application displays a platform-native system tray icon on launch
with left-click toggling the floating panel and right-click showing a
context menu (Quick Ask, Settings, Quit). Tray icon supports dynamic
status indicators (idle/processing).

### Independent Test Criteria

- Tray icon appears within 5s of app launch
- Left-click shows/hides the floating panel
- Right-click displays a menu with at least 3 entries
- Clicking "Quit" exits the application
- Tray icon changes appearance when app_mode changes

### Implementation Tasks

- [x] T015 [US1] Set up tray icon builder with custom icon asset in `src-tauri/src/tray.rs`
- [x] T016 [US1] Implement left-click handler that toggles panel visibility in `src-tauri/src/tray.rs`
- [x] T017 [US1] Implement right-click context menu (Quick Ask, Settings, Quit) in `src-tauri/src/tray.rs`
- [x] T018 [US1] Wire tray setup into `src-tauri/src/lib.rs` `.setup()` callback
- [x] T019 [US1] Implement dynamic tray icon switching based on `app_mode` in `src-tauri/src/tray.rs`
- [x] T020 [P] [US1] Add tray icon assets (multi-resolution PNG for Windows/Linux, template for macOS) in `src-tauri/icons/`

---

## Phase 4: Configuration & Settings Tab (US4)

### Goal

Users can view and modify configuration via the Settings tab in the
floating panel. Settings persist across restarts. Covers: API keys,
hotkey bindings, theme selection, window preferences. Invalid values
fall back to defaults without crashing.

### Independent Test Criteria

- Settings tab shows API keys, hotkey, theme, and window sections
- Changing a setting and restarting preserves the value
- Entering an invalid value shows a validation message (not a crash)
- Theme changes (system/light/dark) apply immediately

### Implementation Tasks

- [x] T021 [P] [US4] Implement SettingsTab React component with sections (API keys, hotkeys, theme, window) in `src/components/SettingsTab.tsx`
- [x] T022 [US4] Wire Settings tab into App.tsx tab bar and routing logic in `src/App.tsx`
- [x] T023 [US4] Implement theme application (CSS variable swap) on theme change in `src/styles/theme.css`
- [x] T024 [US4] Implement config validation in Rust before save in `src-tauri/src/config.rs`
- [x] T025 [US4] Implement HomeTab React component (hero prompt + suggestions grid) in `src/components/HomeTab.tsx`

---

## Phase 5: Global Hotkey (US2)

### Goal

A global keyboard shortcut (default Ctrl+Option) activates the floating
panel from any application. Users can modify, disable, or add alternative
shortcuts through Settings. Hotkey changes take effect immediately.

### Independent Test Criteria

- Default Ctrl+Option activates panel from any full-screen app
- Configuring a new hotkey in Settings takes effect immediately
- Disabling all hotkeys suppresses the shortcut
- Hotkey persists across restart

### Implementation Tasks

- [x] T026 [US2] Register default global hotkey (Ctrl+Option) via `tauri-plugin-global-shortcut` in `src-tauri/src/lib.rs`
- [x] T027 [US2] Wire hotkey activation event to panel show/focus in `src-tauri/src/lib.rs`
- [x] T028 [US2] Implement hotkey list update on config change (re-register from config bindings) in `src-tauri/src/lib.rs`
- [x] T029 [P] [US2] Add hotkey configuration UI to SettingsTab component in `src/components/SettingsTab.tsx`
- [x] T030 [US2] Implement hotkey validation (no duplicate bindings) in Rust config logic in `src-tauri/src/config.rs`

---

## Phase 6: HTTP Bridge (US3)

### Goal

An HTTP server on `localhost:32123` serves `GET /health` and
`POST /panel/toggle`. Only localhost connections accepted. Incoming
requests are logged.

### Independent Test Criteria

- `curl http://localhost:32123/health` returns `{"status":"ok"}`
- `curl -X POST http://localhost:32123/panel/toggle` toggles the panel
- `curl http://localhost:32123/nonexistent` returns 404
- External IP connections are rejected
- Bridge starts within 50ms of app launch

### Implementation Tasks

- [x] T031 [US3] Implement actix-web HTTP server with config (bind to 127.0.0.1:32123, localhost only filter) in `src-tauri/src/bridge.rs`
- [x] T032 [US3] Implement GET /health endpoint returning app status JSON in `src-tauri/src/bridge.rs`
- [x] T033 [US3] Implement POST /panel/toggle endpoint with Tauri AppHandle integration in `src-tauri/src/bridge.rs`
- [x] T034 [US3] Implement request logging middleware in `src-tauri/src/bridge.rs`
- [x] T035 [US3] Spawn bridge server in a separate thread during app setup in `src-tauri/src/lib.rs`
- [x] T036 [US3] Wire bridge shutdown on app exit in `src-tauri/src/lib.rs`

---

## Phase 7: Overlay Window (US5)

### Goal

A transparent, always-on-top, click-through overlay window can be shown
and hidden programmatically. It will serve as the surface for cursor
effects and visual guidance in later phases. Supports per-monitor DPI.

### Independent Test Criteria

- Overlay window appears on top of all other windows when shown
- Click-through mode passes all mouse events to underlying windows
- Overlay window renders on the correct monitor at correct DPI
- Overlay can be shown/hidden without affecting panel behavior

### Implementation Tasks

- [x] T037 [US5] Create secondary Tauri window with transparent, always-on-top, skip-taskbar flags in `src-tauri/tauri.conf.json`
- [x] T038 [US5] Implement overlay show/hide commands in `src-tauri/src/commands.rs`
- [x] T039 [US5] Implement platform-specific click-through flags (WS_EX_TRANSPARENT, ignoresMouseEvents, etc.) in `src-tauri/src/overlay.rs`
- [x] T040 [US5] Implement per-monitor DPI awareness for overlay window in `src-tauri/src/overlay.rs`

---

## Phase 8: Polish & Cross-Cutting

### Goal

Resolve remaining edge cases: error handling, smooth transitions,
accessibility basics, and cross-platform testing.

### Independent Test Criteria

- App runs without errors on all three platforms
- All success criteria from the spec are met
- No crashes on rapid toggle or edge-case input

### Implementation Tasks

- [x] T041 Log all errors consistently using `tracing` or `log` crate in `src-tauri/src/main.rs`
- [x] T042 Implement graceful shutdown (cleanup tray, stop bridge, save config) on quit in `src-tauri/src/main.rs`
- [x] T043 Add panel show/hide animation (fade/slide CSS transition) in `src/App.tsx`
- [x] T044 Test on all three platforms — verify tray, hotkey, bridge, overlay

---

## Dependencies

```
Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1: Tray)
                                            → Phase 4 (US4: Config)
                                                  ↓
                                             Phase 5 (US2: Hotkey)
                                             Phase 6 (US3: Bridge)
                                             Phase 7 (US5: Overlay)
                                                  ↓
                                             Phase 8 (Polish)
```

- **Phase 1** → **Phase 2**: Scaffolding must exist before code is written
- **Phase 2** → **Phase 3/4**: AppState and commands must exist before tray
  and config UI can use them
- **Phase 3** → **Phase 5/6**: Panel state management needed for hotkey and bridge
- **Phase 4** → **Phase 5**: Hotkey bindings read from config
- **Phase 3/5/6/7** → **Phase 8**: All features must be implemented before polish

## Parallel Execution

- **Phase 3 (US1 Tray)** and **Phase 4 (US4 Config)** can run in parallel:
  Tray focuses on `tray.rs`, Config focuses on `SettingsTab.tsx` + `config.rs`.
  Both depend on Phase 2's AppState/commands but not on each other.
- Within each phase: tasks marked `[P]` can run in parallel within that phase
  (they modify different files and have no cross-dependencies).

## MVP Scope

The minimal viable scope is **Phase 1 + Phase 2 + Phase 3 (US1)**:
- App launches, tray icon appears, context menu works, panel toggles.
- Config loads but Settings tab can be minimal.
- This delivers the core user-facing interaction: "app runs in background,
  click tray to interact."

## Format Validation

| Requirement | Status |
|-------------|--------|
| All tasks start with `- [ ]` | ✅ |
| All tasks have sequential T### IDs | ✅ |
| `[P]` markers only on parallelizable tasks | ✅ |
| User story phases have `[US#]` labels | ✅ |
| Setup/Foundational/Polish phases have no story labels | ✅ |
| Each task references exact file paths | ✅ |
