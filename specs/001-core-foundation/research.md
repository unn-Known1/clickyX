# Research: Core Foundation

## Decision 1: System Tray Crate

- **Decision**: `tray-icon` (Rust crate, v0.6+)
- **Rationale**: Supports Windows (Tray Icon API), Linux (libappindicator /
  StatusNotifierItem), macOS (NSStatusItem via objc2 bindings). Provides
  `TrayIconBuilder` with custom icon, tooltip, menu, and `on_click`
  / `on_menu_event` callbacks. Compatible with Tauri v2's event loop.
- **Alternatives considered**:
  - `tauri::tray` (built-in Tauri v2 tray API): Equivalent capability,
    more tightly coupled to Tauri lifecycle. Would be the default choice.
  - Manual per-platform implementation: Unnecessary complexity given
    crate maturity.

**Status**: `tray-icon` (or `tauri::tray` if already bundled) — both
provide the required cross-platform tray with custom icon and menu.

---

## Decision 2: Global Hotkey Crate

- **Decision**: `global-hotkey` (Rust crate)
- **Rationale**: Cross-platform (Windows `RegisterHotKey`, macOS
  `CGEvent` tap, Linux X11/Wayland). Provides `GlobalHotkeyManager`
  with register/unregister and event stream.
- **Alternatives considered**:
  - `tauri-plugin-global-shortcut` (Tauri v2 plugin): Well-integrated
    with Tauri, preferred if available.
  - Manual `rdev` hook: Lower-level, more maintenance burden.
- **Wayland note**: Wayland compositors may restrict global hotkey
  registration. `global-hotkey` supports `zwp_input_method_v1`.
  Fallback: display a notification that hotkeys require X11 or a
  Wayland compositor with the protocol.

**Status**: Use `tauri-plugin-global-shortcut` (Tauri v2 built-in) if
available; fall back to `global-hotkey` crate.

---

## Decision 3: HTTP Framework for Bridge

- **Decision**: `actix-web` v4 (Rust)
- **Rationale**: Async, lightweight, well-maintained. Runs in a separate
  tokio task alongside Tauri's runtime. `actix-web`'s resource/route
  system maps naturally to REST endpoints.
- **Alternatives considered**:
  - `warp`: Slightly lighter but less ergonomic for multi-route apps.
  - `axum`: Good alternative; uses tower ecosystem. Would also work well.
  - `hyper` directly: Too low-level for this use case.
  - Tauri HTTP plugin: Limited flexibility, harder to customize.
- **Note**: Both `actix-web` and `axum` are valid. Choose based on team
  familiarity. `actix-web` is selected for this plan.

**Status**: `actix-web` v4. Default port `32123` bound to `127.0.0.1`
only.

---

## Decision 4: Config File Format and Location

- **Decision**: JSON via `serde` + `serde_json`
- **Rationale**: Human-readable, easy to debug, matches the spec
  assumption. `serde` is the standard Rust serialization framework.
- **Location** (per platform):
  - Linux: `$XDG_CONFIG_HOME/clickyx/config.json` (default:
    `~/.config/clickyx/config.json`)
  - macOS: `~/Library/Application Support/com.clickyx/config.json`
  - Windows: `%APPDATA%\ClickyX\config.json`
- **Alternatives considered**:
  - TOML: More human-readable for config, but less standard for
    programmatic editing.
  - YAML: Complex edge cases, security concerns with `!!` tags.
  - Ron (Rusty Object Notation): Rust-centric, poor editor support.

**Status**: JSON with serde.

---

## Decision 5: Overlay Window Approach

- **Decision**: Secondary Tauri window with custom flags
- **Rationale**: Tauri v2 supports multiple windows. A secondary window
  with `decorations: false`, `transparent: true`, `always_on_top: true`,
  and `skip_taskbar: true` provides the overlay surface. Click-through
  requires platform-specific flags:
  - Windows: `WS_EX_TRANSPARENT + WS_EX_LAYERED + WS_EX_TOPMOST`
  - Linux: X11 `_NET_WM_WINDOW_TYPE_DOCK` or Wayland layer-shell
  - macOS: `.ignoresMouseEvents` via `NSWindow`
- **Alternatives considered**:
  - Platform-native layered window (Win32, X11, etc.): More control but
    breaks the Tauri abstraction.
  - SDL2 window: Overkill for a simple overlay surface.

**Status**: Secondary Tauri window with transparent/always-on-top flags.
Click-through implemented via `tauri::WindowBuilder` and platform
extensions.

---

## Decision 6: Frontend UI Framework

- **Decision**: React with TypeScript (via Vite)
- **Rationale**: Already assumed in the project tech stack (AGENTS.md).
  Tauri v2 scaffolds with Vite + React TypeScript out of the box.
- **Alternatives considered**:
  - Svelte: Also listed in AGENTS.md, equally valid. React chosen for
    larger ecosystem and more common usage.
- **Note**: The Tauri v2 React template generates `src/` with
  `App.tsx`, `main.tsx`, etc. The panel tabs (Home, Settings) are
  React components rendered in a single WebView window.

**Status**: React + TypeScript + Vite.
