# Internal Tauri Command Contract

## Overview

Rust functions exposed to the React frontend via `#[tauri::command]`.
Called from the panel UI using `@tauri-apps/api` `invoke()`.

## Commands

### get_config

**Description**: Returns the current application configuration.

**Signature**: `fn get_config(app: AppHandle) -> Result<AppConfig, String>`

**Example**:
```typescript
import { invoke } from '@tauri-apps/api/core';
const config = await invoke('get_config');
```

### update_config

**Description**: Saves a partial config update. Merges with existing.

**Signature**:
`fn update_config(app: AppHandle, partial: JsonValue) -> Result<AppConfig, String>`

**Example**:
```typescript
await invoke('update_config', { partial: { theme: 'dark' } });
```

### toggle_panel

**Description**: Toggles the floating panel. Returns new state.

**Signature**: `fn toggle_panel(window: Window) -> Result<PanelState, String>`

### get_panel_state

**Description**: Returns current panel visibility and pin state.

**Signature**: `fn get_panel_state() -> Result<PanelState, String>`

### get_app_state

**Description**: Returns runtime app state (mode, active tab, etc.).

**Signature**: `fn get_app_state() -> Result<AppState, String>`

## Error Handling

All commands return `Result<T, String>` where `String` is a
human-readable error message shown in the panel UI.
