# Research: Agent Mode / Codex Runtime

## Codex Overview

Codex is a Node.js-based agent runtime that accepts tasks via JSON-RPC over stdio.
It executes skills (plugins) and returns structured results.

Key characteristics:
- Communicates via stdin/stdout JSON-RPC (line-delimited JSON)
- Configured via TOML config file (~/.config/clickyx/codex/config.toml)
- Skills are loaded from configured directories
- Supports MCP (Model Context Protocol) servers
- Uses a flat namespace for skill entry points

## JSON-RPC Protocol

Request:
```json
{"jsonrpc": "2.0", "id": 1, "method": "execute", "params": {"skill": "...", "args": {}}}
```

Response:
```json
{"jsonrpc": "2.0", "id": 1, "result": {"status": "ok", "output": "..."}}
```

Error:
```json
{"jsonrpc": "2.0", "id": 1, "error": {"code": -1, "message": "..."}}
```

## Platform Considerations

- Codex home: $XDG_DATA_HOME/clickyx/codex (Linux), ~/Library/Application Support/clickyx/codex (macOS), %APPDATA%/clickyx/codex (Windows)
- Binary: codex (PATH lookup or configured path)
- Stdio management: Cross-platform with std::process::{Command, Child}

## Permission Model

4 classes:
- safe: Read-only operations, no side effects
- shell: Can execute shell commands
- filesystem: Can read/write files
- full: System access (install software, modify system)

## Skills Directory Layout

```
skills/
  _shared/
    OpenClickySkillCompatibilityPolicy.md
  screen-control/
    screen-point.toml
    screen-caption.toml
    screenshot.toml
  codex/
    manage-codex.toml
```

## Existing Patterns

From OpenClicky (macOS native):
- Skills are JSON files with name, description, entry_point, permission_class
- Agent sessions have a flat file store in ~/.config/clickyx/agents/
- Codex config is generated TOML from app settings

## Key Design Decisions

1. Session persistence: JSON in config dir (simple, human-readable)
2. Codex process: Single shared process (not per-session)
3. Skills: TOML format over JSON for readability
4. Status notifications: Tauri events (emit on state change)
