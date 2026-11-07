use std::time::Duration;

use super::responses::{self, BodyOptions};
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
    effort: String,
    /// Tests only: exercise the Responses route against a loopback mock.
    force_responses: bool,
}

impl OpenAIProvider {
    pub fn new(api_key: String, system_prompt: String, base_url: String) -> Self {
        Self {
            api_key,
            system_prompt,
            base_url,
            effort: responses::DEFAULT_EFFORT.into(),
            force_responses: false,
        }
    }

    pub fn with_effort(mut self, effort: &str) -> Self {
        self.effort = effort.to_string();
        self
    }

    #[cfg(test)]
    fn with_forced_responses(mut self) -> Self {
        self.force_responses = true;
        self
    }

    /// OpenAI's own endpoint speaks the Responses API; every other
    /// OpenAI-compatible server (OpenRouter, Groq, Ollama, LM Studio, custom)
    /// keeps Chat Completions because not all of them implement Responses.
    fn uses_responses(&self) -> bool {
        self.force_responses || responses::is_openai_own_base_url(&self.base_url)
    }

    fn responses_body(
        &self,
        messages: &[ChatMessage],
        model: &str,
        stream: bool,
        images: &[ImageInput],
    ) -> serde_json::Value {
        let opts = BodyOptions {
            effort: responses::effective_effort(model, &self.effort),
            plan: false,
        };
        responses::build_body(&self.system_prompt, messages, model, images, stream, &opts)
    }

