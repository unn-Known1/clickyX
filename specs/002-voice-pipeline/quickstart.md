# Quickstart: Voice Pipeline

## Prerequisites

- Linux: `libasound2-dev` (for cpal ALSA backend):
  ```sh
  sudo apt install libasound2-dev
  ```

## Dependencies Added

```toml
cpal = "0.15"
hound = "3.5"
reqwest = { version = "0.12", features = ["json", "stream"] }
base64 = "0.22"
uuid = { version = "1", features = ["v4"] }
```

## Voice Settings

Access in the Settings tab → **Voice** section.

### Configuration

| Setting | Default | Options |
|---------|---------|---------|
| STT Provider | `deepgram` | deepgram, whisper, assemblyai |
| TTS Provider | `elevenlabs` | elevenlabs, cartesia, edge, aura, openai_realtime |
| Activation Mode | `ptt` | ptt, toggle, always |
| Auto-submit | `true` | true, false |
| Sample Rate | `16000` Hz | 8000, 16000, 44100 |
| Buffer Size | `1024` | 512, 1024, 2048, 4096 |
| Volume | `1.0` | 0.0–1.0 |
| PTT Hotkey | `Ctrl+Shift+V` | any valid key combo |

### API Keys

Add provider API keys in the main Settings → API Keys section:
- Provider name for STT: `deepgram`, `openai`, `assemblyai`
- Provider name for TTS: `elevenlabs`, `cartesia`, `deepgram`

## Testing

```sh
# Rust compilation
cargo check

# Frontend build
npm run build

# Full Tauri build
cargo tauri build --debug
```

## Bridge API

```sh
# Test TTS
curl -X POST http://localhost:32123/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","provider":"elevenlabs"}' \
  --output speech.wav

# Test transcription (WAV file required)
curl -X POST http://localhost:32123/transcribe \
  -H "Content-Type: audio/wav" \
  --data-binary @recording.wav

# Check audio level
curl http://localhost:32123/audio/level
```
