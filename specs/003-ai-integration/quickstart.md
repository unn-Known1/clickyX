# Quickstart: AI Integration

## Prerequisites

- Phase 1 Core Foundation complete (panel, config, tray, bridge)
- API keys for Anthropic (https://console.anthropic.com) and/or OpenAI (https://platform.openai.com)

## Dependencies Added

```toml
# src-tauri/Cargo.toml
[dependencies]
reqwest = { version = "0.12", features = ["json", "stream"] }
async-trait = "0.1"
futures-util = "0.3"
```

## Module Structure

```
src-tauri/src/ai/
├── mod.rs        — AiProvider trait, ChatMessage, ImageInput, AiConfig, AiError, create_provider
├── catalog.rs    — ModelInfo, ModelCatalog (static model registry)
├── anthropic.rs  — AnthropicProvider (Claude API)
├── openai.rs     — OpenAIProvider (GPT API)
├── streaming.rs  — StreamEvent, StreamReceiver, StreamSender, create_channel
└── guidance.rs   — GuidanceTag enum, parse_guidance_tags, strip_guidance_tags
```

## Configuration

Add to your config file (`~/.config/clickyx/config.json`):

```json
{
  "ai": {
    "anthropic_api_key": "sk-ant-...",
    "anthropic_model": "claude-sonnet-4-20250514",
    "openai_api_key": "sk-proj-...",
    "openai_model": "gpt-4o",
    "default_provider": "anthropic",
    "system_prompt": "You are ClickyX, a helpful AI assistant."
  }
}
```

## Frontend Usage

### Chat with AI
```typescript
import { useChat } from '../hooks/useChat';

function MyComponent() {
  const { messages, sendMessage, streaming, currentText } = useChat();

  return (
    <div>
      {messages.map((m, i) => (
        <div key={i}>{m.role}: {m.content}</div>
      ))}
      {streaming && <div>{currentText}</div>}
      <input onKeyDown={(e) => e.key === 'Enter' && sendMessage(e.currentTarget.value)} />
    </div>
  );
}
```

### Vision (screenshots)
```typescript
import { useVision } from '../hooks/useVision';

const { images, addImage, clearImages } = useVision();
// addImage(base64Data, 'image/png')
```

## Development

```bash
# Check Rust compilation
cargo check

# Run with Tauri dev
cargo tauri dev

# Build frontend
npm run build
```

## Verification

```bash
cargo check    # Rust compilation check
npm run build  # Frontend build
```
