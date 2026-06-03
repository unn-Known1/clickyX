# Data Model: Advanced Features

## WakeWordConfig

```rust
pub struct WakeWordConfig {
    pub enabled: bool,
    pub phrase: String,
    pub sensitivity: f32,
    pub activation_mode: String, // "ptt", "toggle", "always"
}
```

## Google Workspace

```rust
pub struct Email {
    pub id: String,
    pub from: String,
    pub subject: String,
    pub snippet: String,
    pub date: String,
}

pub struct CalendarEvent {
    pub id: String,
    pub summary: String,
    pub start: String,
    pub end: String,
    pub location: Option<String>,
}

pub struct DriveFile {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub modified_time: String,
}
```

## Automation

```rust
pub struct Automation {
    pub id: String,
    pub name: String,
    pub prompt: String,
    pub schedule: Schedule,
    pub agent_slug: Option<String>,
    pub enabled: bool,
    pub last_run: Option<String>,
}

pub enum Schedule {
    Interval { seconds: u64 },
    Cron { expression: String },
}
```

## McpServerConfig

```rust
pub struct McpServerConfig {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub enabled: bool,
}
```

## SSE Event Types

```
agent_status  — { type, agent_id, status }
panel_toggle  — { visible: bool }
audio_level   — { rms, peak, clipping }
guidance_update — { action, payload }
```

## Widget Data

```typescript
interface WidgetData {
  active_agents: ActiveAgent[];
  today_stats: TodayStats;
  needs_attention: NeedsAttentionItem[];
}

interface ActiveAgent {
  id: string;
  title: string;
  status: "running" | "idle" | "error";
}

interface TodayStats {
  agents_run: number;
  voice_commands: number;
  items_for_review: number;
}

interface NeedsAttentionItem {
  type: "warning" | "error" | "info";
  message: string;
}
```

## AppConfig Additions

```rust
pub struct AppConfig {
    // ... existing fields
    pub wake_word: WakeWordConfig,
    pub mcp_servers: Vec<McpServerConfig>,
    pub automations_file: String,
}
```

