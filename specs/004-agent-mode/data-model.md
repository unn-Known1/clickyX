# Data Model: Agent Mode / Codex Runtime

## AgentConfig

```rust
pub struct AgentConfig {
    pub codex_path: Option<String>,      // Path to Codex binary (None = PATH lookup)
    pub codex_home: String,               // Codex home directory
    pub max_workers: u32,                 // Max concurrent agent workers
    pub agent_dock_position: String,      // "left", "right", "top", "bottom"
    pub enabled_skills: Vec<String>,       // Skills enabled by default
}
```

## SessionState

```rust
pub enum SessionState {
    Created,
    Running,
    Paused,
    Completed { result: String },
    Failed { error: String },
    Archived,
}
```

## AgentSession

```rust
pub struct AgentSession {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub state: SessionState,
    pub skills: Vec<String>,
    pub created_at: String,       // ISO 8601 UTC
    pub updated_at: String,       // ISO 8601 UTC
    pub transcript: Vec<ChatMessage>,
}
```

## Skill

```rust
pub struct Skill {
    pub name: String,
    pub description: String,
    pub version: String,
    pub permission_class: String,  // "safe", "shell", "filesystem", "full"
    pub entry_point: String,
}
```

## AgentDockItem

```rust
pub struct AgentDockItem {
    pub slug: String,
    pub name: String,
    pub status: String,           // "idle", "running", "done", "error"
    pub caption: Option<String>,
}
```

## AgentDockState

```rust
pub struct AgentDockState {
    pub items: Vec<AgentDockItem>,
    pub position: String,
}
```

## CodexProcess

```rust
pub struct CodexProcess {
    child: Option<Child>,
    home_dir: PathBuf,
}
```

## Codex Config TOML Template

```toml
[codex]
model = "claude-sonnet-4-20250514"
provider = "anthropic"
max_tokens = 4096
system_prompt = "You are ClickyX Agent"

[skills]
directory = "/path/to/skills"
enabled = ["screen-control", "codex"]

[mcp_servers]
# Optional MCP server configs
```

## Session Storage

Sessions are stored as individual JSON files in:
```
{codex_home}/sessions/{slug}.json
```

## File Leases

Each running session gets a file lease tracking which files it has access to.
Leases are stored at:
```
{codex_home}/leases/{session_id}.json
```
