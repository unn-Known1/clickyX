# Implementation Plan: Agent Mode / Codex Runtime

## Overview

Phase 4 adds agent mode to ClickyX. This includes:
1. Agent module (codex, session, skills, dock)
2. Config additions (AgentConfig)
3. Tauri commands for agent lifecycle
4. Bridge endpoints for external agent control
5. Frontend agent management UI
6. Skills directory with bundled skills

## Implementation Order

### Step 1: Spec files (all docs)

### Step 2: Config additions
- Add AgentConfig struct to config.rs
- Add pub agent: AgentConfig to AppConfig
- Default: codex_path = None (PATH lookup), codex_home = platform data dir

### Step 3: Agent Rust module
- mod.rs – module exports
- codex.rs – CodexProcess struct (start, stop, send_rpc, is_running)
- session.rs – AgentSession, SessionState, session store
- skills.rs – Skill struct, load/discover functions
- dock.rs – AgentDockItem, AgentDockState

### Step 4: Tauri commands
- 13 new agent commands in commands.rs
- AgentState management with Mutex<HashMap<String, AgentSession>>
- CodexState management with Mutex<Option<CodexProcess>>

### Step 5: Bridge endpoints
- 6 new HTTP endpoints in bridge.rs
- Agent creation, running, status listing

### Step 6: Skills directory
- _shared compatibility policy
- screen-control skills (TOML/JSON)
- codex management skill

### Step 7: Frontend
- useAgents.ts hook
- AgentsTab.tsx component
- AgentCard.tsx component
- Wire into App.tsx

### Step 8: Wiring in lib.rs
- Add mod agent
- Register commands
- Initialize state
- Cleanup on exit

## Dependencies

- serde, serde_json (available)
- uuid (available)
- tokio (available)
- reqwest (available)
- chrono (may need to add if timestamps needed, using string UTC instead)

## Risk Mitigation

- Codex not installed: codex_path = None, try PATH lookup, graceful failure
- Process crash: poll status, auto-restart configurable
- Skills dir missing: load returns empty vec, not error
