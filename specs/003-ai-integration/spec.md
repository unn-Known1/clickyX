# Feature Specification: AI Integration

## Overview

ClickyX integrates with AI providers (Anthropic Claude, OpenAI) for chat, streaming, vision understanding, and visual guidance overlay. This feature establishes the model catalog, provider abstraction layer, streaming event pipeline, visual guidance tag parsing, and Tauri commands/bridge endpoints required for AI-powered interactions.

**Driven by**: Phase 3 of `docs/FEATURE_SPEC.md` (AI Integration).

---

## User Scenarios

### US1: User sends a chat message and gets a response

The user types a question in the Home tab prompt. ClickyX sends it to the configured AI provider (Anthropic or OpenAI) and displays the response as a chat message.

**Acceptance criteria**:
- Message is sent to the configured provider API.
- Text response is displayed in the chat history.
- Errors (network, auth, rate limit) are shown as user-friendly messages.

### US2: User sees response streamed character-by-character

The AI response appears incrementally as if someone is typing, providing immediate feedback.

**Acceptance criteria**:
- Text appears character-by-character as the stream delivers deltas.
- Streaming works for both Anthropic and OpenAI providers.
- User can send a new message while streaming is in progress.

### US3: User attaches a screenshot for AI analysis

The user takes a screenshot and sends it with a question. The AI analyzes the image content.

**Acceptance criteria**:
- Screenshot is captured and base64-encoded.
- Image is sent to the provider as a vision content block.
- AI responds with analysis of the image content.
- Works with both Anthropic (base64) and OpenAI (data URL) formats.

### US4: AI response includes visual guidance tags

The AI returns coordinate-based tags like `[POINT:500,300:button]` to highlight screen elements. The app parses these and can display overlay markers.

**Acceptance criteria**:
- Tags are parsed into structured GuidanceTag enums.
- Tags are stripped from the display text shown to the user.
- Parsed tags are available for the overlay system to render.

### US5: User configures AI provider settings

The user navigates to Settings and configures API keys, models, and system prompt for AI providers.

**Acceptance criteria**:
- Settings tab has AI section with provider configuration.
- API keys are stored securely in local config.
- Changing settings takes effect without restart.
- Model selector shows available models for each provider.

---

## Functional Requirements

### FR1: Model Catalog

- FR1.1 The application MUST maintain a catalog of supported AI models.
- FR1.2 Each model entry MUST include: id, provider, name, capabilities.
- FR1.3 Capabilities MUST include: chat, vision, streaming, tools, realtime.
- FR1.4 The catalog MUST be queryable by model ID and provider.

### FR2: AI Provider Abstraction

- FR2.1 The system MUST define an AiProvider trait with chat, chat_stream, and chat_with_vision methods.
- FR2.2 AnthropicProvider MUST implement AiProvider for the Claude API.
- FR2.3 OpenAIProvider MUST implement AiProvider for the OpenAI API.
- FR2.4 Providers MUST be instantiable from AiConfig.

### FR3: Streaming

- FR3.1 The system MUST support SSE-based streaming for both providers.
- FR3.2 Stream events MUST include: TextDelta, TextDone, Error, Done.
- FR3.3 Frontend MUST receive stream events via Tauri event emit.

### FR4: Visual Guidance

- FR4.1 The system MUST parse POINT, RECT, SCRIBBLE, and OFFER guidance tags.
- FR4.2 Parsed tags MUST be returned as structured GuidanceTag enum values.
- FR4.3 The system MUST provide a function to strip tags from display text.

### FR5: Tauri Commands

- FR5.1 `send_chat_message` MUST send a message and return the full response.
- FR5.2 `send_chat_message_stream` MUST start streaming and emit events.
- FR5.3 `get_models` MUST return the model catalog.
- FR5.4 `get_ai_config` MUST return the current AI configuration.
- FR5.5 `update_ai_config` MUST update AI settings.
- FR5.6 `chat_with_vision` MUST handle image attachments.

### FR6: Bridge Endpoints

- FR6.1 `POST /v1/messages` MUST proxy to Anthropic Messages API.
- FR6.2 `POST /v1/responses` MUST proxy to OpenAI Responses API.
- FR6.3 `GET /models` MUST return the model catalog.

---

## Success Criteria

1. Chat message round-trip completes within 5 seconds for text-only queries.
2. Streaming shows first text delta within 2 seconds.
3. Vision queries with screenshots return analysis within 10 seconds.
4. All existing Phase 1 functionality continues to work unchanged.
5. `cargo check` passes without errors.
6. `npm run build` passes without errors.

---

## Key Entities

- **AiProvider** — trait for AI provider implementations
- **ModelInfo** — metadata about an AI model
- **ModelCatalog** — registry of available models
- **ChatMessage** — message with role and content
- **StreamEvent** — streaming event (TextDelta, TextDone, Error, Done)
- **GuidanceTag** — visual guidance tag (Point, Rect, Scribble, Offer)
- **AiConfig** — provider configuration (API keys, model selection)

---

## Assumptions

- The application stores API keys in local config file (not encrypted in Phase 3; encryption deferred to Phase 7).
- Both Anthropic and OpenAI APIs are accessible at their standard endpoints.
- SSE streaming uses standard text/event-stream format.
- Images for vision are base64-encoded strings.
- The system prompt is configurable per-provider.
