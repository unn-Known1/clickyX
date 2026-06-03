# Data Model: Voice Pipeline

## AudioConfig

Stored in `AppConfig.audio`. Defines all voice pipeline settings.

```rust
pub struct AudioConfig {
    /// PTT hotkey string (e.g. "Ctrl+Shift+V").
    pub ptt_hotkey: String,
    /// Active STT provider name: "deepgram", "whisper", "assemblyai".
    pub stt_provider: String,
    /// Active TTS provider name: "elevenlabs", "cartesia", "edge", "aura", "openai_realtime".
    pub tts_provider: String,
    /// Activation mode: "ptt", "toggle", "always".
    pub activation_mode: String,
    /// Auto-submit transcription to active agent on release.
    pub auto_submit: bool,
    /// Audio capture sample rate in Hz (default: 16000).
    pub sample_rate: u32,
    /// Buffer size in frames (default: 1024).
    pub buffer_size: u32,
    /// Output volume 0.0–1.0 (default: 1.0).
    pub volume: f32,
}
```

## SttProvider

Enumeration of supported STT backends.

```rust
pub enum SttProvider {
    Deepgram,
    OpenAIWhisper,
    AssemblyAI,
}
```

## SttConfig

Configuration for STT requests.

```rust
pub struct SttConfig {
    pub provider: SttProvider,
    pub api_key: String,
    pub language: String,
    pub timeout_secs: u64,
    pub max_retries: u32,
}
```

## TtsProvider

Enumeration of supported TTS backends.

```rust
pub enum TtsProvider {
    ElevenLabs,
    Cartesia,
    MicrosoftEdge,
    DeepgramAura,
    OpenAIRealtime,
}
```

## TtsConfig

Configuration for TTS requests.

```rust
pub struct TtsConfig {
    pub provider: TtsProvider,
    pub api_key: String,
    pub voice_id: String,
    pub timeout_secs: u64,
}
```

## VoicePipelineState

State machine for the voice pipeline.

```rust
pub enum VoicePipelineState {
    Idle,
    Listening,
    Processing,
    Speaking,
}
```

## AudioLevel

VU meter data returned to frontend.

```rust
pub struct AudioLevel {
    pub rms: f32,        // 0.0–1.0 RMS power
    pub peak: f32,       // 0.0–1.0 peak level
    pub clipping: bool,  // true if any sample saturated
}
```

## PipelineEvent

Events emitted by the pipeline for UI updates.

```rust
pub enum PipelineEvent {
    RecordingStarted,
    RecordingStopped,
    TranscriptionComplete(String),
    TranscriptionError(String),
    SpeechStarted,
    SpeechComplete,
    SpeechError(String),
    AudioLevel(AudioLevel),
}
```

## RingBuffer

In-memory circular buffer for PCM samples.

```rust
pub struct RingBuffer {
    data: Vec<f32>,
    capacity: usize,
    write_pos: usize,
}
```
