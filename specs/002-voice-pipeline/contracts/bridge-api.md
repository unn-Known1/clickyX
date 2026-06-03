# Bridge API: Voice Pipeline

All endpoints are served on `http://localhost:32123`.

## `POST /speak`

Synthesize text to speech and return audio.

**Request body**:
```json
{
  "text": "Hello, how can I help you?",
  "provider": "elevenlabs"
}
```
- `text` (required): String of text to speak.
- `provider` (optional): TTS provider name. Defaults to config value.

**Response** `200 OK`:
```
Content-Type: audio/wav
<binary WAV data>
```

**Response** `4xx/5xx`:
```json
{
  "error": "provider_error",
  "message": "No API key configured for elevenlabs"
}
```

## `POST /transcribe`

Transcribe audio data to text.

**Request body**: Raw audio bytes (`Content-Type: audio/wav`) or JSON:
```json
{
  "audio_base64": "<base64-encoded WAV>",
  "provider": "deepgram"
}
```

**Response** `200 OK`:
```json
{
  "transcript": "Hello world",
  "confidence": 0.95,
  "provider": "deepgram"
}
```

**Response** `4xx/5xx`:
```json
{
  "error": "transcription_failed",
  "message": "Provider returned error"
}
```

## `GET /audio/level`

Get current VU meter level.

**Response** `200 OK`:
```json
{
  "rms": 0.45,
  "peak": 0.82,
  "clipping": false
}
```

**Response** `200 OK` (when not recording):
```json
{
  "rms": 0.0,
  "peak": 0.0,
  "clipping": false
}
```
