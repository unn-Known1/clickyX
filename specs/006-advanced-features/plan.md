# Implementation Plan: Advanced Features

## Technical Context

### Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Wake word | Audio energy detection stub | On-device ML is dep-heavy; stub for now |
| Google | gogcli CLI | External binary, cross-platform |
| Automations | JSON file + tokio timer | Simple persistence, no DB needed |
| MCP config | Config.json extension | Reuses existing config system |
| SSE | actix-web streaming + tokio broadcast | Reuses existing bridge server |
| 3D gen | reqwest HTTP + Tripo3D API | REST API, polling pattern |
| Widgets | React components + JSON cache | Lightweight frontend-only |

### Key Architecture Decisions

1. **Wake word is a stub** — Real on-device detection requires Porcupine/Vosk
   which are large dependencies; implement stub with config structure
2. **gogcli CLI bridge** — Google Workspace accessed through existing CLI tool;
   no OAuth flow to implement
3. **Automation engine runs on tokio timer** — 30-second tick checks schedules
4. **SSE uses broadcast channel** — Multiple consumers can subscribe
5. **Widgets source from JSON cache** — Written by Tauri commands, read by React

## Implementation Order

1. Spec files in `specs/006-advanced-features/`
2. `config.rs` — Add WakeWordConfig, McpServerConfig, automations_file
3. `audio/wake_word.rs` — Wake word detector stub
4. `agent/google.rs` — Google Workspace integration
5. `automation/mod.rs` — Automation engine
6. `gen3d.rs` — 3D model generation
7. `bridge.rs` — SSE endpoint + expanded endpoints
8. `commands.rs` — New Tauri commands
9. Frontend: widget components + ConnectionsTab
10. `App.tsx` — Wire ConnectionsTab
11. `lib.rs` — Register modules, commands, init automation engine

## Verification

```sh
cargo check
npm run build
```

