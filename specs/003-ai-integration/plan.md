# Implementation Plan: AI Integration

## Technical Context

### Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| AI Provider trait | `async-trait` (Rust) | Async trait methods for provider implementations |
| HTTP client | `reqwest` (Rust) | Async HTTP with JSON and streaming support |
| SSE parsing | `reqwest::stream` + `futures-util` | Parse SSE events from provider APIs |
| AI config | `serde` + JSON (Rust) | Matches project config pattern |
| Chat UI | React (TypeScript) | Existing frontend convention |
| Streaming UI | Tauri events (Rust → JS) | Real-time text delta updates |

### Key Architecture Decisions

1. **Trait-based providers** — `AiProvider` trait enables clean separation between Anthropic and OpenAI implementations.
2. **Per-request provider creation** — Providers are created from config on each command call, ensuring settings changes take effect immediately.
3. **reqwest for HTTP** — Well-established async Rust HTTP client with streaming support.
4. **Tauri events for streaming** — Emit `stream-event` from Rust to frontend for real-time text display.
5. **Model catalog as static data** — Built-in model list with provider/model relationships; no remote fetch needed.

### Integration Points

- AI Commands ↔ Config: Read AiConfig from managed state
- AI Commands ↔ Providers: Create provider from config, invoke chat/stream
- Streaming ↔ Frontend: Tauri event emit with StreamEvent payloads
- Bridge ↔ AI Providers: Proxy HTTP requests to Anthropic/OpenAI APIs

---

## Constitution Check

### Principle 1: Cross-Platform First ✅

All AI integration uses cross-platform Rust crates (`reqwest`, `tokio`, `serde`). No platform-specific code. The frontend uses React/TypeScript (cross-platform).

### Principle 2: Feature Parity ✅

Phase 3 implements the AI provider features listed in `docs/FEATURE_SPEC.md` §17 Phase 3: model catalog, chat (streaming + vision), visual guidance tags, bridge proxy. Migration path from OpenClicky's macOS-native provider abstraction.

### Principle 3: No macOS Lock-In ✅

Zero Apple-only frameworks. The HTTP-based provider API calls are platform-agnostic.

### Principle 4: Local-First Architecture ✅

API keys stored in local config file. No cloud key sync, no hosted OAuth.

### Principle 5: External Bridge Compatibility ✅

Bridge endpoints use the same `/v1/messages` and `/v1/responses` paths as OpenClicky's local proxy.

### Principle 6: Spec-Driven Development ✅

This plan is derived from the AI Integration spec (`specs/003-ai-integration/spec.md`).

---

## Gates

| Gate | Condition | Status |
|------|-----------|--------|
| G1 | Spec has no unresolved [NEEDS CLARIFICATION] markers | ✅ PASS |
| G2 | Spec quality checklist passing | ✅ PASS |
| G3 | Constitution check passes | ✅ PASS |
| G4 | Technical Context resolvable | ✅ PASS |
| G5 | Design artifacts complete | ⏳ PENDING |

---

## Phase 0: Research

Research completed in `research.md`. Key findings:
- Anthropic Messages API supports messages, streaming, vision, prompt caching.
- OpenAI Chat Completions API supports messages, streaming, vision, tools.
- Both use SSE for streaming, with slightly different event formats.
- reqwest 0.12 with `stream` feature handles SSE parsing well.

## Phase 1: Design

### Data Model

Defined in `data-model.md`. Key entities:
- `AiConfig` — provider API keys, model selection, system prompt
- `ModelInfo` / `ModelCatalog` — available model metadata
- `ChatMessage` / `ImageInput` — message payloads
- `StreamEvent` — streaming event types
- `GuidanceTag` — visual guidance tag enum

### Contracts

Defined in `contracts/`:
1. **Internal**: Tauri command API for AI operations
2. **External**: Bridge proxy endpoints for AI provider APIs

## Phase 2: Implementation

### Module Structure

```
src-tauri/src/ai/
├── mod.rs        — AiProvider trait, types, factory
├── catalog.rs    — ModelInfo, ModelCatalog
├── anthropic.rs  — AnthropicProvider
├── openai.rs     — OpenAIProvider
├── streaming.rs  — StreamEvent, channel helpers
└── guidance.rs   — GuidanceTag parsing
```

### Integration Steps

1. Add reqwest, async-trait, futures-util to Cargo.toml
2. Create ai/ module with all sub-modules
3. Update config.rs with AiConfig
4. Add AI commands to commands.rs
5. Add AI bridge endpoints to bridge.rs
6. Register module and commands in lib.rs
7. Create frontend ChatTab, ModelSelector, useChat, useVision
8. Update SettingsTab with AI config section
9. Update HomeTab with chat integration
