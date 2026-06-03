# Feature Specification: Bridge API Completion

## Overview

Wire all orphaned HTTP handler functions in the bridge server into the Actix routing table, add token-based authentication middleware with constant-time comparison, and implement CORS preflight support. The bridge at `src-tauri/src/bridge.rs` exposes a `localhost:32123` HTTP API used by external scripts, automation tools, and the OpenClicky compatibility layer. Currently 12 handler functions exist but are not connected to any route, and the entire bridge is open to any localhost caller without authentication or CORS handling.

## Users & Stakeholders

- **End users** — interact indirectly via scripts, Raycast extensions, Alfred workflows, or home automation that sends commands to ClickyX
- **Agent runtime (Codex)** — the agent sandbox calls bridge endpoints to emit overlay guidance (`/cursor`, `/scribble`, `/caption`) and query state
- **OpenClicky migration** — external macOS automation that sends HTTP requests to the same port must work without modification
- **Developers** — debugging and extending the bridge; all handler stubs are written but invisible to callers
- **Security-conscious users** — must be able to protect the bridge with a token even though it only listens on loopback

## User Stories

- **P1**: As an external script or agent, I want to call `POST /screenshot` and receive a screen capture response, so that the agent can see what is on screen.
- **P1**: As an automation tool, I want to call `POST /click` with coordinates and have ClickyX perform a mouse click, so that headless automation is possible.
- **P1**: As an agent, I want to call `POST /cursor` / `POST /cursors` to place visual markers on the overlay, so that users see guidance indicators during agent runs.
- **P1**: As an agent, I want to call `POST /scribble`, `POST /rectangle`, and `POST /caption` to draw annotations on the overlay, so that spatial reasoning results are visible to the user.
- **P1**: As an agent, I want to call `POST /clear` to remove all overlay annotations, so that the screen is reset between agent steps.
- **P1**: As an agent, I want to call `POST /speak` with text and hear TTS output, so that voice feedback is delivered.
- **P1**: As an agent or automation, I want to call `POST /notify` to show a notification or bring the panel to focus, so that the user is alerted.
- **P1**: As an agent, I want to connect to `GET /events` (SSE) to receive real-time state change events, so that the agent can react to panel visibility, capture completion, and guidance state changes.
- **P2**: As an agent, I want to call `GET /mcp/tools` and `POST /mcp/call` to enumerate and invoke MCP tools, so that ClickyX can interact with MCP servers.
- **P2**: As a power user, I want to configure an `x-openclicky-token` in settings and have all bridge endpoints reject requests without a matching token, so that other processes on localhost cannot abuse the bridge.
- **P3**: As a web-app developer integrating with ClickyX, I want `OPTIONS` preflight requests to return correct CORS headers, so that browser-based callers can reach the bridge.

## Functional Requirements

### FR1: Route Wiring — Screenshot & Click

Wire `screenshot` and `click` handlers into the routing table.

- FR1.1 `POST /screenshot` MUST invoke the `screenshot` async handler and return `200` with JSON body `{"images": [...]}` on success, or `500` with `{"error": "capture_error", "message": "..."}` on failure.
- FR1.2 `POST /click` MUST invoke the `click` (or `click_handler`) async handler and return `200` with `{"ok": true}`. The implementation must trigger a mouse click at `(x, y)` as reported by the body.

### FR2: Route Wiring — Overlay Guidance

Wire the five overlay-drawing handlers into the routing table.

- FR2.1 `POST /cursor` MUST invoke `show_cursor` with a `CursorRequest` body (`{x, y, label?, accent?}`) and return `200` with `{"ok": true}` or `500` on overlay error.
- FR2.2 `POST /cursors` MUST invoke `show_cursors` with a `CursorsRequest` body (`{cursors: [{x, y, label?, accent?}]}`) and return `200` with `{"ok": true}` or `500` on overlay error.
- FR2.3 `POST /rectangle` MUST invoke `show_rectangle` with a `RectRequest` body (`{x, y, w, h, label?}`) and return `200` with `{"ok": true}` or `500` on overlay error.
- FR2.4 `POST /scribble` MUST invoke `show_scribble` with a `ScribbleRequest` body (`{points: [[x,y],...], label?}`) and return `200` with `{"ok": true}` or `500` on overlay error.
- FR2.5 `POST /caption` MUST invoke `show_caption` with a `CaptionRequest` body (`{text, x, y}`) and return `200` with `{"ok": true}` or `500` on overlay error.
- FR2.6 `POST /clear` MUST invoke `clear_overlays` and return `200` with `{"ok": true}` or `500` on overlay error.

### FR3: Route Wiring — Voice & Notifications

Wire the TTS and notification handlers.

- FR3.1 `POST /speak` MUST invoke `speak` with a `SpeakRequest` body (`{text, provider?}`) and return `200` with `audio/wav` content on success, `400` on provider error, or `500` if the pipeline is unavailable.
- FR3.2 `POST /notify` MUST invoke `notify` with a `NotifyRequest` body (`{title, body}`). The handler MUST focus the main window and log the notification. Returns `200` with `{"ok": true}`.

### FR4: Route Wiring — Events SSE

Wire the Server-Sent Events stream.

