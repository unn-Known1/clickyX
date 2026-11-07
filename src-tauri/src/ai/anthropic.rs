//! Anthropic Messages API provider (raw HTTP; there is no official Rust SDK).
//!
//! Targets API version `2026-10-21` and the 5.x model line:
//! - no `temperature` / `top_p` / `top_k` (400 on this version, any value);
//! - `thinking` is never sent: these models think adaptively by default and
//!   reject `{type:"disabled"}` and `budget_tokens`;
//! - depth is controlled with `output_config.effort`;
//! - no forced `tool_choice` and no assistant prefill (the app does neither);
//! - the stable system prompt is a cached text block, volatile text is kept
//!   in a second uncached block after it;
//! - classifier refusals are opted into server-side fallbacks.

use std::time::Duration;

use super::streaming::{self, SseBuffer, StreamEvent, StreamSender};
use super::{AiError, AiProvider, ChatMessage, ImageInput};

/// `anthropic-version` sent on every request, including the bridge proxy.
pub const API_VERSION: &str = "2026-10-21";
pub const DEFAULT_ENDPOINT: &str = "https://api.anthropic.com";
/// Room for adaptive thinking *and* the reply (thinking counts toward it).
pub const NON_STREAM_MAX_TOKENS: u32 = 16_000;
pub const STREAM_MAX_TOKENS: u32 = 32_000;
pub const DEFAULT_MODEL: &str = "claude-opus-5-5";
pub const DEFAULT_EFFORT: &str = "medium";
pub const EFFORTS: [&str; 5] = ["low", "medium", "high", "xhigh", "max"];

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
/// Non-streaming replies are silent until complete, so allow a long wait.
const NON_STREAM_READ_TIMEOUT: Duration = Duration::from_secs(600);
/// Streams send `ping` events every few seconds; two idle minutes is dead.
const STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(120);

const BETA_FALLBACK_DEFAULT: &str = "server-side-fallback-2026-07-01";
const BETA_FALLBACK_ARRAY: &str = "server-side-fallback-2026-06-01";

/// Normalise a configured effort to one the API accepts.
pub fn normalize_effort(effort: &str) -> &'static str {
    let lower = effort.trim().to_ascii_lowercase();
    EFFORTS
        .iter()
        .copied()
        .find(|e| *e == lower)
        .unwrap_or(DEFAULT_EFFORT)
}

/// True for the 5.x lines that take `output_config.effort` and adaptive
/// thinking. Older or unknown ids get the plain request (no effort, no
/// fallbacks) so a hand-typed legacy id keeps working.
pub fn supports_effort(model: &str) -> bool {
    ["claude-opus-5", "claude-sonnet-5", "claude-haiku-5", "claude-fable-5", "claude-mythos-5"]
        .iter()
        .any(|p| model.starts_with(p))
}

/// Server-side refusal fallback to opt into: `(anthropic-beta value, body value)`.
/// Haiku 5.5 has no server-side fallback (the parameter is a 400 there).
pub fn fallback_for(model: &str) -> Option<(&'static str, serde_json::Value)> {
    // `"default"` lets the API pick the fallback by refusal category, so no
    // pinned substitute model has to be migrated when it is retired.
    if model.starts_with("claude-opus-5-5")
        || model.starts_with("claude-sonnet-5-5")
        || model.starts_with("claude-fable-5-1")
    {
        Some((BETA_FALLBACK_DEFAULT, serde_json::json!("default")))
    } else {
        None
    }
}

/// Build the system content: the stable prompt is cached; anything volatile
/// (per-request `system`-role messages) follows in an uncached block.
fn system_blocks(stable: &str, volatile: &[String]) -> Vec<serde_json::Value> {
    let mut blocks = Vec::new();
    if !stable.is_empty() {
        blocks.push(serde_json::json!({
            "type": "text",
            "text": stable,
            "cache_control": { "type": "ephemeral" }
        }));
    }
    for text in volatile.iter().filter(|t| !t.is_empty()) {
        blocks.push(serde_json::json!({ "type": "text", "text": text }));
    }
    blocks
}

