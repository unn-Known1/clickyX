# Implementation Plan: Core Foundation

## Technical Context

### Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| App shell | Tauri (Rust backend + WebView frontend) | Project convention; cross-platform by design |
| System tray | `tray-icon` (Rust crate) | Cross-platform tray; Windows/Linux/macOS support |
| Global hotkey | `global-hotkey` (Rust crate) | Cross-platform hotkey registration |
| HTTP bridge | `actix-web` (Rust) | Lightweight, async, battle-tested |
| Config | `serde` + JSON file (Rust) | Matches spec assumption; serde is standard Rust |
| Frontend UI | React (TypeScript) | Project convention; Tauri WebView |
| Overlay window | Tauri secondary window + platform flags | Transparent, always-on-top, click-through |

### Platform-Specific Concerns

- **Windows**: `tray-icon` uses Windows Tray Icon API internally;
  `global-hotkey` uses `RegisterHotKey`; overlay uses `WS_EX_LAYERED`
  + `WS_EX_TRANSPARENT` + `WS_EX_TOPMOST`
- **Linux**: `tray-icon` uses libappindicator or StatusNotifierItem;
  `global-hotkey` uses X11 `XGrabKey` / Wayland protocol; overlay uses
  layer-shell (Wayland) or override-redirect (X11)
- **macOS**: `tray-icon` uses NSStatusItem link (no AppKit code, just
  the crate's abstraction); `global-hotkey` uses CGEvent tap via crate;
  overlay uses NSPanel-level floating window

### Key Architecture Decisions

1. **Tauri v2** as the application framework — provides window management,
   system tray, global shortcuts, and WebView in one package
2. **React with TypeScript** for the panel UI — component reuse across
   tabs, strong typing, ecosystem maturity
3. **actix-web** for the bridge — runs in a separate async task alongside
   the Tauri event loop; lightweight and fast
4. **Single JSON config file** at platform-standard app data directory
   (`~/.config/clickyx/config.json` on Linux,
   `%APPDATA%/ClickyX/config.json` on Windows,
   `~/Library/Application Support/ClickyX/config.json` on macOS)
5. **Overlay as a second Tauri window** — transparent, frameless,
   always-on-top, with a JS/Canvas surface for future visual guidance

### Integration Points

- Bridge ↔ Tauri app: Rust `actix-web` task communicates with Tauri
  AppHandle via `tauri::Manager` and event system
- Panel ↔ Config: React frontend calls Tauri commands (Rust functions
  exposed via `#[tauri::command]`) to read/write config
- Hotkey ↔ Panel: `global-hotkey` events trigger Tauri window focus/show

### Unknowns (NEEDS CLARIFICATION)

- None. All technical decisions have reasonable defaults based on
  project conventions and industry standards. The spec's two
  clarifications (SSE deferral, web-based UI) were resolved in the spec.

---

## Constitution Check

### Principle 1: Cross-Platform First ✅

The plan uses only cross-platform Rust crates (`tray-icon`,
`global-hotkey`, `actix-web`, `serde`). Platform-specific concerns are
documented but handled by the crate abstractions, not by platform-
specific application code. The overlay window uses Tauri's built-in
multi-window support.

### Principle 2: Feature Parity ✅

Phase 1 targets the Core Foundation items listed in `docs/FEATURE_SPEC.md`
§17 Phase 1: system tray, floating panel, global hotkey, HTTP bridge,
config, overlay. Each item has a documented migration path from
OpenClicky's macOS implementation. Deviations (e.g., web-based panel vs.
native SwiftUI) are documented in Assumptions.

### Principle 3: No macOS Lock-In ✅

Zero Apple-only frameworks used. `tray-icon` and `global-hotkey` are
cross-platform Rust crates. Tauri's WebView layer is platform-agnostic.
No Foundation, SwiftUI, AppKit, or ScreenCaptureKit references.

### Principle 4: Local-First Architecture ✅

Config is stored locally in JSON. No cloud services, no telemetry,
no hosted OAuth. API keys (configured in Phase 1 Settings tab) are
stored in the local config file only.

### Principle 5: External Bridge Compatibility ✅

Bridge serves on `localhost:32123` with `GET /health` and
`POST /panel/toggle` — a REST-only subset of the OpenClicky bridge
spec. SSE is explicitly deferred to Phase 4, keeping the Phase 1
contract compatible and additive.

### Principle 6: Spec-Driven Development ✅

This plan exists because the Core Foundation spec
(`specs/001-core-foundation/spec.md`) was created and passed quality
validation before planning began. The spec was derived from
`docs/FEATURE_SPEC.md` Phase 1 items.

---

## Gates

All gates MUST pass before implementation begins.

| Gate | Condition | Status |
|------|-----------|--------|
| G1 | Spec has no unresolved [NEEDS CLARIFICATION] markers | ✅ PASS |
| G2 | Spec quality checklist all items passing | ✅ PASS |
| G3 | Constitution check shows no violations | ✅ PASS |
| G4 | Technical Context has no unresolvable unknowns | ✅ PASS |
| G5 | Design artifacts (data-model, contracts, quickstart) complete | ⏳ PENDING |

If any gate fails, the issue MUST be resolved in the spec or plan before
proceeding. Constitution violations (G3) are non-negotiable and require
a constitution amendment, not plan modification.

---

## Phase 0: Research

No significant unknowns remain. The crate choices (`tray-icon`,
`global-hotkey`, `actix-web`) are well-documented and standard for
Tauri/Rust projects. The following lightweight validation tasks are
recommended:

1. Verify `tray-icon` supports all three target platforms with the
   required icon customization (dynamic status indicators).
2. Verify `global-hotkey` works on Wayland (compositor-dependent)
   and document fallback behavior.
3. Decide on the Tauri v2 project scaffold structure (default
   `src-tauri/` layout vs. custom).

These are documented in `research.md`.

---

## Phase 1: Design

### Data Model

Defined in `data-model.md`. Key entities:
- `AppConfig` — serialized config (hotkeys, theme, API keys, window prefs)
- `AppState` — runtime state (panel visibility, pin status, active tab,
  tray status)
- `BridgeRoute` — HTTP route definition (method, path, handler)

### Contracts

Defined in `contracts/`. Two contracts:
1. **Internal**: Tauri command API (Rust `#[tauri::command]` functions
   callable from the React frontend)
2. **External**: HTTP bridge API (`localhost:32123` — health, panel
   toggle, and future endpoints)

### Quickstart

Defined in `quickstart.md`. Documents how to:
- Scaffold the Tauri v2 project
- Add Rust crate dependencies
- Wire up the tray, bridge, config, overlay
- Boot the frontend dev server
- Build and run on each platform
