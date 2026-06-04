# ClickyX Bridge API Reference

The ClickyX bridge is a local HTTP server running on `http://127.0.0.1:32123`. It provides a
programmatic interface for external tools, OpenClicky-compatible clients, and automation scripts
to interact with ClickyX without using the Tauri IPC layer.

---

## Authentication

When `bridge_token` is set in `config.json`, all requests must include:

```
X-Bridge-Token: <your-token>
```

Requests without a valid token receive `401 Unauthorized`. When `bridge_token` is `null`
(the default), no authentication is required.

---

## Common Response Schemas

### Success — `{ "ok": true }`

```json
{ "ok": true }
```

### Error

```json
{
  "error": "error_code",
  "message": "Human-readable description"
}
```

Common error codes: `not_found`, `bad_request`, `internal_error`, `auth_error`, `overlay_error`,
`capture_error`, `provider_error`, `transcription_failed`.

---

## Endpoints

---

### `GET /health`

Check that the bridge server is running.

**Authentication:** Not required.

**Response `200`:**
```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

**Example:**
```sh
curl http://127.0.0.1:32123/health
```

---

### `POST /panel/toggle`

Show or hide the main ClickyX panel window.

**Request body:** None

**Response `200`:**
```json
{
  "panel_visible": true,
  "panel_pinned": false
}
```

`panel_visible` reflects the state **after** the toggle.

**Response `500`:** `internal_error` — main window not found.

**Example:**
```sh
curl -X POST http://127.0.0.1:32123/panel/toggle
```

---

### `POST /v1/messages`

Proxy to the Anthropic Messages API using the configured `ai.anthropic_api_key`.
The request/response format is identical to `https://api.anthropic.com/v1/messages`.

**Request body:**
```json
{
  "model": "claude-sonnet-4-20250514",
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "system": "You are a helpful assistant.",
  "max_tokens": 4096
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | No | Model ID. Defaults to `ai.anthropic_model` from config. |
| `messages` | array | Yes | Array of `{ role, content }` objects. `content` may be a string or content block array. |
| `system` | string | No | System prompt override. |
| `max_tokens` | integer | No | Default `4096`. |

**Response:** Anthropic API response forwarded verbatim (status code preserved).

**Response `401`:**
```json
{ "error": "auth_error", "message": "Anthropic API key not configured" }
```

**Example:**
```sh
curl -X POST http://127.0.0.1:32123/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hi"}],"max_tokens":100}'
```

---

### `POST /v1/responses`

Proxy to the OpenAI Chat Completions API (`/v1/chat/completions`) using the configured
`ai.openai_api_key`. Compatible with any OpenAI-format endpoint (set `ai.openai_base_url`).

**Request body:**
```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "max_tokens": 4096
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | No | Model ID. Defaults to `ai.openai_model` from config. |
| `messages` | array | Yes | Array of `{ role, content }` objects. |
| `max_tokens` | integer | No | Default `4096`. |

The configured `ai.system_prompt` is prepended as a system message if non-empty.

**Response:** OpenAI API response forwarded verbatim (status code preserved).

**Response `401`:**
```json
{ "error": "auth_error", "message": "OpenAI API key not configured" }
```

---

### `GET /models`

List all models in the ClickyX model catalog.

**Request body:** None

**Response `200`:**
```json
{
  "models": [
    {
      "id": "claude-sonnet-4-20250514",
      "provider": "anthropic",
      "name": "Claude Sonnet 4",
      "capabilities": ["chat", "vision", "computer_use"]
    }
  ]
}
```

---

### `POST /screenshot`

Capture all connected monitors and return JPEG images as base64.

**Request body:** None (body ignored)

**Response `200`:**
```json
{
  "images": [
    {
      "id": 0,
      "data": "<base64-encoded-JPEG>",
      "width": 1920,
      "height": 1080
    }
  ]
}
```

`id` corresponds to the display index (0-based). Multi-monitor setups return multiple entries.

**Response `500`:** `capture_error` — screen capture failed (e.g., permissions not granted).

**Example:**
```sh
curl -X POST http://127.0.0.1:32123/screenshot | jq '.images[0].width'
```

---

### `POST /cursor`

Draw an AI cursor marker at a specific screen coordinate.

