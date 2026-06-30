#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TtsProvider {
    ElevenLabs,
    Cartesia,
    MicrosoftEdge,
    DeepgramAura,
    OpenAIRealtime,
    System,
}

impl TtsProvider {
    pub fn from_name(name: &str) -> Option<Self> {
        match name.to_lowercase().as_str() {
            "elevenlabs" => Some(Self::ElevenLabs),
            "cartesia" => Some(Self::Cartesia),
            "edge" | "microsoftedge" => Some(Self::MicrosoftEdge),
            "aura" | "deepgramaura" => Some(Self::DeepgramAura),
            "openai_realtime" | "realtime" => Some(Self::OpenAIRealtime),
            "system" => Some(Self::System),
            _ => None,
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            Self::ElevenLabs => "elevenlabs",
            Self::Cartesia => "cartesia",
            Self::MicrosoftEdge => "edge",
            Self::DeepgramAura => "aura",
            Self::OpenAIRealtime => "openai_realtime",
            Self::System => "system",
        }
    }

    pub fn requires_api_key(&self) -> bool {
        !matches!(self, Self::MicrosoftEdge | Self::System)
    }
}

#[derive(Debug, Clone)]
pub struct TtsConfig {
    pub provider: TtsProvider,
    pub api_key: String,
    pub voice_id: String,
    pub timeout_secs: u64,
}

impl Default for TtsConfig {
    fn default() -> Self {
        Self {
            provider: TtsProvider::ElevenLabs,
            api_key: String::new(),
            voice_id: "21m00Tcm4TlvDq8ikWAM".into(),
            timeout_secs: 30,
        }
    }
}

pub async fn speak(text: &str, config: &TtsConfig) -> Result<Vec<u8>, String> {
    // NOTE (B-004/B-015): Audio ducking is managed in pipeline.rs::speak_response().
    // pipeline.rs calls set_ducking(true) before invoking this function and
    // set_ducking(false) after it returns. This file is stateless TTS-only.
    if config.provider.requires_api_key() && config.api_key.is_empty() {
        return Err(format!(
            "No API key for provider {}",
            config.provider.name()
        ));
    }

    match config.provider {
        TtsProvider::ElevenLabs => speak_elevenlabs(text, config).await,
        TtsProvider::Cartesia => speak_cartesia(text, config).await,
        TtsProvider::MicrosoftEdge => speak_edge(text, config).await,
        TtsProvider::DeepgramAura => speak_deepgram_aura(text, config).await,
        TtsProvider::System => speak_system(text).await,
        TtsProvider::OpenAIRealtime => {
            Err("OpenAI Realtime TTS requires WebSocket (deferred to Phase 5)".into())
        }
    }
}

async fn speak_elevenlabs(text: &str, config: &TtsConfig) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://api.elevenlabs.io/v1/text-to-speech/{}",
        config.voice_id
    );

    let body = serde_json::json!({
        "text": text,
        "model_id": "eleven_monolingual_v1",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.5
        }
    });

    let resp = client
        .post(&url)
        .header("xi-api-key", config.api_key.clone())
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(config.timeout_secs))
        .send()
        .await
        .map_err(|e| format!("ElevenLabs request error: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!("ElevenLabs HTTP {}: {}", status, body_text));
    }

    let audio_bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("ElevenLabs read error: {e}"))?
        .to_vec();

    Ok(audio_bytes)
}

async fn speak_cartesia(text: &str, config: &TtsConfig) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "text": text,
        "voice_id": config.voice_id,
        "model_id": "sonic-1"
    });

    let resp = client
        .post("https://api.cartesia.ai/v1/tts")
        .header("X-API-Key", config.api_key.clone())
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(config.timeout_secs))
        .send()
        .await
        .map_err(|e| format!("Cartesia request error: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!("Cartesia HTTP {}: {}", status, body_text));
    }

    let audio_bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Cartesia read error: {e}"))?
        .to_vec();

    Ok(audio_bytes)
}

async fn speak_edge(_text: &str, _config: &TtsConfig) -> Result<Vec<u8>, String> {
    log::warn!("Microsoft Edge TTS not yet implemented (free tier, requires WS token negotiation)");
    Err("Microsoft Edge TTS implementation pending (use another provider)".into())
}

async fn speak_deepgram_aura(text: &str, config: &TtsConfig) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "text": text,
    });

    let resp = client
        .post("https://api.deepgram.com/v1/speak")
        .header("Authorization", format!("Token {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(config.timeout_secs))
        .send()
        .await
        .map_err(|e| format!("Deepgram Aura request error: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!("Deepgram Aura HTTP {}: {}", status, body_text));
    }

    let audio_bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Deepgram Aura read error: {e}"))?
        .to_vec();

    Ok(audio_bytes)
}

async fn speak_system(text: &str) -> Result<Vec<u8>, String> {
    // NOTE: System TTS (via `tts` crate) speaks directly through OS audio devices.
    // It does not return WAV bytes — audio plays through the speakers immediately.
    // For the bridge `/speak` endpoint, callers must handle empty bytes.
    // The Tauri command path works correctly since audio plays locally.
    let text = text.to_string();
    tokio::task::spawn_blocking(move || {
        let mut tts = tts::Tts::default()
            .map_err(|e| format!("Failed to initialize System TTS: {e}"))?;
        
        tts.speak(&text, true)
            .map_err(|e| format!("System TTS speech error: {e}"))?;
            
        while tts.is_speaking().unwrap_or(false) {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        // Return empty bytes — system TTS plays audio directly via OS
        Ok::<Vec<u8>, String>(vec![])
    })
    .await
    .map_err(|e| format!("Thread join error: {e}"))?
}
