# Feature Specification: Annotation Lifecycle Management

## Overview
Implement a lifecycle management system for cursor overlay annotations that tracks each annotation through states: armed → completed → missed (with configurable timeout). This mirrors the macOS original's behavior where visual guidance elements auto-expire and report their status.

## Users & Stakeholders
- **End users**: See accurate visual guidance that correctly times out and cleans up
- **Agents (Codex)**: Get lifecycle event feedback through the bridge API
- **Developers**: Maintainable overlay state machine

## User Stories
- **P1**: As a user, I want overlay annotations to auto-clear after a timeout so the screen doesn't get cluttered with stale guidance
- **P1**: As an agent, I want lifecycle events (armed/completed/missed) so I know when my visual guidance was seen or expired
- **P2**: As a developer, I want configurable timeout durations per annotation type so different guidance types have appropriate lifetimes

## Functional Requirements
1. Each annotation (cursor, rect, scribble, caption) has a lifecycle state: `Armed` → `Completed` | `Missed`
2. Configurable timeout per annotation type (default: POINT=5s, RECT=8s, SCRIBBLE=10s, CAPTION=3s)
3. When a new annotation of the same type is created, the previous one is force-completed
4. Lifecycle events are emitted via the bridge SSE stream to connected clients (`GET /events`)
5. Bulk lifecycle clear (`POST /clear`) immediately transitions all armed annotations to `missed`
6. UI overlay renders visual state changes (completed items fade out smoothly, missed items flash red briefly)

## Success Criteria
- Annotations auto-expire within configured timeout ±500ms
- SSE events fire with correct state transition data
- Overlay visual feedback matches lifecycle state
- Concurrent annotations of different types are tracked independently

## Dependencies & Assumptions
- Assumes `src/overlay/OverlayApp.tsx` can accept lifecycle state as props
- Assumes SSE event stream (`GET /events`) will be wired per Feature Group 001
- Out of scope: persistent annotation history (in-memory only)