/// Pure request-body builder (unit-tested; no I/O).
pub fn build_request_body(
    stable_system: &str,
    messages: &[ChatMessage],
    model: &str,
    effort: &str,
    stream: bool,
    images: &[ImageInput],
) -> serde_json::Value {
    let volatile: Vec<String> = messages
        .iter()
        .filter(|m| m.role == "system")
        .map(|m| m.content.clone())
        .collect();
    let convo: Vec<&ChatMessage> = messages.iter().filter(|m| m.role != "system").collect();

    // #20: attach images only to the *last* user message, not every user
    // turn of the thread (prevents re-sending screenshots on each turn).
    let last_user_idx = convo.iter().rposition(|m| m.role == "user");
    let api_messages: Vec<serde_json::Value> = convo
        .iter()
        .enumerate()
        .map(|(idx, msg)| {
            let content = if Some(idx) == last_user_idx && !images.is_empty() {
                let mut blocks: Vec<serde_json::Value> =
                    vec![serde_json::json!({ "type": "text", "text": msg.content })];
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
            serde_json::json!({ "role": msg.role, "content": content })
        })
        .collect();

    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": if stream { STREAM_MAX_TOKENS } else { NON_STREAM_MAX_TOKENS },
        "messages": api_messages,
    });
    if stream {
        body["stream"] = serde_json::json!(true);
    }
    let system = system_blocks(stable_system, &volatile);
    if !system.is_empty() {
        body["system"] = serde_json::json!(system);
    }
    apply_model_options(&mut body, model, effort);
    body
}

/// Add the model-specific options (`output_config.effort`, `fallbacks`) to a
/// body, never touching `thinking` and never adding sampling parameters.
pub fn apply_model_options(body: &mut serde_json::Value, model: &str, effort: &str) {
    if !supports_effort(model) {
        return;
    }
    if body.get("output_config").is_none() {
        body["output_config"] = serde_json::json!({ "effort": normalize_effort(effort) });
    }
    if body.get("fallbacks").is_none() {
        if let Some((_, value)) = fallback_for(model) {
            body["fallbacks"] = value;
        }
    }
}

/// Remove sampling parameters, which API version `2026-10-21` rejects.
/// Returns the names removed (for a content-free log line).
pub fn strip_sampling_params(body: &mut serde_json::Value) -> Vec<&'static str> {
    let mut removed = Vec::new();
    if let Some(obj) = body.as_object_mut() {
        for key in ["temperature", "top_p", "top_k"] {
            if obj.remove(key).is_some() {
                removed.push(key);
            }
        }
    }
    removed
}

/// The `anthropic-beta` header the body's `fallbacks` form requires, if any.
pub fn beta_header_for(body: &serde_json::Value) -> Option<&'static str> {
    match body.get("fallbacks") {
        Some(v) if v.is_string() => Some(BETA_FALLBACK_DEFAULT),
        Some(v) if v.is_array() => Some(BETA_FALLBACK_ARRAY),
        _ => None,
    }
}

/// Plain-language message for an HTTP failure. Never includes the response
/// body, which can echo user content.
pub fn http_error_message(status: u16) -> String {
    match status {
        400 => "Claude rejected the request (400). Try a different model or a shorter conversation.".into(),
        401 => "Claude rejected the API key (401). Check the Anthropic key in AI Providers.".into(),
        402 => "Anthropic reports a billing problem (402). Check your Anthropic account.".into(),
        403 => "Your Anthropic account isn't allowed to do that (403). Check access and data-retention settings for this model.".into(),
        404 => "Claude couldn't find that model (404). It may be retired or not available to your account; pick another in AI Providers.".into(),
        413 => "The request was too large (413). Use a shorter conversation or fewer screenshots.".into(),
        429 => "Anthropic's rate limit was reached (429). Wait a moment and try again.".into(),
        500 => "Anthropic had an internal error (500). Try again shortly.".into(),
        529 => "Claude is overloaded right now (529). Try again in a moment.".into(),
        s => format!("Anthropic returned an unexpected error ({s})."),
    }
}

pub const REFUSAL_MESSAGE: &str =
    "Claude declined this request (safety filter). Try rephrasing, or pick a different model in AI Providers.";

