# Tauri Commands: Advanced Features

## Wake Word

### `set_wake_word_config(config: WakeWordConfig)`
- **Description**: Update wake word settings
- **Side effects**: Persists to config.json

### `get_wake_word_config`
- **Returns**: `WakeWordConfig`

### `start_wake_word_detection`
- **Description**: Start listening for wake word
- **Returns**: `bool` (success)

### `stop_wake_word_detection`
- **Description**: Stop listening for wake word
- **Returns**: `bool` (success)

## Google Workspace

### `check_google_workspace`
- **Returns**: `{ available: bool, authenticated: bool }`

### `list_emails(count: u32)`
- **Returns**: `Vec<Email>`

### `list_calendar_events(count: u32)`
- **Returns**: `Vec<CalendarEvent>`

## Automations

### `list_automations`
- **Returns**: `Vec<Automation>`

### `create_automation(automation: Automation)`
- **Returns**: `Automation`

### `update_automation(automation: Automation)`
- **Returns**: `Automation`

### `delete_automation(id: String)`
- **Returns**: `bool`

### `toggle_automation(id: String, enabled: bool)`
- **Returns**: `Automation`

## MCP

### `get_mcp_servers`
- **Returns**: `Vec<McpServerConfig>`

### `add_mcp_server(config: McpServerConfig)`
- **Returns**: `Vec<McpServerConfig>`

### `update_mcp_server(name: String, config: McpServerConfig)`
- **Returns**: `Vec<McpServerConfig>`

### `remove_mcp_server(name: String)`
- **Returns**: `Vec<McpServerConfig>`

## 3D Generation

### `generate_3d_model(prompt: String, style: String)`
- **Returns**: `String` (file path to generated GLB)
