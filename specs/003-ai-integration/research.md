# Research: AI Provider APIs

## Anthropic Claude API

### Base URL
```
https://api.anthropic.com/v1/messages
```

### Authentication
- Header: `x-api-key: <key>`
- Header: `anthropic-version: 2023-06-01`

### Request Format
```json
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 1024,
  "stream": false,
  "system": "You are ClickyX, a helpful AI assistant.",
  "messages": [
    {"role": "user", "content": "Hello"}
  ]
}
```

### Vision (content blocks)
```json
{
  "role": "user",
  "content": [
    {"type": "text", "text": "What's in this image?"},
    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": "<base64>"}}
  ]
}
```

### Streaming Format (SSE)
```
event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}

event: message_stop
data: {"type":"message_stop"}
```

### Non-streaming Response
```json
{
  "id": "msg_01...",
  "type": "message",
  "role": "assistant",
  "content": [{"type": "text", "text": "Hello! How can I help?"}],
  "model": "claude-sonnet-4-20250514",
  "stop_reason": "end_turn",
  "usage": {"input_tokens": 10, "output_tokens": 25}
}
```

### Prompt Caching
- Header: `anthropic-beta: prompt-caching-2025-02-07`
- Cache content by marking with `cache_control`:
```json
{"type": "text", "text": "long context...", "cache_control": {"type": "ephemeral"}}
```

### Models (as of 2026)
- `claude-opus-4-20250514` — Most capable
- `claude-sonnet-4-20250514` — Best balance (default)
- `claude-haiku-3-20250313` — Fast/cheap

---

## OpenAI API

### Base URL
```
https://api.openai.com/v1/chat/completions
```

### Authentication
- Header: `Authorization: Bearer <key>`

### Request Format
```json
{
  "model": "gpt-4o",
  "messages": [
    {"role": "system", "content": "You are ClickyX."},
    {"role": "user", "content": "Hello"}
  ],
  "stream": false
}
```

### Vision (content array)
```json
{
  "role": "user",
  "content": [
    {"type": "text", "text": "What's in this image?"},
    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,<base64>"}}
  ]
}
```

### Streaming Format (SSE)
```
data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant"},"index":0}]}

data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"},"index":0}]}

data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop","index":0}]}

data: [DONE]
```

### Non-streaming Response
```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "choices": [{"message": {"role": "assistant", "content": "Hello!"}, "finish_reason": "stop"}],
  "usage": {"prompt_tokens": 10, "completion_tokens": 5}
}
```

### Models (as of 2026)
- `gpt-4o` — Most capable vision model
- `gpt-4o-mini` — Fast/cheap
- `o3-mini` — Reasoning model (no streaming)
- `o1` — Advanced reasoning

---

## Streaming Approaches

### SSE Parsing Strategy
Both providers use Server-Sent Events (text/event-stream). The parser:
1. Accumulates chunks into a buffer
2. Splits on double newline (`\n\n`) for complete events
3. Extracts `event:` and `data:` fields from each event block
4. Dispatches based on event type / JSON content

### Anthropic-specific
- Events: `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`
- Text comes from `content_block_delta` events with `delta.type == "text_delta"`
- Need to track `index` for multi-block responses

### OpenAI-specific
- Simple data-only SSE: each line is `data: {...}`
- Text comes from `choices[0].delta.content`
- Stream ends with `data: [DONE]`

---

## Visual Guidance Tag Format

Tags are appended to AI response text, separated by a separator line `---`:

```
[POINT:500,300:click the submit button]
[RECT:100,200,50,30:input field]
[SCRIBBLE:100,100;200,150;300,200:drag here]
[OFFER:screen_reader]
```

### Tag Types

| Tag | Format | Description |
|-----|--------|-------------|
| POINT | `[POINT:x,y:label]` | Single point with optional label |
| RECT | `[RECT:x,y,w,h:label]` | Rectangle region |
| SCRIBBLE | `[SCRIBBLE:x,y;x,y;x,y:label]` | Series of connected points |
| OFFER | `[OFFER:agent_slug]` | Agent offer suggestion |

### Parsing Strategy
- Use regex to match each tag pattern
- Return structured enum values
- Stripped from display text rendered in chat UI
