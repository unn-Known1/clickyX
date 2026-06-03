# Bridge API: Advanced Features Endpoints

## Base URL: `http://127.0.0.1:32123`

### `GET /events`
SSE stream for real-time events.

**Response**: Server-Sent Events stream

**Event types**:
```
event: agent_status
data: {"type":"agent_status","agent_id":"helper","status":"running"}

event: panel_toggle
data: {"type":"panel_toggle","visible":true}

event: audio_level
data: {"type":"audio_level","rms":0.05,"peak":0.12,"clipping":false}

event: guidance_update
data: {"type":"guidance_update","action":"show_cursor","payload":{"x":100,"y":200}}
```

### `POST /click`
Execute left-click at coordinates.

**Request**:
```json
{
  "x": 100,
  "y": 200
}
```

**Response**: `{"ok": true}`

### `POST /notify`
Send desktop notification.

**Request**:
```json
{
  "title": "ClickyX",
  "body": "Your task is complete",
  "icon": "info"
}
```

**Response**: `{"ok": true}`

### `POST /mcp/tools`
List available MCP tools.

**Response**:
```json
{
  "tools": [
    {
      "server": "server-name",
      "name": "tool-name",
      "description": "Tool description"
    }
  ]
}
```

### `POST /mcp/call`
Call a single MCP tool.

**Request**:
```json
{
  "server": "server-name",
  "tool": "tool-name",
  "args": {}
}
```

**Response**:
```json
{
  "result": "tool output"
}
```
