use std::time::Duration;

use super::streaming::{self, StreamEvent, StreamSender};
use super::{AiError, AiProvider, ChatMessage, ImageInput};

/// Normalize a configured base URL to the chat completions endpoint without
/// duplicating `/v1` (#13 — self-hosted providers configured as
/// `https://host/v1` previously got `/v1/v1/chat/completions` in streaming).
fn chat_completions_url(base: &str) -> String {
    let base = base.trim_end_matches('/');
    if base.ends_with("/chat/completions") {
        base.to_string()
    } else if base.ends_with("/v1") {
        format!("{}/chat/completions", base)
    } else {
        format!("{}/v1/chat/completions", base)
    }
}

pub struct OpenAIProvider {
    api_key: String,
    system_prompt: String,
    base_url: String,
}

impl OpenAIProvider {
    pub fn new(api_key: String, system_prompt: String, base_url: String) -> Self {
        Self {
            api_key,
            system_prompt,
            base_url,
        }
    }

    fn api_url(&self) -> String {
        chat_completions_url(&self.base_url)
    }

    fn build_request_body(
        &self,
        messages: &[ChatMessage],
        model: &str,
        stream: bool,
        images: &[ImageInput],
    ) -> serde_json::Value {
        let mut api_messages: Vec<serde_json::Value> = Vec::new();

        if !self.system_prompt.is_empty() {
            api_messages.push(serde_json::json!({
                "role": "system",
                "content": self.system_prompt
            }));
        }

        // #20: attach images only to the *last* user message, not every user
        // turn of the thread (prevents re-sending screenshots on each turn).
        let last_user_idx = messages.iter().rposition(|m| m.role == "user");
        for (idx, msg) in messages.iter().enumerate() {
            let attach_images = Some(idx) == last_user_idx && !images.is_empty();
            let content = if attach_images {
                let mut parts: Vec<serde_json::Value> = vec![serde_json::json!({
                    "type": "text",
                    "text": msg.content
                })];
                for img in images {
                    let data_url = format!("data:{};base64,{}", img.media_type, img.data);
                    parts.push(serde_json::json!({
                        "type": "image_url",
                        "image_url": {
                            "url": data_url
                        }
                    }));
                }
                serde_json::json!(parts)
            } else {
                serde_json::json!(msg.content)
            };

            api_messages.push(serde_json::json!({
                "role": msg.role,
                "content": content
            }));
        }

        serde_json::json!({
            "model": model,
            "messages": api_messages,
            "stream": stream,
            "max_tokens": 4096,
        })
    }
}

#[async_trait::async_trait]
impl AiProvider for OpenAIProvider {
    async fn chat(&self, messages: &[ChatMessage], model: &str) -> Result<String, AiError> {
        let body = self.build_request_body(messages, model, false, &[]);

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|e| AiError::Network(e.to_string()))?;
        let response = client
            .post(self.api_url())
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AiError::Network(e.to_string()))?;

        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|e| AiError::Decode(e.to_string()))?;

        if !status.is_success() {
            return Err(AiError::Api(format!("OpenAI API error ({}): {}", status, text)));
        }

        let json: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| AiError::Decode(e.to_string()))?;

        let content = json
            .pointer("/choices/0/message/content")
            .and_then(|c| c.as_str())
            .ok_or_else(|| AiError::Decode("missing content in response".into()))?;

        Ok(content.to_string())
    }

    async fn chat_stream(
        &self,
        messages: &[ChatMessage],
        model: &str,
    ) -> Result<streaming::StreamReceiver, AiError> {
        let body = self.build_request_body(messages, model, true, &[]);
        let (sender, receiver) = streaming::create_channel();

        let api_key = self.api_key.clone();
        let base_url = self.base_url.clone();
        tokio::spawn(async move {
            if let Err(e) = Self::stream_request(api_key, base_url, body, sender).await {
                log::error!("OpenAI stream error: {e}");
            }
        });

        Ok(receiver)
    }

    async fn chat_with_vision(
        &self,
        messages: &[ChatMessage],
        model: &str,
        images: &[ImageInput],
    ) -> Result<String, AiError> {
        let body = self.build_request_body(messages, model, false, images);

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|e| AiError::Network(e.to_string()))?;
        let response = client
            .post(self.api_url())
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AiError::Network(e.to_string()))?;

        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|e| AiError::Decode(e.to_string()))?;

        if !status.is_success() {
            return Err(AiError::Api(format!("OpenAI API error ({}): {}", status, text)));
        }

        let json: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| AiError::Decode(e.to_string()))?;

        let content = json
            .pointer("/choices/0/message/content")
            .and_then(|c| c.as_str())
            .ok_or_else(|| AiError::Decode("missing content in response".into()))?;

        Ok(content.to_string())
    }
}

impl OpenAIProvider {
    async fn stream_request(
        api_key: String,
        base_url: String,
        body: serde_json::Value,
        sender: StreamSender,
    ) -> Result<(), AiError> {
        let url = chat_completions_url(&base_url);
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|e| AiError::Network(e.to_string()))?;
        let response = client
            .post(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AiError::Network(e.to_string()))?;

        let status = response.status();
        if !status.is_success() {
            let text = response.text().await.unwrap_or_default();
            let _ = sender
                .send(StreamEvent::Error { message: format!("API error ({}): {}", status, text), session_id: None })
                .await;
            return Ok(());
        }

        let mut stream = response.bytes_stream();
        let mut buf = String::new();
        let mut full_text = String::new();

        use futures_util::StreamExt;
        while let Some(chunk) = stream.next().await {
            let chunk = match chunk {
                Ok(c) => c,
                Err(e) => {
                    let _ = sender.send(StreamEvent::Error { message: e.to_string(), session_id: None }).await;
                    return Ok(());
                }
            };
            let chunk_str = String::from_utf8_lossy(&chunk);
            buf.push_str(&chunk_str);

            while let Some(newline_pos) = buf.find('\n') {
                let line = buf[..newline_pos].to_string();
                buf = buf[newline_pos + 1..].to_string();

                if let Some(data) = line.strip_prefix("data: ") {
                    if data.trim() == "[DONE]" {
                        let _ = sender.send(StreamEvent::TextDone { text: full_text.clone(), session_id: None }).await;
                        let _ = sender.send(StreamEvent::Done { session_id: None }).await;
                        return Ok(());
                    }

                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(delta) = json
                            .pointer("/choices/0/delta/content")
                            .and_then(|c| c.as_str())
                        {
                            full_text.push_str(delta);
                            let _ = sender
                                .send(StreamEvent::TextDelta { text: delta.to_string(), session_id: None })
                                .await;
                        }
                    }
                }
            }
        }

        // #47: flush a trailing partial SSE line that never ended with '\n'.
        let line = buf.trim().to_string();
        if let Some(data) = line.strip_prefix("data: ") {
            if data.trim() == "[DONE]" {
                let _ = sender.send(StreamEvent::TextDone { text: full_text.clone(), session_id: None }).await;
                let _ = sender.send(StreamEvent::Done { session_id: None }).await;
                return Ok(());
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(delta) = json
                    .pointer("/choices/0/delta/content")
                    .and_then(|c| c.as_str())
                {
                    full_text.push_str(delta);
                    let _ = sender
                        .send(StreamEvent::TextDelta { text: delta.to_string(), session_id: None })
                        .await;
                }
            }
        }

        let _ = sender.send(StreamEvent::TextDone { text: full_text, session_id: None }).await;
        let _ = sender.send(StreamEvent::Done { session_id: None }).await;

        Ok(())
    }
}
