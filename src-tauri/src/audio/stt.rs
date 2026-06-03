use base64::Engine;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SttProvider {
    Deepgram,
    OpenAIWhisper,
    AssemblyAI,
}

impl SttProvider {
    pub fn from_name(name: &str) -> Option<Self> {
        match name.to_lowercase().as_str() {
            "deepgram" => Some(Self::Deepgram),
            "whisper" | "openai" => Some(Self::OpenAIWhisper),
            "assemblyai" => Some(Self::AssemblyAI),
            _ => None,
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            Self::Deepgram => "deepgram",
            Self::OpenAIWhisper => "openai",
            Self::AssemblyAI => "assemblyai",
        }
    }
}

#[derive(Debug, Clone)]
pub struct SttConfig {
    pub provider: SttProvider,
    pub api_key: String,
    pub language: String,
    pub timeout_secs: u64,
    pub max_retries: u32,
}

impl Default for SttConfig {
    fn default() -> Self {
        Self {
            provider: SttProvider::Deepgram,
            api_key: String::new(),
            language: "en".into(),
            timeout_secs: 30,
            max_retries: 3,
        }
    }
}

fn pcm_to_wav(pcm_data: &[f32], sample_rate: u32) -> Result<Vec<u8>, String> {
    let mut cursor = std::io::Cursor::new(Vec::new());
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer =
        hound::WavWriter::new(&mut cursor, spec).map_err(|e| format!("WAV writer error: {e}"))?;
    for &sample in pcm_data {
        let clamped = sample.clamp(-1.0, 1.0);
        let sample_i16 = (clamped * i16::MAX as f32) as i16;
        writer
            .write_sample(sample_i16)
            .map_err(|e| format!("WAV write error: {e}"))?;
    }
    writer
        .finalize()
        .map_err(|e| format!("WAV finalize error: {e}"))?;
    Ok(cursor.into_inner())
}

pub async fn transcribe(
    audio_data: &[f32],
    config: &SttConfig,
    sample_rate: u32,
) -> Result<String, String> {
    if config.api_key.is_empty() {
        return Err(format!("No API key for provider {}", config.provider.name()));
    }

    let wav_bytes = pcm_to_wav(audio_data, sample_rate)?;

    match config.provider {
        SttProvider::Deepgram => transcribe_deepgram(&wav_bytes, config).await,
        SttProvider::OpenAIWhisper => transcribe_whisper(&wav_bytes, config).await,
        SttProvider::AssemblyAI => transcribe_assemblyai(&wav_bytes, config).await,
    }
}

async fn transcribe_deepgram(wav_data: &[u8], config: &SttConfig) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language={}",
        config.language
    );

    let mut last_error = String::new();
    for attempt in 0..config.max_retries {
        let result = client
            .post(&url)
            .header("Authorization", format!("Token {}", config.api_key))
            .header("Content-Type", "audio/wav")
            .body(wav_data.to_vec())
            .timeout(std::time::Duration::from_secs(config.timeout_secs))
            .send()
            .await;

        match result {
            Ok(resp) => {
                if !resp.status().is_success() {
                    let status = resp.status();
                    let body = resp.text().await.unwrap_or_default();
                    last_error = format!("Deepgram HTTP {}: {}", status, body);
                    if attempt + 1 < config.max_retries {
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    }
                    continue;
                }
                let json: serde_json::Value = resp
                    .json()
                    .await
                    .map_err(|e| format!("Deepgram parse error: {e}"))?;
                let transcript = json["results"]["channels"][0]["alternatives"][0]["transcript"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();
                return Ok(transcript);
            }
            Err(e) => {
                last_error = format!("Deepgram request error: {e}");
                if attempt + 1 < config.max_retries {
                    tokio::time::sleep(std::time::Duration::from_millis(500 * (attempt + 1) as u64))
                        .await;
                }
            }
        }
    }
    Err(last_error)
}

