# Feature Specification: Agent Mode / Codex Runtime

## Overview

ClickyX Agent Mode provides a full agent runtime powered by Codex (a Node.js binary).
This feature enables persistent agent sessions, skill loading, Codex process lifecycle
management, an agent dock for overlay rendering, and a comprehensive agent management UI.

**Driven by**: Phase 4 of `docs/FEATURE_SPEC.md` (Agent Mode / Codex Runtime).

---

## User Scenarios

### US1: User creates and runs an agent

The user creates a named agent with selected skills, provides a prompt, and the agent
executes the task. Progress is shown in the transcript.

**Acceptance criteria**:
- Agent can be created with name, slug, and enabled skills
- Agent starts execution when prompted
- Transcript is populated with steps and results
- Agent can be stopped mid-execution

### US2: User manages agent lifecycle

Agents can be paused, archived, and resumed. Archived agents are preserved
for later reference.

**Acceptance criteria**:
- Agent can be stopped during execution
- Agent can be archived
- Archived agent can be resumed as a new session
- Agent status is accurately reflected (idle, running, done, error)

### US3: System manages Codex process lifecycle

Codex is started/stopped as a managed child process. Its configuration is
generated from ClickyX settings.

**Acceptance criteria**:
- Codex binary is launched with generated config.toml
- Process health is monitored
- Process is stopped gracefully on shutdown
- JSON-RPC communication works over stdio

### US4: Skills are loaded and scoped

Skills are TOML/JSON files loaded from the `skills/` directory. Each skill
has a permission class that restricts what it can do.

**Acceptance criteria**:
- Skills are discoverable from the skills directory
- Permission classes (safe, shell, filesystem, full) are enforced
- Bundled skills ship with ClickyX

### US5: Agent dock shows status

The overlay agent dock displays per-session status dots and hover cards.

**Acceptance criteria**:
- Dock shows all active agent sessions
- Each session has a colored status dot
- Hover shows agent name, status, and caption
- Dock position is configurable

---

## Architecture

```
┌─────────────────────┐
│   React Frontend    │  AgentsTab, AgentCard, useAgents hook
│   (Agents tab UI)   │
└────────┬────────────┘
         │ invoke()
┌────────▼────────────┐
│   Tauri Commands    │  list_agents, create_agent, run_agent, etc.
│   (commands.rs)     │
└────────┬────────────┘
         │
┌────────▼────────────┐
│   Agent Module      │  codex.rs, session.rs, skills.rs, dock.rs
│   (agent/)          │
└────────┬────────────┘
         │
┌────────▼────────────┐
│   Bridge API        │  POST /agent/create, GET /agents, etc.
│   (bridge.rs)       │
└────────┬────────────┘
         │
┌────────▼────────────┐
│   Codex Process     │  Manages Node.js child process with stdio JSON-RPC
│   (codex.rs)        │
└─────────────────────┘
```

## Data Flow

1. User creates agent via UI -> invoke -> commands.rs -> session.rs (store)
2. User runs agent -> invoke -> commands.rs -> codex.rs (start Codex if needed)
3. Codex receives JSON-RPC task -> executes via skills -> returns results
4. Status updates flow back through transcript -> frontend polls or receives events
5. Bridge API mirrors all agent commands for external consumers

## Non-Goals

- Bundling Codex binary (user must have Codex installed)
- Multi-user agent sessions
- Agent-to-agent communication
- Persistent agent state beyond JSON storage in config dir
