# Task List: Advanced Features

## Spec Files
- [x] spec.md — Feature specification
- [x] plan.md — Implementation plan
- [x] research.md — Research document
- [x] data-model.md — Data model
- [x] contracts/tauri-commands.md — Tauri commands contract
- [x] contracts/bridge-api.md — Bridge API contract
- [x] tasks.md — This task list
- [x] quickstart.md — Setup guide

## Config
- [ ] config.rs — Add WakeWordConfig, McpServerConfig, automations_file

## Wake Word
- [ ] src-tauri/src/audio/wake_word.rs — Wake word detector stub
- [ ] audio/mod.rs — Export wake word module

## Google Workspace
- [ ] src-tauri/src/agent/mod.rs — Agent module
- [ ] src-tauri/src/agent/google.rs — Google Workspace integration

## Automations
- [ ] src-tauri/src/automation/mod.rs — Automation engine

## 3D Generation
- [ ] src-tauri/src/gen3d.rs — 3D model generation

## Bridge
- [ ] bridge.rs — Add SSE endpoint
- [ ] bridge.rs — Add click, notify, mcp/tools, mcp/call endpoints

## Commands
- [ ] commands.rs — Wake word commands
- [ ] commands.rs — Google Workspace commands
- [ ] commands.rs — Automation commands
- [ ] commands.rs — MCP commands
- [ ] commands.rs — 3D generation command

## Frontend
- [ ] src/components/ActiveAgentsWidget.tsx
- [ ] src/components/TodayStatsWidget.tsx
- [ ] src/components/NeedsAttentionWidget.tsx
- [ ] src/components/ConnectionsTab.tsx
- [ ] src/App.tsx — Wire ConnectionsTab

## Wiring
- [ ] lib.rs — Register modules, commands, init automation engine
- [ ] Verification: cargo check + npm run build
