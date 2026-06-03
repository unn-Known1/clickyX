# Tasks: Bridge API Completion

## Phase 1: Auth & CORS
- [x] T001 [P] Create bridge_auth.rs with constant-time token comparison
- [x] T002 [P] Add actix-cors dependency to Cargo.toml

## Phase 2: Route Implementation
- [x] T003 [P] Wire 15 missing routes in bridge.rs
- [x] T004 Add GET /events SSE endpoint for streaming

## Phase 3: Integration
- [x] T005 [P] CORS middleware applied to all routes
- [x] T006 Wire start_bridge with token in lib.rs setup

## Phase 4: Polish
- [x] T007 Verify all endpoints respond correctly