/// Friendly text for an SSE `error` event, from its `error.type` only.
fn stream_error_message(error_type: &str) -> String {
    match error_type {
        "overloaded_error" => "Claude is overloaded right now. Try again in a moment.".into(),
        "rate_limit_error" => "Anthropic's rate limit was reached. Wait a moment and try again.".into(),
        "api_error" => "Anthropic had an internal error. Try again shortly.".into(),
        "authentication_error" | "permission_error" => {
            "Claude rejected the API key or access. Check the Anthropic key in AI Providers.".into()
        }
        "invalid_request_error" => "Claude rejected the request.".into(),
        "" => "Claude stopped the reply unexpectedly.".into(),
        other => {
            let safe: String = other
                .chars()
                .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
                .take(40)
                .collect();
            format!("Claude stopped the reply unexpectedly ({safe}).")
        }
    }
}

/// Parse a non-streaming Messages response: check `stop_reason` first, then
/// take only `text` blocks (thinking blocks may lead the content).
pub fn parse_message_response(json: &serde_json::Value) -> Result<String, AiError> {
    match json.get("stop_reason").and_then(|s| s.as_str()) {
        Some("refusal") => return Err(AiError::Api(REFUSAL_MESSAGE.into())),
        Some("model_context_window_exceeded") => {
            return Err(AiError::Api(
                "The conversation is too long for this model. Start a new chat or use fewer screenshots.".into(),
            ))
        }
        _ => {}
    }
    let content = json
        .get("content")
        .and_then(|c| c.as_array())
        .ok_or_else(|| AiError::Decode("missing content in response".into()))?;
    let text: String = content
        .iter()
        .filter(|b| b.get("type").and_then(|t| t.as_str()) == Some("text"))
        .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
        .collect::<Vec<_>>()
        .join("");
    let has_text_block = content
        .iter()
        .any(|b| b.get("type").and_then(|t| t.as_str()) == Some("text"));
    if text.is_empty() && !has_text_block {
        return Err(AiError::Decode(
            "Claude returned no text in its reply".into(),
        ));
    }
    Ok(text)
}

/// Incremental interpreter for the Messages SSE stream.
#[derive(Debug, Default)]
pub struct StreamState {
    full_text: String,
    stop_reason: Option<String>,
    done: bool,
}

impl StreamState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_done(&self) -> bool {
        self.done
    }

    /// Handle one SSE event; returns the app-level events to emit.
    pub fn handle(&mut self, event_name: Option<&str>, data: &str) -> Vec<StreamEvent> {
        if self.done {
            return vec![];
        }
        let Ok(json) = serde_json::from_str::<serde_json::Value>(data) else {
            return vec![];
        };
        let kind = json
            .get("type")
            .and_then(|t| t.as_str())
            .or(event_name)
            .unwrap_or("");
        let mut out = Vec::new();
        match kind {
            "content_block_start" => {
                let block = json.get("content_block");
                if block.and_then(|b| b.get("type")).and_then(|t| t.as_str()) == Some("text") {
                    if let Some(t) = block.and_then(|b| b.get("text")).and_then(|t| t.as_str()) {
                        self.push_text(t, &mut out);
                    }
                }
            }
            "content_block_delta" => {
                // Text deltas only; thinking / signature / tool-input deltas are ignored.
                if json.pointer("/delta/type").and_then(|t| t.as_str()) == Some("text_delta") {
                    if let Some(t) = json.pointer("/delta/text").and_then(|t| t.as_str()) {
                        self.push_text(t, &mut out);
                    }
                }
            }
            "message_delta" => {
                if let Some(reason) = json.pointer("/delta/stop_reason").and_then(|s| s.as_str()) {
                    self.stop_reason = Some(reason.to_string());
                }
            }
            "message_stop" => {
                self.done = true;
                if self.stop_reason.as_deref() == Some("refusal") {
                    out.push(error_event(REFUSAL_MESSAGE.into()));
                } else if self.stop_reason.as_deref() == Some("model_context_window_exceeded") {
                    out.push(error_event(
                        "The conversation is too long for this model. Start a new chat.".into(),
                    ));
                } else {
                    out.push(StreamEvent::TextDone {
                        text: std::mem::take(&mut self.full_text),
                        session_id: None,
                    });
                    out.push(StreamEvent::Done { session_id: None });
                }
            }
            "error" => {
                self.done = true;
                let t = json.pointer("/error/type").and_then(|t| t.as_str()).unwrap_or("");
                out.push(error_event(stream_error_message(t)));
            }
            // message_start, content_block_stop, ping and unknown future events.
            _ => {}
        }
        out
    }

    /// Call when the byte stream ends. A stream that never reached
    /// `message_stop` was cut off.
    pub fn finish(&mut self) -> Vec<StreamEvent> {
        if self.done {
            return vec![];
        }
        self.done = true;
        vec![error_event(
            "The connection to Claude ended before the reply finished. Try again.".into(),
        )]
    }

    fn push_text(&mut self, text: &str, out: &mut Vec<StreamEvent>) {
        if text.is_empty() {
            return;
        }
        self.full_text.push_str(text);
        out.push(StreamEvent::TextDelta {
            text: text.to_string(),
            session_id: None,
        });
    }
}