async fn transcribe_whisper(wav_data: &[u8], config: &SttConfig) -> Result<String, String> {
    let client = reqwest::Client::new();

    let b64 = base64::engine::general_purpose::STANDARD.encode(wav_data);

    let part = reqwest::multipart::Part::text(b64)
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| format!("Multipart error: {e}"))?;

    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", "whisper-1")
        .text("language", config.language.clone());

    let mut last_error = String::new();
    for attempt in 0..config.max_retries {
        let result = client
            .post("https://api.openai.com/v1/audio/transcriptions")
            .header("Authorization", format!("Bearer {}", config.api_key))
            .multipart(form.clone())
            .timeout(std::time::Duration::from_secs(config.timeout_secs))
            .send()
            .await;

        match result {
            Ok(resp) => {
                if !resp.status().is_success() {
                    let status = resp.status();
                    let body = resp.text().await.unwrap_or_default();
                    last_error = format!("Whisper HTTP {}: {}", status, body);
                    if attempt + 1 < config.max_retries {
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    }
                    continue;
                }
                let json: serde_json::Value = resp
                    .json()
                    .await
                    .map_err(|e| format!("Whisper parse error: {e}"))?;
                let transcript = json["text"].as_str().unwrap_or("").to_string();
                return Ok(transcript);
            }
            Err(e) => {
                last_error = format!("Whisper request error: {e}");
                if attempt + 1 < config.max_retries {
                    tokio::time::sleep(std::time::Duration::from_millis(500 * (attempt + 1) as u64))
                        .await;
                }
            }
        }
    }
    Err(last_error)
}

async fn transcribe_assemblyai(wav_data: &[u8], config: &SttConfig) -> Result<String, String> {
    let client = reqwest::Client::new();

    let _b64 = base64::engine::general_purpose::STANDARD.encode(wav_data);

    let upload_resp = client
        .post("https://api.assemblyai.com/v2/upload")
        .header("authorization", config.api_key.clone())
        .body(wav_data.to_vec())
        .timeout(std::time::Duration::from_secs(config.timeout_secs))
        .send()
        .await
        .map_err(|e| format!("AssemblyAI upload error: {e}"))?;

    if !upload_resp.status().is_success() {
        let status = upload_resp.status();
        let body = upload_resp.text().await.unwrap_or_default();
        return Err(format!("AssemblyAI upload HTTP {}: {}", status, body));
    }

    let upload_json: serde_json::Value = upload_resp
        .json()
        .await
        .map_err(|e| format!("AssemblyAI upload parse error: {e}"))?;
    let audio_url = upload_json["upload_url"]
        .as_str()
        .ok_or_else(|| "AssemblyAI upload missing upload_url".to_string())?
        .to_string();

    let transcript_req = serde_json::json!({
        "audio_url": audio_url,
        "language_code": config.language,
    });

    let mut last_error = String::new();
    for attempt in 0..config.max_retries {
        let result = client
            .post("https://api.assemblyai.com/v2/transcript")
            .header("authorization", config.api_key.clone())
            .json(&transcript_req)
            .timeout(std::time::Duration::from_secs(config.timeout_secs))
            .send()
            .await;

        match result {
            Ok(resp) => {
                if !resp.status().is_success() {
                    let status = resp.status();
                    let body = resp.text().await.unwrap_or_default();
                    last_error = format!("AssemblyAI transcript HTTP {}: {}", status, body);
                    if attempt + 1 < config.max_retries {
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    }
                    continue;
                }
                let json: serde_json::Value = resp
                    .json()
                    .await
                    .map_err(|e| format!("AssemblyAI transcript parse error: {e}"))?;
                let transcript_id = json["id"]
                    .as_str()
                    .ok_or_else(|| "AssemblyAI missing transcript id".to_string())?;

                let polling_url =
                    format!("https://api.assemblyai.com/v2/transcript/{transcript_id}");
                loop {
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    let poll_resp = client
                        .get(&polling_url)
                        .header("authorization", config.api_key.clone())
                        .send()
                        .await
                        .map_err(|e| format!("AssemblyAI poll error: {e}"))?;
                    let poll_json: serde_json::Value = poll_resp
                        .json()
                        .await
                        .map_err(|e| format!("AssemblyAI poll parse error: {e}"))?;
                    let status = poll_json["status"].as_str().unwrap_or("");
                    match status {
                        "completed" => {
                            let transcript = poll_json["text"].as_str().unwrap_or("").to_string();
                            return Ok(transcript);
                        }
                        "error" => {
                            let error = poll_json["error"].as_str().unwrap_or("unknown error");
                            return Err(format!("AssemblyAI transcription error: {error}"));
                        }
                        _ => {}
                    }
                }
            }
            Err(e) => {
                last_error = format!("AssemblyAI request error: {e}");
                if attempt + 1 < config.max_retries {
                    tokio::time::sleep(std::time::Duration::from_millis(500 * (attempt + 1) as u64))
                        .await;
                }
            }
        }
    }
    Err(last_error)
}
