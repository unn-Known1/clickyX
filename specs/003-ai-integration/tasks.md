# Tasks: AI Integration

## Spec & Documentation
- [x] Create spec directory `specs/003-ai-integration/`
- [x] Write `spec.md` — feature specification
- [x] Write `plan.md` — implementation plan
- [x] Write `research.md` — API research
- [x] Write `data-model.md` — data models
- [x] Write `contracts/tauri-commands.md`
- [x] Write `contracts/bridge-api.md`
- [x] Write `tasks.md` — task list
- [x] Write `quickstart.md` — setup guide

## Rust AI Module
- [ ] Create `src-tauri/src/ai/mod.rs` — AiProvider trait, types, factory
- [ ] Create `src-tauri/src/ai/catalog.rs` — ModelInfo, ModelCatalog
- [ ] Create `src-tauri/src/ai/anthropic.rs` — AnthropicProvider
- [ ] Create `src-tauri/src/ai/openai.rs` — OpenAIProvider
- [ ] Create `src-tauri/src/ai/streaming.rs` — StreamEvent, channels
- [ ] Create `src-tauri/src/ai/guidance.rs` — GuidanceTag parsing
- [ ] Update `Cargo.toml` — add reqwest, async-trait, futures-util

## Config & Commands
- [ ] Update `config.rs` — add AiConfig to AppConfig
- [ ] Update `commands.rs` — add AI Tauri commands
- [ ] Update `bridge.rs` — add AI proxy endpoints
- [ ] Update `lib.rs` — register ai module and commands

## Frontend
- [ ] Create `src/components/ChatTab.tsx`
- [ ] Create `src/components/ModelSelector.tsx`
- [ ] Create `src/hooks/useChat.ts`
- [ ] Create `src/hooks/useVision.ts`
- [ ] Update `src/components/SettingsTab.tsx` — add AI settings
- [ ] Update `src/components/HomeTab.tsx` — wire up chat
- [ ] Update `src/styles/theme.css` — add chat styles

## Verification
- [ ] `cargo check` passes
- [ ] `npm run build` passes
