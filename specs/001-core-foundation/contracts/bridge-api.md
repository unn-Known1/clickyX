# Bridge API Contract

## Overview

Local HTTP API served on `127.0.0.1:32123`. Only localhost connections
are accepted. All endpoints return JSON responses.

## Base URL

```
http://127.0.0.1:32123
```

## Endpoints

### GET /health

Returns application health status.

**Response 200**:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime_seconds": 1234
}
```

### POST /panel/toggle

Toggles the floating panel visibility.

**Request body**: None

**Response 200**:
```json
{
  "panel_visible": true,
  "panel_pinned": false
}
```

## Error Responses

```json
{
  "error": "not_found",
  "message": "Route not found"
}
```

| Status | Error Code | Description |
|--------|-----------|-------------|
| 404 | `not_found` | Unknown endpoint |
| 405 | `method_not_allowed` | Valid path but wrong method |
| 500 | `internal_error` | Unexpected server error |

## Future Compatibility

- All new endpoints MUST be added under new paths (never modify existing
  endpoint semantics)
- New fields MAY be added to response bodies (consumers MUST ignore
  unknown fields)
- SSE streaming will use `GET /events` (Phase 4)
- Versioned prefix `/v1/` is reserved for future breaking changes
