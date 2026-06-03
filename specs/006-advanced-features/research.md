# Research: Advanced Features

## Wake Word Detection

### Options
| Library | Size | On-device | License |
|---------|------|-----------|---------|
| Porcupine | ~2MB | Yes | Apache 2.0 (non-commercial limits) |
| Vosk | ~50MB | Yes | Apache 2.0 |
| Snowboy | ~2MB | Yes | Apache 2.0 (unmaintained) |
| Custom energy detection | ~0 | Yes | MIT |

**Decision**: Energy-based stub. Full on-device ML is deferred.

### Activation Modes
1. Push-to-talk (PTT) — user presses hotkey
2. Toggle — user presses hotkey to toggle listening
3. Always listening — microphone always active, wake word triggers capture

## Google Workspace via gogcli

### gogcli
- CLI tool for Google Workspace APIs
- Handles OAuth flow externally
- Commands: `gogcli gmail list`, `gogcli calendar list`, etc.
- Output: JSON

### Available APIs
| API | Scope | Read | Write |
|-----|-------|------|-------|
| Gmail | https://www.googleapis.com/auth/gmail.readonly | Yes | No (read-only) |
| Gmail send | https://www.googleapis.com/auth/gmail.send | Yes | Yes |
| Calendar | https://www.googleapis.com/auth/calendar.readonly | Yes | No |
| Calendar events | https://www.googleapis.com/auth/calendar.events | Yes | Yes |
| Drive | https://www.googleapis.com/auth/drive.readonly | Yes | No |
| Drive file | https://www.googleapis.com/auth/drive.file | Yes | Yes |
| Docs | https://www.googleapis.com/auth/documents | Yes | Yes |
| Sheets | https://www.googleapis.com/auth/spreadsheets | Yes | Yes |
| Slides | https://www.googleapis.com/auth/presentations | Yes | Yes |

## SSE (Server-Sent Events)

- Standard: W3C Recommendation
- Format: `event: <type>\ndata: <json>\n\n`
- actix-web: `HttpResponse::Ok().streaming(stream)`
- Broadcast channel: `tokio::sync::broadcast::channel(256)`

## Tripo3D API

- Endpoint: `https://api.tripo3d.ai/v2/openapi/text_to_model`
- Method: POST
- Polling: GET status endpoint
- Output: GLB file
- Rate limit: Check API docs
- Timeout: 300s

