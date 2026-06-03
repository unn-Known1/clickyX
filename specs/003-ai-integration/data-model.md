# Data Model: AI Integration

## Entity: AiConfig

AI provider configuration, stored as part of AppConfig.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `anthropic_api_key` | `string?` | `null` | Anthropic API key |
| `anthropic_model` | `string` | `"claude-sonnet-4-20250514"` | Default Anthropic model |
| `openai_api_key` | `string?` | `null` | OpenAI API key |
| `openai_model` | `string` | `"gpt-4o"` | Default OpenAI model |
| `default_provider` | `"anthropic" \| "openai"` | `"anthropic"` | Default provider |
| `system_prompt` | `string` | `"You are ClickyX..."` | System prompt for AI |

```rust
struct AiConfig {
    anthropic_api_key: Option<String>,
    anthropic_model: String,
    openai_api_key: Option<String>,
    openai_model: String,
    default_provider: String,
    system_prompt: String,
}
```

---

## Entity: ModelInfo / ModelCatalog

Metadata about available AI models.

```rust
struct ModelInfo {
    id: String,             // "claude-sonnet-4-20250514"
    provider: String,       // "anthropic"
    name: String,           // "Claude Sonnet 4"
    capabilities: Vec<String>, // ["chat", "vision", "streaming"]
}

struct ModelCatalog {
    models: Vec<ModelInfo>,
}

impl ModelCatalog {
    fn new() -> Self;
    fn get_model(&self, id: &str) -> Option<&ModelInfo>;
    fn get_provider_models(&self, provider: &str) -> Vec<&ModelInfo>;
}
```

### Default Models

| ID | Provider | Name | Capabilities |
|----|----------|------|--------------|
| `claude-sonnet-4-20250514` | anthropic | Claude Sonnet 4 | chat, vision, streaming |
| `claude-opus-4-20250514` | anthropic | Claude Opus 4 | chat, vision, streaming |
| `claude-haiku-3-20250313` | anthropic | Claude Haiku 3 | chat, vision, streaming |
| `gpt-4o` | openai | GPT-4o | chat, vision, streaming |
| `gpt-4o-mini` | openai | GPT-4o Mini | chat, vision, streaming |
| `o3-mini` | openai | o3-mini | chat, streaming |

---

## Entity: ChatMessage

A message in the chat conversation.

| Field | Type | Description |
|-------|------|-------------|
| `role` | `"user" \| "assistant" \| "system"` | Message role |
| `content` | `string` | Message text content |

```rust
struct ChatMessage {
    role: String,
    content: String,
}
```

## Entity: ImageInput

An image attached to a chat message.

| Field | Type | Description |
|-------|------|-------------|
| `media_type` | `string` | MIME type ("image/jpeg", "image/png") |
| `data` | `string` | Base64-encoded image data |

```rust
struct ImageInput {
    media_type: String,
    data: String,
}
```

---

## Entity: StreamEvent

Events emitted during streaming responses.

| Variant | Fields | Description |
|---------|--------|-------------|
| `TextDelta` | `text: String` | New text chunk |
| `TextDone` | `text: String` | Full accumulated text |
| `Error` | `message: String` | Error occurred |
| `Done` | — | Stream completed |

```rust
enum StreamEvent {
    TextDelta(String),
    TextDone(String),
    Error(String),
    Done,
}
```

---

## Entity: GuidanceTag

Visual guidance tag parsed from AI responses.

| Variant | Fields | Description |
|---------|--------|-------------|
| `Point` | `x: f64, y: f64, label: Option<String>` | Single point marker |
| `Rect` | `x: f64, y: f64, w: f64, h: f64, label: Option<String>` | Rectangle region |
| `Scribble` | `points: Vec<(f64, f64)>, label: Option<String>` | Freeform path |
| `Offer` | `agent_slug: String` | Agent activation suggestion |

```rust
enum GuidanceTag {
    Point { x: f64, y: f64, label: Option<String> },
    Rect { x: f64, y: f64, w: f64, h: f64, label: Option<String> },
    Scribble { points: Vec<(f64, f64)>, label: Option<String> },
    Offer { agent_slug: String },
}
```

### State Transitions

```
[User types message] → send_chat_message → [API call] → [Response text]
                                                                   ↓
[Display text in chat] ← strip_guidance_tags ← [Parse guidance tags] → [Overlay rendering]
                                                                   ↓
                                                        [Agent offer detection]
```
