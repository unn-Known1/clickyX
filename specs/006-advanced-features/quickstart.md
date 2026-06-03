# Quickstart: Advanced Features

## New Dependencies

Add to `src-tauri/Cargo.toml` if not present:
```toml
uuid = { version = "1", features = ["v4"] }  # (already present)
```

## Rust Module Structure

```
src-tauri/src/
  audio/
    mod.rs           — +pub mod wake_word;
    wake_word.rs     — Wake word detector stub
  agent/
    mod.rs           — Module exports
    google.rs        — Google Workspace integration
  automation/
    mod.rs           — Automation engine
  gen3d.rs           — 3D model generation
  config.rs          — +WakeWordConfig, +McpServerConfig, +automations_file
  commands.rs        — +Wake word, Google, Automation, MCP, 3D commands
  bridge.rs          — +SSE endpoint, +click, +notify, +mcp endpoints
  lib.rs             — Register modules, commands, init automation
```

## Frontend Structure

```
src/
  components/
    ConnectionsTab.tsx       — Full connections/integrations UI
    ActiveAgentsWidget.tsx   — Status dots dashboard widget
    TodayStatsWidget.tsx     — Today's stats widget
    NeedsAttentionWidget.tsx — Needs-attention widget
  App.tsx                    — Wire ConnectionsTab
```

## Automation Engine Lifecycle

1. `AutomationEngine::load()` — Loads automations from JSON file
2. `engine.start()` — Starts 30-second timer tick
3. Timer tick checks each enabled automation's schedule
4. If due, executes automation prompt through agent pipeline
5. `engine.stop()` — Stops timer

## SSE Event Flow

```
[Backend]                    [Bridge SSE]
  emit_event()         →     broadcast::send()
                              ↓
[External Client]            GET /events (SSE stream)
                              receives events
```

## Verification

```sh
cargo check          # Rust compilation check
npm run build        # Frontend build
```