**Request body:**
```json
{
  "x": 640.0,
  "y": 400.0,
  "label": "Click here",
  "accent": "#4fc3f7",
  "screen": 0
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `x` | float | Yes | X coordinate in logical pixels (relative to display). |
| `y` | float | Yes | Y coordinate in logical pixels. |
| `label` | string | No | Optional text label shown next to the cursor. |
| `accent` | string | No | Hex color override for this cursor. |
| `screen` | integer | No | Display index. Omit to use the display containing the mouse cursor. |

**Response `200`:** `{ "ok": true }`

**Response `500`:** `overlay_error`

**Example:**
```sh
curl -X POST http://127.0.0.1:32123/cursor \
  -H "Content-Type: application/json" \
  -d '{"x":100,"y":200,"label":"Target"}'
```

---

### `POST /cursors`

Draw multiple AI cursors in a single request (batched).

**Request body:**
```json
{
  "cursors": [
    { "x": 100.0, "y": 200.0, "label": "Step 1" },
    { "x": 300.0, "y": 400.0, "label": "Step 2", "screen": 1 }
  ]
}
```

Each entry in `cursors` has the same schema as the `/cursor` body.
Processing stops on the first error.

**Response `200`:** `{ "ok": true }`

---

### `POST /rectangle`

Draw an overlay rectangle (bounding box) on a display.

**Request body:**
```json
{
  "x": 100.0,
  "y": 100.0,
  "w": 300.0,
  "h": 200.0,
  "label": "Region of interest",
  "screen": 0
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `x` | float | Yes | Left edge coordinate in logical pixels. |
| `y` | float | Yes | Top edge coordinate in logical pixels. |
| `w` | float | Yes | Width in logical pixels. |
| `h` | float | Yes | Height in logical pixels. |
| `label` | string | No | Text label displayed above the rectangle. |
| `screen` | integer | No | Display index. Omit for cursor display. |

**Response `200`:** `{ "ok": true }`

---

### `POST /scribble`

Draw a freehand polyline on the overlay.

**Request body:**
```json
{
  "points": [
    [100.0, 100.0],
    [150.0, 120.0],
    [200.0, 100.0]
  ],
  "label": "Annotation",
  "screen": 0
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `points` | `[float, float][]` | Yes | Array of `[x, y]` coordinate pairs in logical pixels. |
| `label` | string | No | Text label for the scribble. |
| `screen` | integer | No | Display index. |

**Response `200`:** `{ "ok": true }`

---

### `POST /caption`

Display a text caption at a screen position.

**Request body:**
```json
{
  "text": "This button submits the form",
  "x": 640.0,
  "y": 50.0,
  "screen": 0
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Caption text to display. |
| `x` | float | Yes | Horizontal position in logical pixels. |
| `y` | float | Yes | Vertical position in logical pixels. |
| `screen` | integer | No | Display index. |

**Response `200`:** `{ "ok": true }`

---

### `POST /click`

Perform an automated mouse click at the specified screen coordinates.

**Request body:**
```json
{
  "x": 640.0,
  "y": 400.0
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `x` | float | Yes | X coordinate in logical pixels (screen-relative). |
| `y` | float | Yes | Y coordinate in logical pixels. |

**Response `200`:** `{ "ok": true }`

**Note:** This endpoint also emits an SSE `guidance_update` event on the `/events` stream with
`{"action":"click","x":<x>,"y":<y>}`.

**Platform requirements:** Accessibility permission (macOS), or equivalent on Linux/Windows.
Rate-limited by `computer_use.min_click_interval_ms` in config.

---

### `POST /clear`

Clear all overlay annotations from one or all displays.

**Request body (optional):**
```json
{ "screen": 0 }
```

Omit the body (or omit the `screen` field) to clear all displays simultaneously.

**Response `200`:** `{ "ok": true }`

**Example — clear all:**
```sh
curl -X POST http://127.0.0.1:32123/clear
```

**Example — clear display 1 only:**
```sh
curl -X POST http://127.0.0.1:32123/clear \
  -H "Content-Type: application/json" \
  -d '{"screen":1}'
```

---

### `POST /speak`

Synthesize speech using the configured TTS provider and return raw audio.

**Request body:**
```json
{
  "text": "Hello, I am ClickyX.",
  "provider": "elevenlabs"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Text to synthesize. |
| `provider` | string | No | TTS provider override. Defaults to `audio.tts_provider`. Options: `"elevenlabs"`, `"system"`. |

**Response `200`:**
- `Content-Type: audio/wav`
- Body: raw WAV audio bytes.

**Response `400`:** `provider_error` — TTS provider returned an error.

**Response `500`:** `internal_error` — voice pipeline not initialized.

**Example:**
```sh
curl -X POST http://127.0.0.1:32123/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world"}' \
  --output speech.wav
```

---

### `POST /transcribe`

Transcribe a WAV audio file using the configured STT provider.

**Request body:**
```json
{
  "audio_base64": "<base64-encoded-WAV>",
  "provider": "deepgram"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audio_base64` | string | Yes | Base64-encoded WAV audio (standard Base64, not URL-safe). |
| `provider` | string | No | STT provider override. Defaults to `audio.stt_provider`. Options: `"deepgram"`, `"whisper"`. |

**Response `200`:**
```json
{
  "transcript": "Hello, this is a test.",
  "provider": "deepgram"
}
```

**Response `400`:**
- `bad_request` — `audio_base64` missing or invalid Base64.

**Response `500`:** `transcription_failed` — STT provider returned an error.

**Example:**
```sh
AUDIO_B64=$(base64 -w0 /tmp/recording.wav)
curl -X POST http://127.0.0.1:32123/transcribe \
  -H "Content-Type: application/json" \
  -d "{\"audio_base64\":\"$AUDIO_B64\"}"
```

---

### `GET /audio-level`

Get the current microphone input level.

**Request body:** None

**Response `200`:**
```json
{
  "rms": 0.023,
  "peak": 0.041,
  "clipping": false
}
```

| Field | Description |
|-------|-------------|
| `rms` | Root-mean-square amplitude of current audio buffer. Range: 0.0–1.0. |
| `peak` | Peak amplitude of current audio buffer. Range: 0.0–1.0. |
| `clipping` | `true` if the signal is clipping (peak ≥ 1.0). |

Returns `{"rms":0,"peak":0,"clipping":false}` when the voice pipeline is not initialized.

**Example:**
```sh
curl http://127.0.0.1:32123/audio-level
```

---

### `GET /events`

Subscribe to real-time Server-Sent Events (SSE) from ClickyX.

**Request headers:**
```
Accept: text/event-stream
```

**Response:** Streaming `text/event-stream` with `Cache-Control: no-cache`.

**Event format:**
```
event: <event_type>
data: <JSON-payload>

```

**Emitted event types:**

| Event | Payload | Description |
|-------|---------|-------------|
| `guidance_update` | `{"action":"click","x":100,"y":200}` | Emitted after a `/click` request. |
| `agent_state` | `{"slug":"my-agent","state":"running"}` | Agent lifecycle transitions. |
| `voice_transcript` | `{"text":"hello","final":true}` | STT transcript segments. |
| `capture_ready` | `{"screen":0,"timestamp":1234567890}` | New screenshot available. |

**Example (curl):**
```sh
curl -N -H "Accept: text/event-stream" http://127.0.0.1:32123/events
```

**Example (JavaScript):**
```js
const es = new EventSource("http://127.0.0.1:32123/events");
es.addEventListener("guidance_update", (e) => {
  console.log(JSON.parse(e.data));
});
```

---

### `POST /notify`

Show a desktop notification and bring the ClickyX panel to the foreground.

**Request body:**
```json
{
  "title": "Task Complete",
  "body": "Your agent finished the analysis.",
  "icon": "success"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Notification title. |
| `body` | string | Yes | Notification body text. |
| `icon` | string | No | Icon hint (unused in current version). |

**Response `200`:** `{ "ok": true }`

---

### `GET /mcp/tools`

List all tools available from configured MCP servers.

**Response `200`:**
```json
{
  "tools": [
    {
      "server": "filesystem",
      "name": "read_file",
      "description": "Read the contents of a file"
    }
  ]
}
```

**Note:** Returns a placeholder when no MCP servers are configured.

---

### `POST /mcp/call`

Invoke a tool on an MCP server.

**Request body:**
```json
{
  "server": "filesystem",
  "tool": "read_file",
  "args": {
    "path": "/home/user/notes.txt"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `server` | string | Yes | MCP server name (matches `mcp_servers[].name` in config). |
| `tool` | string | Yes | Tool name as returned by `GET /mcp/tools`. |
| `args` | object | Yes | Tool arguments (tool-specific schema). |

**Response `200`:**
```json
{
  "result": "File contents here..."
}
```

---

### `GET /agents`

List all agents in the agent store.

**Response `200`:**
```json
{
  "agents": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "My Agent",
      "slug": "my-agent",
      "state": "idle",
      "skills": ["browser", "code"],
      "created_at": "1748822400",
      "updated_at": "1748822400",
      "transcript": []
    }
  ]
}
```

**Response `500`:** `internal_error` — agent store not available.

---

### `POST /agent/create`

Create a new agent.

**Request body:**
```json
{
  "name": "My Agent",
  "slug": "my-agent",
  "skills": ["browser", "code"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Human-readable agent name. |
| `slug` | string | Yes | Unique identifier (kebab-case). Must be non-empty. |
| `skills` | string[] | No | List of skill names to enable for this agent. |

**Response `200`:** Agent object (same schema as entries in `GET /agents`).

**Response `400`:** `bad_request` — slug is empty.

**Example:**
```sh
curl -X POST http://127.0.0.1:32123/agent/create \
  -H "Content-Type: application/json" \
  -d '{"name":"Analyst","slug":"analyst","skills":["code"]}'
```

---

### `POST /agent/{slug}/run`

Start or resume an agent with an optional prompt.

**Path parameter:** `slug` — the agent's slug.

**Request body:**
```json
{
  "prompt": "Analyze the current screen and summarize what's happening."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | No | Task prompt sent to the agent. Defaults to `""`. |

**Response `200`:** `{ "ok": true }`

**Response `404`:** `not_found` — agent with slug not found.

**Example:**
```sh
curl -X POST http://127.0.0.1:32123/agent/analyst/run \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Summarize the open tabs"}'
```

---

### `POST /agent/{slug}/stop`

Pause a running agent.

**Path parameter:** `slug` — the agent's slug.

**Request body:** None

**Response `200`:** `{ "ok": true }`

**Response `404`:** `not_found`

**Example:**
```sh
curl -X POST http://127.0.0.1:32123/agent/analyst/stop
```

---

### `GET /agent/{slug}/status`

Get the current status and transcript of an agent.

**Path parameter:** `slug` — the agent's slug.

**Response `200`:** Agent object (same schema as `GET /agents` entries):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Analyst",
  "slug": "analyst",
  "state": "running",
  "skills": ["code"],
  "created_at": "1748822400",
  "updated_at": "1748823000",
  "transcript": [
    { "role": "user", "content": "Summarize the open tabs" },
    { "role": "assistant", "content": "I can see 3 tabs open..." }
  ]
}
```

**Agent states:** `idle`, `running`, `paused`, `done`, `error`, `archived`

**Response `404`:** `not_found`

---

### `GET /skills`

List all available skills loaded from the skills directory.

**Response `200`:**
```json
{
  "skills": [
    {
      "name": "browser",
      "description": "Control web browsers",
      "version": "1.0.0",
      "permission_class": "standard",
      "entry_point": "skills/browser/main.js"
    }
  ]
}
```

---

### `POST /scroll`

Perform an automated scroll action at the specified screen coordinates.

**Request body:**
```json
{
  "x": 640.0,
  "y": 400.0,
  "delta_x": 0.0,
  "delta_y": -3.0
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `x` | float | Yes | X coordinate where the scroll originates. |
| `y` | float | Yes | Y coordinate where the scroll originates. |
| `delta_x` | float | No | Horizontal scroll amount. Positive = right, negative = left. Default `0`. |
| `delta_y` | float | No | Vertical scroll amount. Positive = down, negative = up. Default `0`. |

**Response `200`:** `{ "ok": true }`

**Note:** Added in the B-008 CUA scroll fix. Requires accessibility permission on macOS.

---

## Error Reference

| HTTP Status | `error` field | Cause |
|-------------|---------------|-------|
| `400` | `bad_request` | Missing required field or invalid input. |
| `401` | `auth_error` | Bridge token missing or invalid, or AI API key not configured. |
| `404` | `not_found` | Route or resource (agent slug) not found. |
| `500` | `internal_error` | Server-side failure (lock error, missing state, etc.). |
| `500` | `overlay_error` | Failed to communicate with overlay window. |
| `500` | `capture_error` | Screen capture failed (usually a permissions issue). |
| `400` | `provider_error` | AI/TTS/STT provider returned an error response. |
| `500` | `transcription_failed` | STT transcription failed. |

---

## OpenClicky Compatibility

The bridge maintains wire-level compatibility with the original OpenClicky `localhost:32123` spec.
The following endpoints are compatible:

- `GET /health` ✓
- `POST /panel/toggle` ✓
- `POST /v1/messages` ✓
- `POST /screenshot` ✓
- `POST /cursor` ✓
- `POST /rectangle` ✓
- `POST /scribble` ✓
- `POST /caption` ✓
- `POST /click` ✓
- `POST /clear` ✓
- `POST /speak` ✓
- `GET /events` ✓ (SSE)
