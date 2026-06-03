# Tauri Commands — Phase 7 Additions

## Permission Commands

### `check_permission(permission: String) -> Result<PermissionStatus, String>`
Checks current OS-level permission status.

### `request_permission(permission: String) -> Result<bool, String>`
Requests a permission from the OS. Returns true if granted.

## Update Commands

### `check_for_updates() -> Result<UpdateInfo, String>`
Checks for available updates.

### `install_update() -> Result<(), String>`
Downloads and installs pending update.

## Log Commands

### `get_logs(count: Option<u32>) -> Result<Vec<LogEntry>, String>`
Returns recent log entries.

### `clear_logs() -> Result<(), String>`
Clears all log files.

## Config Commands

### `export_config() -> Result<String, String>`
Exports current config as JSON string.

### `import_config(json: String) -> Result<AppConfig, String>`
Imports config from JSON string.

### `reset_config() -> Result<AppConfig, String>`
Resets config to factory defaults.

## App Commands

### `get_app_version() -> Result<String, String>`
Returns current app version string.

### `toggle_tutor_mode() -> Result<bool, String>`
Toggles tutor mode on/off. Returns new state.

### `set_cursor_accent(color: String) -> Result<(), String>`
Sets cursor accent color.
