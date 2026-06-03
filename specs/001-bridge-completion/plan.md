# Implementation Plan: Bridge API Completion

## Technical Context
- Stack: Rust + actix-web + SSE
- Libraries: actix-web 4, actix-cors, subtle (constant-time)
- Integration points: bridge.rs, bridge_auth.rs, lib.rs

## Constitution Check
- [x] Cross-Platform First — actix-web is platform-agnostic
- [x] Feature Parity — matches OpenClicky bridge spec
- [x] No macOS Lock-In — no Apple frameworks
- [x] Local-First Architecture — localhost:32123

## Implementation Phases

### Phase 0: Research
- Map all OpenClicky bridge endpoints from FEATURE_SPEC §8
- Determine auth model (token-based shared secret)

### Phase 1: Core Implementation
- Add missing routes to bridge.rs (15 total)
- Create bridge_auth.rs with constant-time token comparison
- Add CORS middleware

### Phase 2: Integration
- Wire start_bridge in lib.rs setup
- Add bridge_token config field

## Architecture Decisions
- Token auth over no auth — matches OpenClicky security model
- actix-cors permissive — localhost-only, no CSRF risk
