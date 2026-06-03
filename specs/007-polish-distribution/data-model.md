# Data Model: Phase 7

## Permission

```rust
pub enum Permission {
    Microphone,
    ScreenRecording,
    Notifications,
    Camera,
    Accessibility,
}

pub struct PermissionStatus {
    pub permission: Permission,
    pub granted: bool,
    pub description: String,
}
```

## UpdateInfo

```rust
pub struct UpdateInfo {
    pub available: bool,
    pub version: Option<String>,
    pub release_notes: Option<String>,
    pub download_url: Option<String>,
}
```

## LogEntry

```rust
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
    pub target: String,
}
```

## Settings Sections

### General
- cursor_enabled: bool
- tutor_mode: bool
- theme: "system" | "light" | "dark"
- glass_tint: String (hex color)
- glass_frosting: f64
- font: String
- avatar_style: String
- cursor_size: u32

### Voice
- response_voice_model: String
- realtime_voice: bool
- deepgram_config: { api_key, model, language }
- activation_mode: String
- transcription_provider: String
- response_captions: bool
- tts_provider: String
- volume: f32

### AI Providers
- anthropic_api_key: Option<String>
- openai_api_key: Option<String>
- elevenlabs_api_key: Option<String>
- cartesia_api_key: Option<String>
- deepgram_api_key: Option<String>
- assemblyai_api_key: Option<String>
- codex_model: String
- agent_dock_position: String

### Computer Use
- screen_pointing_model: String
- cua_backend: String
- native_cua_enabled: bool

### Permissions
- permission_statuses: Vec<PermissionStatus>

### Automations
- automations: Vec<Automation>

### System & Logs
- google_workspace_status: String
- mcp_servers: Vec<McpServer>
- memory_usage: MemoryInfo
- logs: Vec<LogEntry>