- FR4.1 `GET /events` MUST invoke the `events` handler, which subscribes to `BridgeState.event_tx` via a `BroadcastStream` and returns a streaming response with `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
- FR4.2 The SSE stream MUST emit events in the format `event: <type>\ndata: <json>\n\n`.
- FR4.3 The SSE connection MUST be long-lived; the handler must keep the response open and push events as they arrive on the broadcast channel.

### FR5: Route Wiring — MCP Endpoints

Wire the Model Context Protocol discovery and invocation endpoints.

- FR5.1 `GET /mcp/tools` MUST invoke `mcp_tools` and return `200` with `{"tools": [{"server", "name", "description"}]}`. Initial implementation returns a placeholder tool.
- FR5.2 `POST /mcp/call` MUST invoke `mcp_call` with an `McpCallRequest` body (`{server, tool, args}`) and return `200` with `{"result": "..."}`. Initial implementation returns a placeholder response.

### FR6: Authentication Middleware

Add token-based authentication to all bridge endpoints except `/health`.

- FR6.1 The bridge MUST accept authentication via one of two methods:
  - `x-openclicky-token` HTTP header with the configured token value.
  - `Authorization: Bearer <token>` HTTP header.
- FR6.2 Token comparison MUST use constant-time comparison (`subtle::ConstantTimeEq` or equivalent) to prevent timing side-channel attacks.
- FR6.3 The expected token MUST be loaded from the application configuration (`config.api_keys` or a dedicated `bridge_token` field) on bridge startup. If no token is configured, authentication MUST be disabled (open bridge).
- FR6.4 Requests with an invalid token (when authentication is enabled) MUST receive `401 Unauthorized` with `{"error": "unauthorized", "message": "Invalid or missing authentication token"}`.
- FR6.5 The `/health` endpoint MUST be excluded from authentication to allow load balancers and monitoring tools to check liveness without a token.
- FR6.6 The `GET /events` SSE endpoint MUST pass authentication before the stream begins streaming events (auth-on-connect).

### FR7: CORS Preflight Handler

Add CORS support so browser-based clients can call the bridge.

- FR7.1 The bridge MUST respond to `OPTIONS *` (or per-route `OPTIONS`) with appropriate CORS headers.
- FR7.2 Response headers MUST include:
  - `Access-Control-Allow-Origin: *` (or the request's `Origin` when the bridge is running on loopback and security is localhost-only).
  - `Access-Control-Allow-Methods: GET, POST, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type, Authorization, x-openclicky-token`
  - `Access-Control-Max-Age: 86400`
- FR7.3 `OPTIONS` requests MUST return `204 No Content` with no body.
- FR7.4 All non-OPTIONS responses MUST include `Access-Control-Allow-Origin: *` (handled by middleware or per-response header).

### FR8: Middleware Architecture

Structure the auth and CORS logic as composable Actix middleware.

- FR8.1 Authentication middleware MUST be implemented as an Actix `middleware::from_fn` wrapper or a custom `Transform`/`Service` that inspects the request headers before the handler runs.
- FR8.2 CORS headers MUST be applied via `actix_cors::Cors` or a manual `middleware::from_fn` that wraps every response. If `actix-cors` is not in `Cargo.toml`, the spec permits adding it as a dependency.
- FR8.3 Middleware order MUST be: Logger → CORS → Authentication → Handler.

## Success Criteria

1. All 12 orphaned handlers are wired and respond to HTTP requests on the documented paths — verified by a test script that hits every new endpoint and asserts the expected status code and JSON shape.
2. With a token configured, any request missing the `x-openclicky-token` or `Bearer` header receives `401` — verified by curl against each endpoint.
3. With no token configured, all endpoints are accessible without any auth header — verified by curl against each endpoint.
4. Constant-time comparison is verified to use `subtle::ConstantTimeEq` (or equivalent) rather than `==` on the token strings — verified by code review.
5. `OPTIONS /screenshot` (or any path) returns `204` with all required CORS headers — verified by curl with `-X OPTIONS -v`.
6. SSE stream at `GET /events` delivers events within 100ms of a state change — verified by a test subscriber.
7. No existing routes (`/health`, `/panel/toggle`, `/v1/messages`, `/v1/responses`, `/models`, `/agents`, `/agent/*`, `/skills`) are broken — verified by full regression test.

## Dependencies & Assumptions

- `actix-cors` is not yet in `Cargo.toml`; the implementation must either add it or implement CORS headers manually via a custom middleware.
- `subtle` crate (or a manual `ConstantTimeEq` implementation) is required for constant-time token comparison. The implementation MAY use `subtle` if available or a hand-rolled comparison loop.
- The config struct (`config.rs`) does not currently have a `bridge_token` field. It MUST be added under a new `bridge` subsection or as a top-level `api_keys` entry. The FEATURE_SPEC.md should be updated accordingly.
- The `BridgeState` struct does not currently hold the token; a `api_token: Option<String>` field MUST be added to `BridgeState` and populated at bridge startup from config.
- All 12 target handlers already compile and work in isolation; this spec only covers routing, auth, and CORS — not handler logic changes.
- The SSE events endpoint (`GET /events`) uses `tokio::sync::broadcast` and requires `tokio_stream` — both are already in the dependency tree.
- The bridge only listens on `127.0.0.1:32123`; CORS is a safety net for browser-based tooling, not a security boundary.
