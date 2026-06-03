# Internal Tauri Command Contract: AI Integration

## Overview

Rust functions exposed to the React frontend via `#[tauri::command]`.
Called from the panel UI using `@tauri-apps/api` `invoke()`.

## Commands

### send_chat_message

**Description**: Sends a chat message to the AI provider and returns the full response text.

**Signature**: `async fn send_chat_message(app: AppHandle, message: String, model: Option<String>) -> Result<String, String>`

**Example**:
```typescript
import { invoke } from '@tauri-apps/api/core';
const response = await invoke('send_chat_message', {
  message: 'What is on my screen?',
  model: null, // uses default
});
```

### send_chat_message_stream

**Description**: Starts streaming a chat response. Emits `stream-event` Tauri events with `StreamEvent` payloads.

**Signature**: `async fn send_chat_message_stream(app: AppHandle, message: String, model: Option<String>) -> Result<(), String>`

**Example**:
```typescript
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen('stream-event', (event) => {
  // event.payload is StreamEvent
  // { type: 'TextDelta', text: 'Hello' }
  // { type: 'Done' }
  // { type: 'Error', message: '...' }
});
await invoke('send_chat_message_stream', { message: 'Hello' });
```

### chat_with_vision

**Description**: Sends a chat message with attached images for vision analysis.

**Signature**: `async fn chat_with_vision(app: AppHandle, message: String, images: Vec<String>, model: Option<String>) -> Result<String, String>`

**Example**:
```typescript
const response = await invoke('chat_with_vision', {
  message: 'What is in this image?',
  images: ['data:image/png;base64,...'],
});
```

### get_models

**Description**: Returns the list of available models, optionally filtered by provider.

**Signature**: `fn get_models(provider: Option<String>) -> Result<Vec<ModelInfo>, String>`

**Example**:
```typescript
const models = await invoke('get_models');
const anthropicModels = await invoke('get_models', { provider: 'anthropic' });
```

### get_ai_config

**Description**: Returns the current AI configuration.

**Signature**: `fn get_ai_config(app: AppHandle) -> Result<AiConfig, String>`

### update_ai_config

**Description**: Updates AI configuration settings. Merges with existing config.

**Signature**: `fn update_ai_config(app: AppHandle, partial: serde_json::Value) -> Result<AiConfig, String>`

**Example**:
```typescript
await invoke('update_ai_config', {
  partial: { anthropic_api_key: 'sk-ant-...', default_provider: 'anthropic' },
});
```

## Error Handling

All commands return `Result<T, String>` where `String` is a human-readable error message. Error sources include:
- Missing API keys
- Network errors
- API errors (auth, rate limit)
- Invalid model IDs
