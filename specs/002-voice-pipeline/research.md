# Technical Research: Voice Pipeline

## crate: cpal 0.15

**Purpose**: Cross-platform audio capture.

**Available backends**:
- Windows: WASAPI
- macOS: CoreAudio
- Linux: ALSA (default), PulseAudio, JACK

**API shape**:
```rust
let host = cpal::default_host();
let device = host.default_input_device()?;
let config = device.default_input_config()?;
let stream = device.build_input_stream(
    &config.into(),
    move |data: &[f32], _: &InputCallbackInfo| { /* push to ring buffer */ },
    move |err| { log::error!("cpal error: {}", err); },
    None, // timeout
)?;
stream.play()?;
```

**Key considerations**:
- `build_input_stream` requires `&Device`, `&StreamConfig`, data callback,
  error callback, and optional `&Streamer` for pause/resume.
- `Stream::pause()` and `Stream::play()` available for start/stop without
  dropping the stream.
- Default input device may be `None` if no mic is connected.

**Alternatives considered**: None for cross-platform. `audrey` is
read-only. `rodio` is playback-focused. cpal is the standard.

---

## crate: hound 3.5

**Purpose**: WAV file encoding for STT provider compatibility.

**Usage**: Write PCM f32 samples as WAV for APIs that expect WAV input.

```rust
let spec = hound::WavSpec {
    channels: 1,
    sample_rate: 16000,
    bits_per_sample: 16,
    sample_format: hound::SampleFormat::Int,
};
let mut writer = hound::WavWriter::new(buf, spec)?;
for &sample in &pcm_data {
    writer.write_sample((sample * i16::MAX as f32) as i16)?;
}
```

**Key considerations**:
- Most STT APIs accept WAV with PCM i16 samples at 16kHz mono.
- hound supports writing in-memory via `std::io::Cursor`.

---

## STT Provider APIs

### Deepgram (`nova-2` model)
- **Endpoint**: `POST https://api.deepgram.com/v1/listen`
- **Headers**: `Authorization: Token <key>`
- **Query params**: `model=nova-2&smart_format=true&language=en`
- **Body**: Raw WAV bytes (Content-Type: audio/wav)
- **Response**: `{ "results": { "channels": [{ "alternatives": [{ "transcript": "..." }] }] } }`
- **Latency**: ~200-500ms for short utterances
- **Pricing**: $0.0043/min (nova-2)

### OpenAI Whisper
- **Endpoint**: `POST https://api.openai.com/v1/audio/transcriptions`
- **Headers**: `Authorization: Bearer <key>`
- **Body**: multipart/form-data with `file` (WAV) and `model` (whisper-1)
- **Response**: `{ "text": "..." }`
- **Latency**: ~500-2000ms
- **Pricing**: $0.006/min

### AssemblyAI
- **Endpoint**: `POST https://api.assemblyai.com/v2/transcript`
- **Headers**: `authorization: <key>`
- **Body**: `{ "audio_url": "...", "language_code": "en_us" }` or upload first
- **Simpler approach**: POST audio binary directly to `https://api.assemblyai.com/v2/upload`, then submit transcript.
- **Response**: `{ "id": "...", "status": "queued" }` then poll for result.
- **Latency**: ~500-3000ms
- **Pricing**: $0.015/min (real-time)

---

## TTS Provider APIs

### ElevenLabs
- **Endpoint**: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`
- **Headers**: `xi-api-key: <key>`
- **Body**: `{ "text": "...", "model_id": "eleven_monolingual_v1", "voice_settings": { "stability": 0.5, "similarity_boost": 0.5 } }`
- **Response**: audio/mpeg binary stream
- **Cost**: Free tier 10k chars/mo

### Cartesia
- **Endpoint**: `POST https://api.cartesia.ai/v1/tts`
- **Headers**: `X-API-Key: <key>`
- **Response**: audio data

### Microsoft Edge TTS (free)
- **Endpoint**: Uses Edge browser internal Speech API
- **Method**: Retrieve token from `wss://speech.platform.bing.com/` then use
  HTTP endpoint. No API key required.
- **Complexity**: Requires SSML + token negotiation. For MVP, return
  placeholder and log warning.

### Deepgram Aura
- **Endpoint**: `POST https://api.deepgram.com/v1/speak`
- **Headers**: `Authorization: Token <key>`
- **Body**: `{ "text": "...", "voice": "aura-asteria-en" }`
- **Response**: audio data

### OpenAI Realtime
- **Endpoint**: WebSocket to `wss://api.openai.com/v1/realtime`
- **Status**: Requires WebSocket implementation. Deferred to Phase 5.
- **Current**: Accept config but return unimplemented error.