    /// POST to `/v1/responses` with the API key; errors become friendly text.
    async fn post_responses(
        &self,
        body: &serde_json::Value,
        streaming: bool,
    ) -> Result<reqwest::Response, AiError> {
        let client = responses::build_client(streaming)?;
        let response = client
            .post(responses::responses_url(&self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("content-type", "application/json")
            .json(body)
            .send()
            .await
            .map_err(|e| AiError::Network(responses::network_message(&e)))?;
        if response.status().is_success() {
            return Ok(response);
        }
        let failure = responses::read_failure(response).await;
        log::warn!(
            "OpenAI Responses request failed: HTTP {} code={}",
            failure.status,
            if failure.code.is_empty() { "unknown" } else { &failure.code }
        );
        Err(AiError::Api(responses::failure_message(&failure)))
    }

    async fn responses_chat(
        &self,
        messages: &[ChatMessage],
        model: &str,
        images: &[ImageInput],
    ) -> Result<String, AiError> {
        let body = self.responses_body(messages, model, false, images);
        let response = self.post_responses(&body, false).await?;
        let text = response
            .text()
            .await
            .map_err(|e| AiError::Decode(e.to_string()))?;
        let json: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| AiError::Decode(e.to_string()))?;
        responses::parse_response_object(&json)
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
        if self.uses_responses() {
            return self.responses_chat(messages, model, &[]).await;
        }
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
            return Err(AiError::Api(format!(
                "OpenAI API error ({}): {}",
                status, text
            )));
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
        if self.uses_responses() {
            let body = self.responses_body(messages, model, true, &[]);
            let (sender, receiver) = streaming::create_channel();
            let response = self.post_responses(&body, true).await;
            tokio::spawn(async move {
                match response {
                    Ok(r) => responses::forward_stream(r, &sender).await,
                    Err(e) => {
                        let message = match e {
                            AiError::Api(m)
                            | AiError::Network(m)
                            | AiError::Decode(m)
                            | AiError::Config(m) => m,
                        };
                        let _ = sender
                            .send(StreamEvent::Error {
                                message,
                                session_id: None,
                            })
                            .await;
                    }
                }
            });
            return Ok(receiver);
        }
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
        if self.uses_responses() {
            return self.responses_chat(messages, model, images).await;
        }
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
            return Err(AiError::Api(format!(
                "OpenAI API error ({}): {}",
                status, text
            )));
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
                .send(StreamEvent::Error {
                    message: format!("API error ({}): {}", status, text),
                    session_id: None,
                })
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
                    let _ = sender
                        .send(StreamEvent::Error {
                            message: e.to_string(),
                            session_id: None,
                        })
                        .await;
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
                        let _ = sender
                            .send(StreamEvent::TextDone {
                                text: full_text.clone(),
                                session_id: None,
                            })
                            .await;
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
                                .send(StreamEvent::TextDelta {
                                    text: delta.to_string(),
                                    session_id: None,
                                })
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
                let _ = sender
                    .send(StreamEvent::TextDone {
                        text: full_text.clone(),
                        session_id: None,
                    })
                    .await;
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
                        .send(StreamEvent::TextDelta {
                            text: delta.to_string(),
                            session_id: None,
                        })
                        .await;
                }
            }
        }

        let _ = sender
            .send(StreamEvent::TextDone {
                text: full_text,
                session_id: None,
            })
            .await;
        let _ = sender.send(StreamEvent::Done { session_id: None }).await;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{MockResponse, MockServer};

    fn user(text: &str) -> ChatMessage {
        ChatMessage {
            role: "user".into(),
            content: text.into(),
        }
    }

    #[test]
    fn third_party_endpoints_keep_chat_completions() {
        for base in [
            "https://openrouter.ai/api/v1",
            "https://api.groq.com/openai/v1",
            "http://localhost:11434/v1",
            "http://localhost:1234",
        ] {
            let p = OpenAIProvider::new("k".into(), "sys".into(), base.into());
            assert!(!p.uses_responses(), "{base}");
        }
        for base in ["https://api.openai.com", "https://api.openai.com/v1"] {
            let p = OpenAIProvider::new("k".into(), "sys".into(), base.into());
            assert!(p.uses_responses(), "{base}");
        }
        let p = OpenAIProvider::new("k".into(), "sys".into(), "https://openrouter.ai/api/v1".into());
        let body = p.build_request_body(&[user("hi")], "m", false, &[]);
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["max_tokens"], 4096);
    }

    #[tokio::test]
    async fn responses_route_posts_to_v1_responses_and_parses_output() {
        let server = MockServer::start(|_| {
            MockResponse::json(
                200,
                serde_json::json!({
                    "status": "completed",
                    "output": [
                        {"type": "reasoning", "summary": []},
                        {"type": "message", "content": [{"type": "output_text", "text": "pong"}]}
                    ]
                }),
            )
        })
        .await;
        let p = OpenAIProvider::new("sk-test".into(), "sys".into(), server.base_url.clone())
            .with_effort("high")
            .with_forced_responses();
        let out = p.chat(&[user("ping")], "gpt-6.1-sol").await;
        assert_eq!(out.ok().as_deref(), Some("pong"));
        let reqs = server.requests();
        assert_eq!(reqs[0].path, "/v1/responses");
        assert_eq!(reqs[0].header("authorization"), Some("Bearer sk-test"));
        let body = reqs[0].json();
        assert_eq!(body["reasoning"]["effort"], "high");
        assert_eq!(body["instructions"], "sys");
        assert_eq!(body["store"], false);
    }

    #[tokio::test]
    async fn responses_route_streams_deltas() {
        let sse = "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"ok\"}\n\nevent: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{}}\n\n";
        let server = MockServer::start(move |_| MockResponse::sse(sse)).await;
        let p = OpenAIProvider::new("k".into(), String::new(), server.base_url.clone())
            .with_forced_responses();
        let mut rx = p
            .chat_stream(&[user("x")], "gpt-6-luna")
            .await
            .expect("stream opens");
        let mut text = String::new();
        let mut done = false;
        while let Some(ev) = rx.recv().await {
            match ev {
                StreamEvent::TextDelta { text: t, .. } => text.push_str(&t),
                StreamEvent::Done { .. } => {
                    done = true;
                    break;
                }
                StreamEvent::Error { message, .. } => panic!("unexpected error: {message}"),
                StreamEvent::TextDone { .. } => {}
            }
        }
        assert!(done);
        assert_eq!(text, "ok");
    }

    #[tokio::test]
    async fn responses_http_errors_are_friendly() {
        let server = MockServer::start(|_| {
            MockResponse::json(401, serde_json::json!({"error": {"code": "invalid_api_key", "message": "Incorrect API key sk-live-123"}}))
        })
        .await;
        let p = OpenAIProvider::new("k".into(), String::new(), server.base_url.clone())
            .with_forced_responses();
        let err = p.chat(&[user("x")], "gpt-6.1-sol").await.err().map(|e| e.to_string());
        let text = err.unwrap_or_default();
        assert!(text.contains("API key") && !text.contains("sk-live"), "{text}");
    }
}
