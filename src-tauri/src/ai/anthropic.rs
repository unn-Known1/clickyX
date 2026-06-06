use std::time::Duration;

use super::streaming::{self, StreamEvent, StreamSender};
use super::{AiError, AiProvider, ChatMessage, ImageInput};

pub struct AnthropicProvider {
    api_key: String,
    system_prompt: String,
}

impl AnthropicProvider {
    pub fn new(api_key: String, system_prompt: String) -> Self {
        Self {
            api_key,
            system_prompt,
        }
    }

    fn build_request_body(
        &self,
        messages: &[ChatMessage],
        model: &str,
        stream: bool,
        images: &[ImageInput],
    ) -> serde_json::Value {
        let api_messages: Vec<serde_json::Value> = messages
            .iter()
            .map(|msg| {
                let content = if msg.role == "user" && !images.is_empty() {
                    let mut blocks: Vec<serde_json::Value> = vec![serde_json::json!({
                        "type": "text",
                        "text": msg.content
                    })];
                    for img in images {
                        blocks.push(serde_json::json!({
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": img.media_type,
                                "data": img.data
                            }
                        }));
                    }
                    serde_json::json!(blocks)
                } else {
                    serde_json::json!(msg.content)
                };
                serde_json::json!({
                    "role": msg.role,
                    "content": content
                })
            })
            .collect();

        let mut body = serde_json::json!({
            "model": model,
            "max_tokens": 4096,
            "stream": stream,
            "messages": api_messages,
        });

        if !self.system_prompt.is_empty() {
            if let Some(obj) = body.as_object_mut() {
                obj.insert("system".into(), serde_json::json!(self.system_prompt));
            }
        }

        body
    }
}

#[async_trait::async_trait]
impl AiProvider for AnthropicProvider {
    async fn chat(&self, messages: &[ChatMessage], model: &str) -> Result<String, AiError> {
        let body = self.build_request_body(messages, model, false, &[]);

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|e| AiError::Network(e.to_string()))?;
        let response = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
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
            return Err(AiError::Api(format!("Anthropic API error ({}): {}", status, text)));
        }

        let json: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| AiError::Decode(e.to_string()))?;

        let content = json
            .get("content")
            .and_then(|c| c.as_array())
            .ok_or_else(|| AiError::Decode("missing content in response".into()))?;

        let full_text: String = content
            .iter()
            .filter_map(|block| {
                if block.get("type").and_then(|t| t.as_str()) == Some("text") {
                    block.get("text").and_then(|t| t.as_str())
                } else {
                    None
                }
            })
            .collect::<Vec<&str>>()
            .join("");

        Ok(full_text)
    }

    async fn chat_stream(
        &self,
        messages: &[ChatMessage],
        model: &str,
    ) -> Result<streaming::StreamReceiver, AiError> {
        let body = self.build_request_body(messages, model, true, &[]);
        let (sender, receiver) = streaming::create_channel();

        let api_key = self.api_key.clone();
        tokio::spawn(async move {
            if let Err(e) = Self::stream_request(api_key, body, sender).await {
                log::error!("Anthropic stream error: {e}");
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
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
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
            return Err(AiError::Api(format!("Anthropic API error ({}): {}", status, text)));
        }

        let json: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| AiError::Decode(e.to_string()))?;

        let content = json
            .get("content")
            .and_then(|c| c.as_array())
            .ok_or_else(|| AiError::Decode("missing content in response".into()))?;

        let full_text: String = content
            .iter()
            .filter_map(|block| {
                if block.get("type").and_then(|t| t.as_str()) == Some("text") {
                    block.get("text").and_then(|t| t.as_str())
                } else {
                    None
                }
            })
            .collect::<Vec<&str>>()
            .join("");

        Ok(full_text)
    }
}

impl AnthropicProvider {
    async fn stream_request(
        api_key: String,
        body: serde_json::Value,
        sender: StreamSender,
    ) -> Result<(), AiError> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|e| AiError::Network(e.to_string()))?;
        let response = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AiError::Network(e.to_string()))?;

        let status = response.status();
        if !status.is_success() {
            let text = response
                .text()
                .await
                .unwrap_or_default();
            let _ = sender
                .send(StreamEvent::Error { message: format!("API error ({}): {}", status, text), session_id: None })
                .await;
            return Ok(());
        }

        let mut stream = response.bytes_stream();
        let mut buf = String::new();
        let mut current_event = String::new();
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

                if line.is_empty() {
                    if current_event == "content_block_delta" {
                        continue;
                    }
                    current_event.clear();
                } else if let Some(data) = line.strip_prefix("data: ") {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        if json.get("type").and_then(|t| t.as_str()) == Some("content_block_delta") {
                            if let Some(text) = json
                                .pointer("/delta/text")
                                .and_then(|t| t.as_str())
                            {
                                full_text.push_str(text);
                                let _ = sender
                                    .send(StreamEvent::TextDelta { text: text.to_string(), session_id: None })
                                    .await;
                            }
                        }
                    }
                } else if let Some(event_type) = line.strip_prefix("event: ") {
                    current_event = event_type.to_string();
                }
            }
        }

        let _ = sender.send(StreamEvent::TextDone { text: full_text, session_id: None }).await;
        let _ = sender.send(StreamEvent::Done { session_id: None }).await;

        Ok(())
    }
}
