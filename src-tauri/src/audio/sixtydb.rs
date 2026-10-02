use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::Value;
use std::io::Cursor;

use super::{tts::TtsConfig, VoiceInfo};

const BASE_URL: &str = "https://api.60db.ai";
const MAX_RESPONSE: usize = 32 * 1024 * 1024;

fn client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|_| "Could not initialize 60db HTTP client".into())
}

async fn read_response(mut response: reqwest::Response) -> Result<Vec<u8>, String> {
    if !response.status().is_success() {
        return Err(format!("60db HTTP {}", response.status()));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Could not read 60db response")?
    {
        if chunk.len() > MAX_RESPONSE.saturating_sub(bytes.len()) {
            return Err("60db response exceeds the size limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

pub async fn voices(api_key: &str) -> Result<Vec<VoiceInfo>, String> {
    voices_at(api_key, BASE_URL).await
}

async fn voices_at(api_key: &str, base_url: &str) -> Result<Vec<VoiceInfo>, String> {
    if api_key.trim().is_empty() {
        return Err("Configure a 60db API key before loading voices".into());
    }
    let client = client(30)?;
    let mut voices = Vec::new();
    for tier in ["quality", "fast"] {
        let response = client
            .get(format!("{base_url}/voices"))
            .bearer_auth(api_key)
            .query(&[("model", tier)])
            .send()
            .await
            .map_err(|_| "60db voice request failed")?;
        let bytes = read_response(response).await?;
        voices.extend(parse_voices(&bytes)?);
    }
    voices.sort_by(|a, b| a.id.cmp(&b.id));
    voices.dedup_by(|a, b| a.id == b.id);
    voices.sort_by(|a, b| a.name.cmp(&b.name).then(a.id.cmp(&b.id)));
    Ok(voices)
}

fn parse_voices(bytes: &[u8]) -> Result<Vec<VoiceInfo>, String> {
    let value: Value = serde_json::from_slice(bytes).map_err(|_| "Invalid 60db voice response")?;
    if value.get("success").and_then(Value::as_bool) == Some(false) {
        return Err("60db could not load voices".into());
    }
    let rows = value
        .get("data")
        .and_then(Value::as_array)
        .ok_or("Missing 60db voice catalog")?;
    rows.iter()
        .map(|row| {
            let id = row
                .get("voice_id")
                .and_then(Value::as_str)
                .ok_or("Missing 60db voice ID")?;
            uuid::Uuid::parse_str(id).map_err(|_| "Invalid 60db voice ID")?;
            let label = |key| {
                row.get("labels")
                    .and_then(|v| v.get(key))
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string()
            };
            Ok(VoiceInfo {
                id: id.into(),
                provider: "sixtydb".into(),
                name: row.get("name").and_then(Value::as_str).unwrap_or(id).into(),
                description: row
                    .get("description")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .into(),
                accent_color: "#4fc3f7".into(),
                gender: label("gender"),
                style: row
                    .get("model")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .into(),
                language: label("language"),
                tier: "premium".into(),
            })
        })
        .collect()
}

pub async fn speak(text: &str, config: &TtsConfig) -> Result<Vec<u8>, String> {
    speak_at(text, config, BASE_URL).await
}

async fn speak_at(text: &str, config: &TtsConfig, base_url: &str) -> Result<Vec<u8>, String> {
    if text.trim().is_empty() || text.chars().count() > 5000 {
        return Err("60db text must contain between 1 and 5000 characters".into());
    }
    uuid::Uuid::parse_str(&config.voice_id).map_err(|_| "Select a 60db voice before speaking")?;
    let response = client(config.timeout_secs)?
        .post(format!("{base_url}/tts-synthesize"))
        .bearer_auth(&config.api_key)
        .json(&serde_json::json!({
            "text": text, "voice_id": config.voice_id,
            "audio_config": {"audio_encoding": "LINEAR16", "sample_rate_hertz": 24000},
            "timestamp_type": "NONE"
        }))
        .send()
        .await
        .map_err(|_| "60db synthesis request failed")?;
    let binary = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.split(";").next().unwrap_or("").trim())
        .unwrap_or("");
    if binary.starts_with("audio/")
        && !matches!(
            binary,
            "audio/wav" | "audio/x-wav" | "audio/pcm" | "audio/linear16"
        )
    {
        return Err("60db returned an unsupported audio format".into());
    }
    let binary = binary.starts_with("audio/") || binary == "application/octet-stream";
    let bytes = read_response(response).await?;
    if binary {
        pcm_to_wav(bytes)
    } else {
        decode_audio(&bytes)
    }
}

fn audio_chunk(value: &Value) -> Result<Vec<u8>, String> {
    if value.get("success").and_then(Value::as_bool) == Some(false)
        || value.get("type").and_then(Value::as_str) == Some("error")
    {
        return Err("60db synthesis failed".into());
    }
    let payload = value.get("backendResponse").unwrap_or(value);
    if payload.get("success").and_then(Value::as_bool) == Some(false) {
        return Err("60db synthesis failed".into());
    }
    let result = payload.get("result").unwrap_or(payload);
    let encoded = result
        .get("audioContent")
        .or_else(|| result.get("audio_base64"))
        .and_then(Value::as_str);
    let Some(encoded) = encoded else {
        if value.get("type").and_then(Value::as_str) == Some("meta")
            || result.get("timestampInfo").is_some()
        {
            return Ok(Vec::new());
        }
        return Err("Missing audio in 60db response".into());
    };
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "Invalid 60db audio encoding")?;
    if let Ok(wrapped) = serde_json::from_slice::<Value>(&bytes) {
        let encoded = wrapped
            .get("result")
            .unwrap_or(&wrapped)
            .get("audioContent")
            .and_then(Value::as_str)
            .ok_or("Invalid wrapped 60db audio")?;
        return STANDARD
            .decode(encoded)
            .map_err(|_| "Invalid wrapped 60db audio encoding".into());
    }
    Ok(bytes)
}

fn decode_audio(bytes: &[u8]) -> Result<Vec<u8>, String> {
    if bytes.starts_with(b"RIFF") {
        return validate_wav(bytes.to_vec());
    }
    let mut pcm = Vec::new();
    if let Ok(value) = serde_json::from_slice::<Value>(bytes) {
        pcm = audio_chunk(&value)?;
    } else {
        let text = std::str::from_utf8(bytes).map_err(|_| "Invalid 60db audio response")?;
        for line in text.lines().filter(|line| !line.trim().is_empty()) {
            let value: Value =
                serde_json::from_str(line).map_err(|_| "Invalid 60db audio record")?;
            pcm.extend(audio_chunk(&value)?);
        }
    }
    pcm_to_wav(pcm)
}

fn pcm_to_wav(pcm: Vec<u8>) -> Result<Vec<u8>, String> {
    if pcm.starts_with(b"RIFF") {
        return validate_wav(pcm);
    }
    if pcm.starts_with(b"ID3") || pcm.starts_with(b"OggS") {
        return Err("60db returned compressed audio instead of LINEAR16".into());
    }
    if pcm.is_empty() || !pcm.len().is_multiple_of(2) {
        return Err("Invalid 60db LINEAR16 audio length".into());
    }
    let mut cursor = Cursor::new(Vec::new());
    {
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 24000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer =
            hound::WavWriter::new(&mut cursor, spec).map_err(|_| "Could not encode 60db audio")?;
        for sample in pcm.as_chunks::<2>().0 {
            writer
                .write_sample(i16::from_le_bytes([sample[0], sample[1]]))
                .map_err(|_| "Could not encode 60db sample")?;
        }
        writer
            .finalize()
            .map_err(|_| "Could not finalize 60db audio")?;
    }
    Ok(cursor.into_inner())
}

fn validate_wav(bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    let declared = bytes
        .get(4..8)
        .and_then(|value| value.try_into().ok())
        .map(u32::from_le_bytes)
        .ok_or("Truncated 60db WAV header")?;
    if declared as usize + 8 != bytes.len() {
        return Err("Truncated 60db WAV audio".into());
    }
    let reader =
        hound::WavReader::new(Cursor::new(&bytes)).map_err(|_| "Invalid 60db WAV audio")?;
    let spec = reader.spec();
    if spec.channels != 1
        || spec.bits_per_sample != 16
        || spec.sample_rate != 24000
        || spec.sample_format != hound::SampleFormat::Int
        || reader.duration() == 0
    {
        return Err("Unexpected 60db WAV format".into());
    }
    for sample in reader.into_samples::<i16>() {
        sample.map_err(|_| "Truncated 60db WAV audio")?;
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    async fn server(
        responses: Vec<(&'static str, String)>,
    ) -> (String, tokio::task::JoinHandle<Vec<Vec<u8>>>) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(async move {
            let mut requests = Vec::new();
            for (status, body) in responses {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut request = Vec::new();
                let mut buf = [0u8; 1024];
                loop {
                    let n = socket.read(&mut buf).await.unwrap();
                    assert!(n > 0);
                    request.extend_from_slice(&buf[..n]);
                    if let Some(end) = request.windows(4).position(|w| w == b"\r\n\r\n") {
                        let headers = String::from_utf8_lossy(&request[..end]).to_lowercase();
                        let length = headers
                            .lines()
                            .find_map(|line| line.strip_prefix("content-length: "))
                            .map(|v| v.parse::<usize>().unwrap())
                            .unwrap_or(0);
                        if request.len() >= end + 4 + length {
                            break;
                        }
                    }
                    assert!(request.len() < 65536);
                }
                requests.push(request);
                let header = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len());
                socket.write_all(header.as_bytes()).await.unwrap();
                for fragment in body.as_bytes().chunks(7) {
                    if let Err(error) = socket.write_all(fragment).await {
                        assert!(status.starts_with("401"));
                        assert!(matches!(
                            error.kind(),
                            std::io::ErrorKind::BrokenPipe | std::io::ErrorKind::ConnectionReset
                        ));
                        break;
                    }
                    tokio::task::yield_now().await;
                }
            }
            requests
        });
        (address, task)
    }

    #[tokio::test]
    async fn http_synthesis_preserves_auth_and_nested_audio_contract() {
        let (url, server) = server(vec![(
            "200 OK",
            "{\"result\":{\"audioContent\":\"AQACAAMABAA=\"}}\n{\"result\":{\"timestampInfo\":{}}}"
                .into(),
        )])
        .await;
        let config = TtsConfig {
            api_key: "test-key".into(),
            voice_id: "84982e79-c596-4883-b6fa-9af334767aef".into(),
            ..Default::default()
        };
        let wav = speak_at("Hello", &config, &url).await.unwrap();
        assert_eq!(
            hound::WavReader::new(Cursor::new(wav)).unwrap().duration(),
            4
        );
        let requests = server.await.unwrap();
        let request = String::from_utf8_lossy(&requests[0]);
        assert!(request.starts_with("POST /tts-synthesize "));
        assert!(request
            .to_lowercase()
            .contains("authorization: bearer test-key"));
        let body: Value = serde_json::from_str(request.split_once("\r\n\r\n").unwrap().1).unwrap();
        assert_eq!(body["text"], "Hello");
        assert_eq!(body["voice_id"], config.voice_id);
        assert_eq!(body["audio_config"]["sample_rate_hertz"], 24000);
        assert_eq!(body["audio_config"]["audio_encoding"], "LINEAR16");
        assert!(body.get("model_id").is_none());
    }

    #[tokio::test]
    async fn http_catalog_fetches_both_tiers_and_deduplicates_workspace_voices() {
        let body = serde_json::json!({"success": true, "data": [{"voice_id": "84982e79-c596-4883-b6fa-9af334767aef", "name": "Voice", "labels": {"language": "hi", "gender": "female"}}]}).to_string();
        let (url, server) = server(vec![("200 OK", body.clone()), ("200 OK", body)]).await;
        let catalog = voices_at("test-key", &url).await.unwrap();
        assert_eq!(catalog.len(), 1);
        assert_eq!(catalog[0].provider, "sixtydb");
        assert_eq!(catalog[0].language, "hi");
        let requests = server.await.unwrap();
        assert!(String::from_utf8_lossy(&requests[0]).starts_with("GET /voices?model=quality "));
        assert!(String::from_utf8_lossy(&requests[1]).starts_with("GET /voices?model=fast "));
    }

    #[tokio::test]
    async fn http_errors_do_not_echo_service_secrets() {
        let (url, server) = server(vec![(
            "401 Unauthorized",
            "test-key private response".into(),
        )])
        .await;
        let error = voices_at("test-key", &url).await.unwrap_err();
        assert!(error.contains("401"));
        assert!(!error.contains("test-key"));
        server.await.unwrap();
    }

    #[test]
    fn wrapped_audio_and_wave_integrity() {
        let inner = STANDARD.encode(b"{\"result\":{\"audioContent\":\"AQACAAMABAA=\"}}");
        let outer = serde_json::json!({"success": true, "backendResponse": {"success": true, "audio_base64": inner}});
        let mut wav = decode_audio(outer.to_string().as_bytes()).unwrap();
        assert!(validate_wav(wav.clone()).is_ok());
        wav.pop();
        assert!(validate_wav(wav).is_err());
        assert!(parse_voices(b"{\"success\":false,\"data\":[]}").is_err());
        assert!(parse_voices(b"{\"data\":[{\"voice_id\":\"invalid\"}]}").is_err());
    }

    #[test]
    fn decodes_streamed_pcm_into_playable_wav_and_rejects_errors() {
        let bytes = b"{\"result\":{\"audioContent\":\"AQACAAMABAA=\"}}\n{\"type\":\"meta\"}";
        let wav = decode_audio(bytes).unwrap();
        let reader = hound::WavReader::new(Cursor::new(wav)).unwrap();
        assert_eq!(reader.spec().sample_rate, 24000);
        assert_eq!(
            reader
                .into_samples::<i16>()
                .collect::<Result<Vec<_>, _>>()
                .unwrap(),
            [1, 2, 3, 4]
        );
        assert!(pcm_to_wav(b"ID3compressed".to_vec()).is_err());
        assert!(pcm_to_wav(b"OggScompressed".to_vec()).is_err());
        assert!(decode_audio(b"{\"type\":\"error\"}").is_err());
        assert!(decode_audio(b"{\"audio_base64\":\"AQ==\"}").is_err());
    }
}
