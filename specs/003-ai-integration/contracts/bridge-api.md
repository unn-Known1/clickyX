# Bridge API Contract: AI Integration

## Overview

Local HTTP API served on `127.0.0.1:32123`. Only localhost connections are accepted. All endpoints return JSON responses.

## Base URL

```
http://127.0.0.1:32123
```

## Endpoints

### POST /v1/messages

Anthropic-compatible proxy. Forwards requests to the Anthropic Messages API.

**Request**:
```json
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 1024,
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "system": "Optional system prompt"
}
```

**Response 200**:
```json
{
  "id": "msg_01...",
  "type": "message",
  "role": "assistant",
  "content": [{"type": "text", "text": "Hello! How can I help?"}],
  "model": "claude-sonnet-4-20250514",
  "stop_reason": "end_turn",
  "usage": {"input_tokens": 10, "output_tokens": 5}
}
```

**Response 401**: `{"error": "auth_error", "message": "API key not configured"}`

### POST /v1/responses

OpenAI-compatible proxy. Forwards requests to the OpenAI Chat Completions API.

**Request**:
```json
{
  "model": "gpt-4o",
  "messages": [
    {"role": "system", "content": "You are ClickyX."},
    {"role": "user", "content": "Hello"}
  ],
  "max_tokens": 1024
}
```

**Response 200**:
```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "choices": [{"message": {"role": "assistant", "content": "Hello!"}, "finish_reason": "stop"}],
  "usage": {"prompt_tokens": 10, "completion_tokens": 5}
}
```

### GET /models

Returns the model catalog.

**Response 200**:
```json
{
  "models": [
    {
      "id": "claude-sonnet-4-20250514",
      "provider": "anthropic",
      "name": "Claude Sonnet 4",
      "capabilities": ["chat", "vision", "streaming"]
    }
  ]
}
```

## Error Responses

```json
{
  "error": "not_found",
  "message": "Route not found"
}
```

| Status | Error Code | Description |
|--------|-----------|-------------|
| 400 | `bad_request` | Invalid request body |
| 401 | `auth_error` | API key not configured |
| 404 | `not_found` | Unknown endpoint |
| 500 | `internal_error` | Unexpected server error |
