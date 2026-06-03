# Feature Specification: Core Foundation

## Overview

ClickyX is a cross-platform AI companion. This feature establishes the
minimal application shell — the system tray presence, a floating panel UI,
global hotkey registration, a local HTTP bridge for external control,
configuration file loading, and a basic overlay window. All later features
(voice, AI providers, agent mode, screen context) depend on this
foundation.

**Driven by**: Phase 1 of `docs/FEATURE_SPEC.md` (Core Foundation).

---

## User Scenarios

### US1: User launches app and sees system tray icon

A user installs and launches ClickyX. The application appears as an icon
in the system tray. The user can left-click to show/hide the floating
panel and right-click to access a context menu with Quick Ask, Settings,
Task History, and Quit.

**Acceptance criteria**:
- Application process starts without visible main window (only tray icon).
- Tray icon uses a custom rendering that matches the platform conventions.
- Left-click toggles panel visibility.
- Right-click shows a menu with at least: Quick Ask, Settings, Quit.

### US2: User configures global hotkey

A user wants to invoke ClickyX without reaching for the mouse. They set a
global keyboard shortcut (default: Ctrl+Option) in the settings. Pressing
the hotkey from any application brings the floating panel to focus.

**Acceptance criteria**:
- Default hotkey activates from any application.
- Hotkey is configurable through settings.
- Multiple shortcut options can be defined and toggled.

### US3: External tool controls ClickyX via local HTTP API

A script or automation tool sends an HTTP request to `localhost:32123`
and receives a response. The bridge supports health-check and basic
panel-show commands.

**Acceptance criteria**:
- HTTP server starts on port 32123 on launch.
- `GET /health` returns 200 with status body.
- `POST /panel/toggle` toggles panel visibility.
- Requests from localhost only (no remote access).

### US4: User changes settings via config file

A user edits a configuration file (or modifies settings via the panel) and
the changes persist across restarts. Configuration covers API keys,
hotkey bindings, theme preference, and window behavior.

**Acceptance criteria**:
- Settings are persisted to disk on change.
- Settings are loaded on startup.
- Invalid config values are handled gracefully (fallback to defaults).
- Changes take effect without requiring a full restart where feasible.

### US5: Overlay window renders visual guidance

The application can display a lightweight overlay window (always-on-top,
click-through capable) that can later be used for cursor effects and
visual guidance markers.

**Acceptance criteria**:
- Overlay window can be shown/hidden programmatically.
- Overlay is always-on-top and can be made click-through.
- Overlay supports per-monitor DPI awareness.
- Overlay does not interfere with normal desktop interaction when
  click-through is enabled.

---

## Functional Requirements

### FR1: System Tray

- FR1.1 The application MUST display a platform-native system tray icon
  on launch.
- FR1.2 Left-clicking the icon MUST toggle the floating panel visibility.
- FR1.3 Right-clicking the icon MUST display a context menu.
- FR1.4 The context menu MUST include entries for: Quick Ask (opens
  input), Settings (opens panel to Settings tab), and Quit (exits app).
- FR1.5 The tray icon MUST use a custom rendering (not a generic default).
- FR1.6 The tray MUST support dynamic status indicators (at minimum:
  idle, processing).

### FR2: Floating Panel

- FR2.1 The panel MUST be a borderless, rounded-corner window.
- FR2.2 The panel MUST have a minimum width of 356px and minimum height
  of 300px, with a maximum height of 720px.
- FR2.3 The panel MUST support a pin/unpin toggle that controls auto-dismiss
  behavior.
- FR2.4 When unpinned, clicking outside the panel MUST dismiss it.
- FR2.5 The panel MUST display a tab bar with at least two tabs: Home
  and Settings. Agent and Connections tabs MAY be present as placeholders.
- FR2.6 The Home tab MUST include: a hero/prompt area and a suggestions
  grid area.
- FR2.7 The Settings tab MUST include sections for: API key configuration,
  hotkey binding, theme selection (system/light/dark), and general
  preferences.

### FR3: Global Hotkey

- FR3.1 The application MUST register a default global hotkey (Ctrl+Option)
  on launch.
- FR3.2 Pressing the hotkey from any application MUST bring the floating
  panel to the foreground.
- FR3.3 Users MUST be able to modify, disable, or add alternative hotkey
  combinations through Settings.
- FR3.4 Hotkey changes MUST take effect immediately without restart.

### FR4: Local HTTP Bridge

- FR4.1 The application MUST start an HTTP server on `localhost:32123`
  on launch.
- FR4.2 The server MUST reject connections from non-localhost addresses.
- FR4.3 The server MUST support the following endpoints:
  - `GET /health` — returns 200 with `{"status":"ok"}`
  - `POST /panel/toggle` — toggles panel visibility, returns panel state
- FR4.4 The bridge MUST log incoming requests for debugging.

### FR5: Configuration

- FR5.1 The application MUST load configuration from a file on startup.
- FR5.2 Configuration MUST be persisted when changed via Settings or API.
- FR5.3 Invalid or missing config values MUST fall back to sensible
  defaults rather than crashing.
- FR5.4 Config changes that do not require restart MUST take effect
  immediately.

### FR6: Overlay Window

- FR6.1 The application MUST support at least one overlay window that is
  always-on-top.
- FR6.2 The overlay window MUST support a click-through mode.
- FR6.3 The overlay MUST be per-monitor DPI-aware.
- FR6.4 The overlay window MUST be showable and hideable programmatically.

---

## Success Criteria

1. **Tray reliability**: The tray icon appears within 5 seconds of launch
   on all supported platforms. The context menu renders correctly on first
   right-click.

2. **Panel responsiveness**: The floating panel appears within 200ms of
   toggle activation (left-click or hotkey). Panel interaction (tab switch,
   button click) responds within 100ms.

3. **Hotkey global reach**: The default hotkey activates the panel from
   any full-screen application on all three platforms.

4. **Bridge availability**: The HTTP server responds to `GET /health`
   within 50ms of application launch, and to all documented endpoints
   within 200ms.

5. **Config persistence**: A setting changed via the panel, followed by
   an application restart, retains the changed value. Invalid config
   values never cause a crash on startup.

6. **Overlay viability**: The overlay window renders on each connected
   monitor without visual artifacts. Click-through mode passes all mouse
   events through to underlying windows.

---

## Key Entities

- **ApplicationState** — lifecycle state (starting, running, quitting)
  and mode (idle, processing, listening)
- **Configuration** — persisted settings (API keys, hotkeys, theme,
  window preferences)
- **PanelState** — visibility (visible/hidden), pin status, active tab
- **TrayMenu** — menu items and their actions
- **HotkeyBinding** — key combination, enabled flag, action target
- **BridgeEndpoint** — route, method, handler, allowed hosts

---

## Assumptions

- The application is distributed as a native binary per platform (no web
  app deployment).
- Users have standard display setups (96–192 DPI). Ultra-high DPI
  (>300) is not a Phase 1 requirement.
- The config file format is JSON (industry standard for local
  configuration).
- The tray icon asset is provided as a multi-resolution PNG or platform-
  specific icon format.
- At least one monitor is always connected.
- SSE support is deferred to the Agent Mode phase (Phase 4). The Phase 1
  bridge implements REST endpoints only. This keeps Phase 1 focused on
  core infrastructure without premature streaming complexity.
- The floating panel uses a web-based UI (local HTML/CSS/JS rendered in a
  WebView). This is consistent with the Tauri architecture, enables
  consistent cross-platform theming, and aligns with the project's
  React/Svelte frontend convention.