fn error_event(message: String) -> StreamEvent {
    StreamEvent::Error {
        message,
        session_id: None,
    }
}

pub struct AnthropicProvider {
    api_key: String,
    system_prompt: String,
    effort: String,
    endpoint: String,
}

impl AnthropicProvider {
    pub fn new(api_key: String, system_prompt: String) -> Self {
        Self {
            api_key,
            system_prompt,
            effort: DEFAULT_EFFORT.into(),
            endpoint: DEFAULT_ENDPOINT.into(),
        }
    }

    pub fn with_effort(mut self, effort: &str) -> Self {
        self.effort = normalize_effort(effort).into();
        self
    }

    /// Point at another base URL (tests only; in production the key only goes to Anthropic).
    #[cfg(test)]
    pub fn with_endpoint(mut self, endpoint: &str) -> Self {
        self.endpoint = endpoint.trim_end_matches('/').to_string();
        self
    }

    /// The one request path: headers, timeouts, beta opt-in and HTTP error
    /// mapping live here instead of in three copies.
    async fn post(
        &self,
        body: &serde_json::Value,
        streaming: bool,
    ) -> Result<reqwest::Response, AiError> {
        send_messages(&self.endpoint, &self.api_key, body, streaming).await
    }
}

async fn send_messages(
    endpoint: &str,
    api_key: &str,
    body: &serde_json::Value,
    streaming: bool,
) -> Result<reqwest::Response, AiError> {
    let read_timeout = if streaming {
        STREAM_IDLE_TIMEOUT
    } else {
        NON_STREAM_READ_TIMEOUT
    };
    let client = reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .read_timeout(read_timeout)
        .build()
        .map_err(|e| AiError::Network(e.to_string()))?;
    let url = format!("{}/v1/messages", endpoint.trim_end_matches('/'));

    let mut attempt_body = body.clone();
    for attempt in 0..2 {
        let mut req = client
            .post(&url)
            .header("x-api-key", api_key)
            .header("anthropic-version", API_VERSION)
            .header("content-type", "application/json");
        if let Some(beta) = beta_header_for(&attempt_body) {
            req = req.header("anthropic-beta", beta);
        }
        let response = req
            .json(&attempt_body)
            .send()
            .await
            .map_err(|e| AiError::Network(network_message(&e)))?;
        let status = response.status();
        if status.is_success() {
            return Ok(response);
        }
        let text = response.text().await.unwrap_or_default();
        let error_type = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v.pointer("/error/type").and_then(|t| t.as_str()).map(str::to_string))
            .unwrap_or_default();
        // The fallback beta can be disabled for an org; it is an optional
        // safety net, so retry once without it instead of failing the chat.
        if attempt == 0
            && status.as_u16() == 400
            && attempt_body.get("fallbacks").is_some()
            && text.contains("anthropic-beta")
        {
            log::warn!("Anthropic fallback beta not enabled for this org; retrying without fallbacks");
            if let Some(obj) = attempt_body.as_object_mut() {
                obj.remove("fallbacks");
            }
            continue;
        }
        log::warn!(
            "Anthropic request failed: HTTP {} type={}",
            status.as_u16(),
            if error_type.is_empty() { "unknown" } else { &error_type }
        );
        return Err(AiError::Api(http_error_message(status.as_u16())));
    }
    Err(AiError::Api(http_error_message(400)))
}

