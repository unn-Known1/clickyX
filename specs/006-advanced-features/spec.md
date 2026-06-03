# Feature Specification: Advanced Features

## Overview

Phase 6 adds advanced integration capabilities to ClickyX: wake word detection,
Google Workspace integration, automations system, MCP server support, SSE bridge
extension, 3D model generation, and desktop widgets.

**Driven by**: Phase 6 of `docs/FEATURE_SPEC.md` (Advanced Features).

---

## User Scenarios

### US1: Wake word activation

User says "Hey Clicky" and ClickyX starts listening for commands.

**Acceptance criteria**:
- Wake word detection runs on-device (stub)
- Configurable wake phrases
- Three activation modes: push-to-talk, toggle, always listening
- Audio ducking when voice detected

### US2: Google Workspace integration

User asks "Check my email" or "Create a new doc". ClickyX uses gogcli CLI.

**Acceptance criteria**:
- Check gogcli availability at startup
- Secure credential storage (platform keychain stubs)
- Read scopes: Gmail, Calendar, Drive, Docs, Sheets, Slides
- Write guard: explicit user intent required before mutations

### US3: Automations

User sets up "Summarize emails every 6 hours" as an automation.

**Acceptance criteria**:
- Create, list, update, delete automations
- Interval-based and cron-based schedules
- 30-second timer tick for scheduling
- System automation "App skill discovery" every 6h (protected)
- JSON persistence

### US4: MCP server configuration

User connects to external MCP servers for tool use.

**Acceptance criteria**:
- Add, list, update, remove MCP servers
- Each server has name, command, args, env, enabled flag
- Persisted in config.json

### US5: SSE real-time events

External consumers subscribe to `GET /events` for real-time updates.

**Acceptance criteria**:
- SSE stream at `/events`
- Event types: agent_status, panel_toggle, audio_level, guidance_update
- Uses tokio::sync::broadcast

### US6: 3D model generation

User prompts "Create a 3D model of a futuristic chair" and ClickyX generates it.

**Acceptance criteria**:
- Tripo3D API integration
- GLB output saved to disk
- Polling: 2s interval, 300s timeout
- Tauri command for frontend invocation

### US7: Desktop widgets

User sees active agents, today's stats, and needs-attention items on dashboard.

**Acceptance criteria**:
- ActiveAgentsWidget: status dots, titles
- TodayStatsWidget: Agents, Voice, Review counts
- NeedsAttentionWidget: failed agents, permissions, credentials
- Data source: local JSON cache at app data dir (15-min refresh)

---

## Non-Goals

- On-device wake word ML training
- Google OAuth flow (uses gogcli pre-configured)
- MCP protocol implementation (just server config)
- Video generation
- Persistent widget server

