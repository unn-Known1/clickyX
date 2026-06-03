# Bridge API: Agent Mode

## Base URL

```
http://127.0.0.1:32123
```

## Endpoints

### POST /agent/create
Create a new agent session.

**Request**:
```json
{
  "name": "My Agent",
  "slug": "my-agent",
  "skills": ["screen-control", "codex"]
}
```

**Response 200**:
```json
{
  "id": "uuid",
  "name": "My Agent",
  "slug": "my-agent",
  "state": "Created",
  "skills": ["screen-control", "codex"],
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-01-01T00:00:00Z",
  "transcript": []
}
```

### POST /agent/{slug}/run
Run an agent with a prompt.

**Request**:
```json
{
  "prompt": "Look at my screen and tell me what you see"
}
```

**Response 200**:
```json
{ "ok": true }
```

### POST /agent/{slug}/stop
Stop a running agent.

**Response 200**:
```json
{ "ok": true }
```

### GET /agent/{slug}/status
Get agent status.

**Response 200**:
```json
{
  "id": "uuid",
  "slug": "my-agent",
  "state": "Running",
  "name": "My Agent",
  "created_at": "...",
  "updated_at": "..."
}
```

### GET /agents
List all agents.

**Response 200**:
```json
{
  "agents": [
    {
      "id": "uuid",
      "slug": "my-agent",
      "name": "My Agent",
      "state": "Created"
    }
  ]
}
```

### GET /skills
List available skills.

**Response 200**:
```json
{
  "skills": [
    {
      "name": "screen-point",
      "description": "Point at a coordinate on screen",
      "version": "1.0.0",
      "permission_class": "safe"
    }
  ]
}
```

## Error Responses

| Status | Error Code | Description |
|--------|-----------|-------------|
| 404 | `not_found` | Agent or skill not found |
| 400 | `bad_request` | Invalid request data |
| 500 | `internal_error` | Server error |
