# Quickstart: Agent Mode

## Build & Verify

```sh
cargo check
cargo test
npm run build
```

## Frontend Integration

The AgentsTab component replaces the placeholder in App.tsx.
Agent commands are available through `useAgents()` hook:

```typescript
const { agents, createAgent, runAgent, stopAgent, listSkills } = useAgents();
await createAgent("My Agent", "my-agent", ["screen-control"]);
await runAgent("my-agent", "What is on my screen?");
```

## Bridge API

Agent endpoints are at `http://127.0.0.1:32123/agent/*`.

## Skills Directory

Place skills as TOML files in `skills/`:
```toml
name = "my-skill"
description = "Does something useful"
version = "1.0.0"
permission_class = "safe"
entry_point = "my-skill.js"
```

## Testing

1. Start ClickyX
2. Open Agents tab
3. Create an agent
4. Enable a skill
5. Run the agent with a prompt
6. Check transcript for output
