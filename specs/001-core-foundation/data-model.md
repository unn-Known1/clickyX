# Data Model: Core Foundation

## Entity: AppConfig

Persisted application configuration stored as JSON on disk.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `hotkeys` | `HotkeyBinding[]` | `[{key: "Ctrl+Option", enabled: true, action: "toggle_panel"}]` | Registered global shortcuts |
| `theme` | `"system" \| "light" \| "dark"` | `"system"` | UI theme preference |
| `api_keys` | `ApiKey[]` | `[]` | Provider API keys (encrypted at rest in Phase 2+) |
| `window` | `WindowPrefs` | `{pin: false, width: 356, height: 500}` | Panel window preferences |
| `version` | `string` | `"1.0"` | Config schema version for migration |

### Sub-types

```rust
struct HotkeyBinding {
    key: String,         // e.g., "Ctrl+Option"
    enabled: bool,
    action: HotkeyAction, // enum: TogglePanel, QuickAsk, etc.
}

struct ApiKey {
    provider: String,    // "anthropic", "openai", "deepgram"
    key: String,         // the key value
}

struct WindowPrefs {
    pin: bool,
    width: u32,
    height: u32,
}
```

### Validation Rules

- `hotkeys`: At least one enabled hotkey for `toggle_panel` action
- `theme`: Must be one of `"system"`, `"light"`, `"dark"`
- `window.width`: Min 356, no max (practical: 356–1920)
- `window.height`: Min 300, max 720
- Unknown fields: silently ignored (forward compatibility)

### State Transitions

```
[File Missing] → load defaults → [AppConfig loaded]
[User changes in panel] → write config file → [AppConfig updated]
[Bridge POST /config] → write config file → [AppConfig updated]
[Invalid file content] → log warning, use defaults → [AppConfig loaded]
```

---

## Entity: AppState

Runtime-only state (not persisted).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `panel_visible` | `bool` | `false` | Is the floating panel shown? |
| `panel_pinned` | `bool` | `false` | Is the panel pinned (no auto-dismiss)? |
| `active_tab` | `"home" \| "agents" \| "connections" \| "settings"` | `"home"` | Currently active tab |
| `app_mode` | `"idle" \| "processing" \| "listening"` | `"idle"` | Application state for tray indicator |
| `tray_status` | `"idle" \| "busy"` | `"idle"` | Tray icon indicator state |

### State Transition Rules

- `panel_visible`: Toggled by tray click, hotkey, or bridge `/panel/toggle`.
  Auto-dismissed on outside click when `panel_pinned == false`.
- `active_tab`: Changed by user clicking tab bar in panel.
- `app_mode`: Set by feature owners (voice pipeline, AI agents).
  Propagates to `tray_status` for icon rendering.

---

## Entity: BridgeRoute

Defines an HTTP endpoint on the local bridge.

| Field | Type | Description |
|-------|------|-------------|
| `method` | `"GET" \| "POST" \| "PUT" \| "DELETE"` | HTTP method |
| `path` | `string` | Route path (e.g., `/health`, `/panel/toggle`) |
| `handler` | `fn(HttpRequest) -> HttpResponse` | Handler function |

### Phase 1 Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{"status":"ok"}` with 200 |
| `POST` | `/panel/toggle` | Toggles panel, returns `{"panel_visible": true\|false}` |

Future routes (Phase 3+): `/v1/chat`, `/v1/agents`, `/events` (SSE).