fn network_message(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        "Timed out waiting for Claude. Check your connection and try again.".into()
    } else if e.is_connect() {
        "Couldn't reach Anthropic. Check your internet connection.".into()
    } else {
        "Network problem talking to Anthropic.".into()
    }
}

#[async_trait::async_trait]
impl AiProvider for AnthropicProvider {
    async fn chat(&self, messages: &[ChatMessage], model: &str) -> Result<String, AiError> {
        self.chat_with_vision(messages, model, &[]).await
    }

    async fn chat_stream(
        &self,
        messages: &[ChatMessage],
        model: &str,
    ) -> Result<streaming::StreamReceiver, AiError> {
        let body = build_request_body(&self.system_prompt, messages, model, &self.effort, true, &[]);
        let (sender, receiver) = streaming::create_channel();
        let endpoint = self.endpoint.clone();
        let api_key = self.api_key.clone();
        tokio::spawn(async move {
            if let Err(e) = Self::stream_request(&endpoint, &api_key, body, sender.clone()).await {
                log::error!("Anthropic stream error: {e}");
                let _ = sender
                    .send(StreamEvent::Error {
                        message: match e {
                            AiError::Api(m) | AiError::Network(m) | AiError::Decode(m) | AiError::Config(m) => m,
                        },
                        session_id: None,
                    })
                    .await;
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
        let body = build_request_body(&self.system_prompt, messages, model, &self.effort, false, images);
        let response = self.post(&body, false).await?;
        let text = response
            .text()
            .await
            .map_err(|e| AiError::Decode(e.to_string()))?;
        let json: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| AiError::Decode(e.to_string()))?;
        parse_message_response(&json)
    }
}

impl AnthropicProvider {
    async fn stream_request(
        endpoint: &str,
        api_key: &str,
        body: serde_json::Value,
        sender: StreamSender,
    ) -> Result<(), AiError> {
        let response = send_messages(endpoint, api_key, &body, true).await?;
        let mut stream = response.bytes_stream();
        let mut sse = SseBuffer::new();
        let mut state = StreamState::new();

        use futures_util::StreamExt;
        while let Some(chunk) = stream.next().await {
            let chunk = match chunk {
                Ok(c) => c,
                Err(e) => {
                    let _ = sender
                        .send(error_event(network_message(&e)))
                        .await;
                    return Ok(());
                }
            };
            for ev in sse.push(&chunk) {
                for out in state.handle(ev.event.as_deref(), &ev.data) {
                    if sender.send(out).await.is_err() {
                        return Ok(());
                    }
                }
                if state.is_done() {
                    return Ok(());
                }
            }
        }
        for ev in sse.finish() {
            for out in state.handle(ev.event.as_deref(), &ev.data) {
                let _ = sender.send(out).await;
            }
        }
        for out in state.finish() {
            let _ = sender.send(out).await;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{MockResponse, MockServer};

    fn msg(role: &str, content: &str) -> ChatMessage {
        ChatMessage {
            role: role.into(),
            content: content.into(),
        }
    }

    fn feed(raw: &str) -> Vec<StreamEvent> {
        let mut sse = SseBuffer::new();
        let mut state = StreamState::new();
        let mut out = Vec::new();
        for ev in sse.push(raw.as_bytes()).into_iter().chain(sse.finish()) {
            out.extend(state.handle(ev.event.as_deref(), &ev.data));
        }
        out.extend(state.finish());
        out
    }

    #[test]
    fn body_has_no_sampling_or_thinking_and_caches_system() {
        let body = build_request_body("stable", &[msg("user", "hi")], "claude-opus-5-5", "high", false, &[]);
        for forbidden in ["temperature", "top_p", "top_k", "thinking", "tool_choice"] {
            assert!(body.get(forbidden).is_none(), "{forbidden} must not be sent");
        }
        assert_eq!(body["max_tokens"], 16_000);
        assert_eq!(body["output_config"]["effort"], "high");
        assert_eq!(body["system"][0]["cache_control"]["type"], "ephemeral");
        assert_eq!(body["system"][0]["text"], "stable");
        assert_eq!(body["fallbacks"], "default");
        assert!(body.get("stream").is_none());
    }

    #[test]
    fn streaming_body_uses_larger_budget() {
        let body = build_request_body("s", &[msg("user", "hi")], "claude-sonnet-5-5", "low", true, &[]);
        assert_eq!(body["max_tokens"], 32_000);
        assert_eq!(body["stream"], true);
        assert_eq!(beta_header_for(&body), Some("server-side-fallback-2026-07-01"));
    }

    #[test]
    fn volatile_system_messages_go_after_the_cached_block() {
        let msgs = [msg("system", "focused app: Notes"), msg("user", "draft")];
        let body = build_request_body("stable", &msgs, "claude-opus-5-5", "medium", false, &[]);
        assert_eq!(body["system"].as_array().map(|a| a.len()), Some(2));
        assert!(body["system"][1].get("cache_control").is_none());
        assert_eq!(body["messages"].as_array().map(|a| a.len()), Some(1));
        assert_eq!(body["messages"][0]["role"], "user");
    }

    #[test]
    fn images_attach_only_to_last_user_message() {
        let msgs = [msg("user", "a"), msg("assistant", "b"), msg("user", "c")];
        let imgs = [ImageInput { media_type: "image/png".into(), data: "AAA".into() }];
        let body = build_request_body("", &msgs, "claude-opus-5-5", "medium", false, &imgs);
        assert!(body["messages"][0]["content"].is_string());
        assert_eq!(body["messages"][2]["content"][1]["type"], "image");
        assert!(body.get("system").is_none());
    }

    #[test]
    fn model_options_depend_on_model_family() {
        let haiku = build_request_body("s", &[msg("user", "x")], "claude-haiku-5-5", "max", false, &[]);
        assert_eq!(haiku["output_config"]["effort"], "max");
        assert!(haiku.get("fallbacks").is_none(), "Haiku has no server-side fallback");
        let fable = build_request_body("s", &[msg("user", "x")], "claude-fable-5-1", "medium", false, &[]);
        assert_eq!(fable["fallbacks"], "default");
        assert_eq!(beta_header_for(&fable), Some("server-side-fallback-2026-07-01"));
        let legacy = build_request_body("s", &[msg("user", "x")], "claude-sonnet-4-5", "high", false, &[]);
        assert!(legacy.get("output_config").is_none());
        assert!(legacy.get("fallbacks").is_none());
    }

    #[test]
    fn effort_is_normalised() {
        assert_eq!(normalize_effort("XHIGH"), "xhigh");
        assert_eq!(normalize_effort("bogus"), "medium");
        assert_eq!(normalize_effort(""), "medium");
    }

    #[test]
    fn sampling_params_are_stripped_and_reported() {
        let mut body = serde_json::json!({"model": "m", "temperature": 0.2, "top_k": 5, "messages": []});
        assert_eq!(strip_sampling_params(&mut body), vec!["temperature", "top_k"]);
        assert!(body.get("temperature").is_none() && body.get("top_k").is_none());
        assert!(strip_sampling_params(&mut body).is_empty());
    }

    #[test]
    fn http_errors_map_without_bodies() {
        for s in [400u16, 401, 403, 404, 413, 429, 500, 529] {
            let m = http_error_message(s);
            assert!(m.contains(&s.to_string()), "{m}");
        }
        assert!(http_error_message(404).contains("model"));
    }

    #[test]
    fn sse_text_deltas_stream_and_thinking_is_ignored() {
        let raw = concat!(
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"m\"}}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"thinking\",\"thinking\":\"\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"secret reasoning\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"signature_delta\",\"signature\":\"sig\"}}\n\n",
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
            "event: ping\ndata: {\"type\":\"ping\"}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hel\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"text_delta\",\"text\":\"lo\"}}\n\n",
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":1}\n\n",
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":5}}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
        );
        let events = feed(raw);
        let deltas: Vec<&str> = events
            .iter()
            .filter_map(|e| match e {
                StreamEvent::TextDelta { text, .. } => Some(text.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(deltas, vec!["Hel", "lo"]);
        assert!(events.iter().any(|e| matches!(e, StreamEvent::TextDone { text, .. } if text == "Hello")));
        assert!(matches!(events.last(), Some(StreamEvent::Done { .. })));
        assert!(!events.iter().any(|e| matches!(e, StreamEvent::Error { .. })));
    }

    #[test]
    fn sse_refusal_becomes_a_friendly_error() {
        let raw = concat!(
            "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
            "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"refusal\"}}\n\n",
            "data: {\"type\":\"message_stop\"}\n\n",
        );
        let events = feed(raw);
        assert_eq!(events.len(), 1);
        assert!(matches!(&events[0], StreamEvent::Error { message, .. } if message.contains("declined")));
    }

    #[test]
    fn sse_error_event_maps_overloaded() {
        let raw = "event: error\ndata: {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}\n\n";
        let events = feed(raw);
        assert_eq!(events.len(), 1);
        assert!(matches!(&events[0], StreamEvent::Error { message, .. } if message.contains("overloaded") && !message.contains("Overloaded")));
    }

    #[test]
    fn truncated_stream_reports_an_error() {
        let raw = "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"par\"}}\n\n";
        let events = feed(raw);
        assert!(matches!(events.last(), Some(StreamEvent::Error { .. })));
    }

    #[test]
    fn non_streaming_parse_takes_text_blocks_only() {
        let json = serde_json::json!({
            "stop_reason": "end_turn",
            "content": [
                {"type": "thinking", "thinking": "", "signature": "x"},
                {"type": "text", "text": "A"},
                {"type": "text", "text": "B"}
            ]
        });
        assert_eq!(parse_message_response(&json).ok().as_deref(), Some("AB"));
    }

    #[test]
    fn non_streaming_refusal_is_checked_before_content() {
        let json = serde_json::json!({"stop_reason": "refusal", "content": []});
        assert!(matches!(parse_message_response(&json), Err(AiError::Api(m)) if m.contains("declined")));
        let none = serde_json::json!({"stop_reason": "end_turn", "content": [{"type": "thinking", "thinking": ""}]});
        assert!(parse_message_response(&none).is_err());
    }

    #[tokio::test]
    async fn chat_sends_version_header_and_collects_text() {
        let server = MockServer::start(|_| {
            MockResponse::json(
                200,
                serde_json::json!({"stop_reason": "end_turn", "content": [{"type": "text", "text": "pong"}]}),
            )
        })
        .await;
        let provider = AnthropicProvider::new("test-key".into(), "sys".into())
            .with_effort("low")
            .with_endpoint(&server.base_url);
        let out = provider.chat(&[msg("user", "ping")], "claude-opus-5-5").await;
        assert_eq!(out.ok().as_deref(), Some("pong"));
        let reqs = server.requests();
        assert_eq!(reqs.len(), 1);
        assert_eq!(reqs[0].path, "/v1/messages");
        assert_eq!(reqs[0].header("anthropic-version"), Some("2026-10-21"));
        assert_eq!(reqs[0].header("anthropic-beta"), Some("server-side-fallback-2026-07-01"));
        assert_eq!(reqs[0].json()["output_config"]["effort"], "low");
    }

    #[tokio::test]
    async fn http_error_does_not_leak_body_and_beta_failure_retries_without_fallbacks() {
        let server = MockServer::start(|req| {
            if req.header("anthropic-beta").is_some() {
                MockResponse::json(
                    400,
                    serde_json::json!({"error": {"type": "invalid_request_error", "message": "Unexpected value(s) `x` for the `anthropic-beta` header."}}),
                )
            } else {
                MockResponse::json(200, serde_json::json!({"stop_reason": "end_turn", "content": [{"type": "text", "text": "ok"}]}))
            }
        })
        .await;
        let provider = AnthropicProvider::new("k".into(), String::new()).with_endpoint(&server.base_url);
        let out = provider.chat(&[msg("user", "x")], "claude-opus-5-5").await;
        assert_eq!(out.ok().as_deref(), Some("ok"));
        assert_eq!(server.requests().len(), 2);

        let denied = MockServer::start(|_| {
            MockResponse::json(401, serde_json::json!({"error": {"type": "authentication_error", "message": "secret user content"}}))
        })
        .await;
        let provider = AnthropicProvider::new("k".into(), String::new()).with_endpoint(&denied.base_url);
        let err = provider.chat(&[msg("user", "x")], "claude-opus-5-5").await.err();
        let text = err.map(|e| e.to_string()).unwrap_or_default();
        assert!(text.contains("401") && !text.contains("secret user content"), "{text}");
    }
}
