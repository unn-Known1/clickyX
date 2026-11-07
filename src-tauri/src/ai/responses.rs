//! OpenAI Responses API plumbing shared by the API-key route (OpenAI's own
//! endpoint) and the "Sign in with ChatGPT" plan route.
//!
//! `POST /v1/responses` takes `instructions` + `input` items, streams SSE, and
//! a request only succeeded once `response.completed` arrives.

use std::time::Duration;

use super::streaming::{self, SseBuffer, StreamEvent, StreamSender};
use super::{AiError, ChatMessage, ImageInput};

pub const OPENAI_API_BASE: &str = "https://api.openai.com";
pub const NON_STREAM_MAX_OUTPUT_TOKENS: u32 = 16_000;
pub const STREAM_MAX_OUTPUT_TOKENS: u32 = 32_000;

pub const DEFAULT_MODEL: &str = "gpt-6.1-sol";
pub const DEFAULT_EFFORT: &str = "medium";
/// Every level the API knows; `none` is further restricted per model.
pub const EFFORTS: [&str; 6] = ["none", "low", "medium", "high", "xhigh", "max"];

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(120);
const NON_STREAM_READ_TIMEOUT: Duration = Duration::from_secs(600);

/// True when `base` is OpenAI's own API (`https://api.openai.com`, with or
/// without `/v1`, any trailing slash or letter case). Other OpenAI-compatible
/// servers (OpenRouter, Groq, Ollama, LM Studio, custom) keep Chat Completions.
pub fn is_openai_own_base_url(base: &str) -> bool {
    let b = base.trim().trim_end_matches('/').to_ascii_lowercase();
    let b = b.strip_suffix("/v1").unwrap_or(&b);
    b == "https://api.openai.com"
}

pub fn responses_url(base: &str) -> String {
    let b = base.trim().trim_end_matches('/');
    if b.ends_with("/responses") {
        b.to_string()
    } else if b.ends_with("/v1") {
        format!("{b}/responses")
    } else {
        format!("{b}/v1/responses")
    }
}

/// GPT-6 models and what they accept for `reasoning.effort`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModelTraits {
    pub allows_none: bool,
}

pub fn model_traits(model: &str) -> Option<ModelTraits> {
    match model {
        "gpt-6-astra" | "gpt-6.1-sol" => Some(ModelTraits { allows_none: false }),
        "gpt-6.1-terra" | "gpt-6-luna" => Some(ModelTraits { allows_none: true }),
        _ => None,
    }
}

/// Validate an effort for a model. Unknown (third-party / hand-typed) models
/// accept any known level because the value is never sent for them.
pub fn validate_effort(model: &str, effort: &str) -> Result<(), String> {
    let e = effort.trim().to_ascii_lowercase();
    if !EFFORTS.contains(&e.as_str()) {
        return Err(format!(
            "unknown reasoning effort '{effort}' (use none, low, medium, high, xhigh or max)"
        ));
    }
    if e == "none" {
        if let Some(t) = model_traits(model) {
            if !t.allows_none {
                return Err(format!(
                    "{model} does not support reasoning effort 'none' (use low or higher)"
                ));
            }
        }
    }
    Ok(())
}

/// The effort actually sent: `None` for models without reasoning control,
/// otherwise the configured level clamped to what the model allows.
pub fn effective_effort(model: &str, effort: &str) -> Option<String> {
    let traits = model_traits(model)?;
    let e = effort.trim().to_ascii_lowercase();
    if !EFFORTS.contains(&e.as_str()) {
        return Some(DEFAULT_EFFORT.into());
    }
    if e == "none" && !traits.allows_none {
        return Some("low".into());
    }
    Some(e)
}

/// Fields the ChatGPT-plan route rejects or must not receive.
pub const PLAN_FORBIDDEN_FIELDS: [&str; 14] = [
    "background",
    "conversation",
    "max_output_tokens",
    "max_tool_calls",
    "metadata",
    "moderation",
    "prompt",
    "prompt_cache_retention",
    "safety_identifier",
    "temperature",
    "top_logprobs",
    "top_p",
    "truncation",
    "user",
];

#[derive(Debug, Clone, Default)]
pub struct BodyOptions {
    pub effort: Option<String>,
    /// ChatGPT plan route: strip forbidden fields, `store:false`, `stream:true`.
    pub plan: bool,
}

/// Responses `input` items from chat history (no system items: those are
/// folded into `instructions`). Images attach to the last user message only.
fn input_items(messages: &[ChatMessage], images: &[ImageInput]) -> Vec<serde_json::Value> {
    let convo: Vec<&ChatMessage> = messages.iter().filter(|m| m.role != "system").collect();
    let last_user_idx = convo.iter().rposition(|m| m.role == "user");
    convo
        .iter()
        .enumerate()
        .map(|(idx, msg)| {
            if msg.role == "assistant" {
                return serde_json::json!({
                    "role": "assistant",
                    "content": [{ "type": "output_text", "text": msg.content }]
                });
            }
            let mut parts = vec![serde_json::json!({ "type": "input_text", "text": msg.content })];
            if Some(idx) == last_user_idx {
                for img in images {
                    parts.push(serde_json::json!({
                        "type": "input_image",
                        "image_url": format!("data:{};base64,{}", img.media_type, img.data)
                    }));
                }
            }
            serde_json::json!({ "role": "user", "content": parts })
        })
        .collect()
}

/// Pure body builder.
pub fn build_body(
    stable_instructions: &str,
    messages: &[ChatMessage],
    model: &str,
    images: &[ImageInput],
    stream: bool,
    opts: &BodyOptions,
) -> serde_json::Value {
    let mut instructions = stable_instructions.to_string();
    for m in messages.iter().filter(|m| m.role == "system") {
        if !instructions.is_empty() {
            instructions.push_str("\n\n");
        }
        instructions.push_str(&m.content);
    }

    let mut body = serde_json::json!({
        "model": model,
        "input": input_items(messages, images),
        "store": false,
        "stream": stream,
    });
    if !instructions.is_empty() {
        body["instructions"] = serde_json::json!(instructions);
    }
    if let Some(effort) = &opts.effort {
        body["reasoning"] = serde_json::json!({ "effort": effort });
    }
    if opts.plan {
        sanitize_for_plan(&mut body);
    } else {
        body["max_output_tokens"] = serde_json::json!(if stream {
            STREAM_MAX_OUTPUT_TOKENS
        } else {
            NON_STREAM_MAX_OUTPUT_TOKENS
        });
    }
    body
}

/// Enforce the plan route's contract on any body.
pub fn sanitize_for_plan(body: &mut serde_json::Value) {
    if let Some(obj) = body.as_object_mut() {
        for f in PLAN_FORBIDDEN_FIELDS {
            obj.remove(f);
        }
        obj.remove("previous_response_id");
        obj.insert("store".into(), serde_json::json!(false));
        obj.insert("stream".into(), serde_json::json!(true));
    }
}

/// A non-2xx answer reduced to the parts that are safe to interpret.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct HttpFailure {
    pub status: u16,
    pub code: String,
    pub param: String,
}

impl HttpFailure {
    /// Parse `{"error":{"code","param"}}`. Pre-stream 401/403/503 can instead
    /// carry `{"detail": ...}`, which is deliberately ignored (status only).
    pub fn from_body(status: u16, body: &str) -> Self {
        let json = serde_json::from_str::<serde_json::Value>(body).unwrap_or_default();
        let err = json.get("error");
        let pick = |key: &str| -> String {
            err.and_then(|e| e.get(key))
                .and_then(|v| v.as_str())
                .map(sanitize_token)
                .unwrap_or_default()
        };
        let mut code = pick("code");
        if code.is_empty() {
            code = err
                .and_then(|e| e.as_str())
                .map(sanitize_token)
                .unwrap_or_default();
        }
        Self {
            status,
            code,
            param: pick("param"),
        }
    }
}

/// Keep only identifier-like characters so API-supplied strings can be
/// placed in messages and logs without echoing arbitrary content.
fn sanitize_token(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-' | '[' | ']'))
        .take(64)
        .collect()
}

pub const USAGE_URL: &str = "https://chatgpt.com/settings/usage";

/// Plain-language message for an API / plan error code (and HTTP status when
/// the code is missing). Never echoes response text.
pub fn friendly_error(code: &str, param: &str, status: u16) -> String {
    match code {
        "subscription_sharing_usage_limit_exceeded" => format!(
            "You've reached your ChatGPT plan's usage limit for other apps. Check it at {USAGE_URL}, or switch to an API key."
        ),
        "subscription_sharing_usage_unavailable" | "subscription_sharing_user_unavailable" => {
            "ChatGPT plan usage is temporarily unavailable. Try again in a moment.".into()
        }
        "subscription_sharing_user_not_eligible" => {
            "This ChatGPT account can't use its plan in other apps. Use an API key instead.".into()
        }
        "subscription_sharing_unsupported_capability" => {
            if param.is_empty() {
                "ChatGPT plan usage doesn't support something in this request.".into()
            } else {
                format!("ChatGPT plan usage doesn't support '{param}' in this request.")
            }
        }
        "subscription_sharing_route_not_supported" => {
            "ChatGPT plan usage doesn't support this kind of request.".into()
        }
        "subscription_sharing_invalid_user" => {
            "ChatGPT didn't accept this sign-in. Sign in again in AI Providers.".into()
        }
        "chatpass_v2_scope_not_authorized" | "chatpass_v2_invalid_authorization_context" => {
            "This ChatGPT sign-in doesn't have permission to use your plan. Sign in again and allow plan usage.".into()
        }
        "invalid_api_key" => "OpenAI rejected the API key. Check it in AI Providers.".into(),
        "insufficient_quota" => "The OpenAI account is out of credit or quota.".into(),
        "rate_limit_exceeded" => "OpenAI's rate limit was reached. Wait a moment and try again.".into(),
        "model_not_found" => {
            "OpenAI couldn't find that model. Pick another in AI Providers.".into()
        }
        "context_length_exceeded" => {
            "The conversation is too long for this model. Start a new chat or use fewer screenshots.".into()
        }
        _ => match status {
            401 => "OpenAI didn't accept the credentials (401). Check your API key, or sign in with ChatGPT again.".into(),
            403 => "OpenAI refused the request (403).".into(),
            404 => "OpenAI couldn't find that model or endpoint (404). Pick another model in AI Providers.".into(),
            413 => "The request was too large (413). Use a shorter conversation or fewer screenshots.".into(),
            429 => "OpenAI's rate limit was reached (429). Wait a moment and try again.".into(),
            500..=599 => format!("OpenAI is having trouble right now ({status}). Try again shortly."),
            0 => "OpenAI reported an error.".into(),
            s => format!("OpenAI rejected the request ({s})."),
        },
    }
}

pub fn failure_message(f: &HttpFailure) -> String {
    friendly_error(&f.code, &f.param, f.status)
}

/// Read a failed response down to an [`HttpFailure`] (body is dropped).
pub async fn read_failure(response: reqwest::Response) -> HttpFailure {
    let status = response.status().as_u16();
    let body = response.text().await.unwrap_or_default();
    HttpFailure::from_body(status, &body)
}

pub fn build_client(streaming: bool) -> Result<reqwest::Client, AiError> {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .read_timeout(if streaming {
            STREAM_IDLE_TIMEOUT
        } else {
            NON_STREAM_READ_TIMEOUT
        })
        .build()
        .map_err(|e| AiError::Network(e.to_string()))
}

pub fn network_message(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        "Timed out waiting for OpenAI. Check your connection and try again.".into()
    } else if e.is_connect() {
        "Couldn't reach OpenAI. Check your internet connection.".into()
    } else {
        "Network problem talking to OpenAI.".into()
    }
}

/// Text of a non-streaming Responses object (`status` must be `completed`).
pub fn parse_response_object(json: &serde_json::Value) -> Result<String, AiError> {
    match json.get("status").and_then(|s| s.as_str()) {
        Some("completed") | None => {}
        Some("incomplete") => {
            return Err(AiError::Api(incomplete_message(
                json.pointer("/incomplete_details/reason").and_then(|r| r.as_str()),
            )))
        }
        Some(_) => {
            let code = json.pointer("/error/code").and_then(|c| c.as_str()).unwrap_or("");
            return Err(AiError::Api(friendly_error(&sanitize_token(code), "", 0)));
        }
    }
    Ok(output_text(json))
}

/// Concatenate `output_text` parts of `message` output items (reasoning
/// items and everything else are skipped).
pub fn output_text(response: &serde_json::Value) -> String {
    let mut text = String::new();
    if let Some(items) = response.get("output").and_then(|o| o.as_array()) {
        for item in items.iter().filter(|i| i.get("type").and_then(|t| t.as_str()) == Some("message")) {
            if let Some(parts) = item.get("content").and_then(|c| c.as_array()) {
                for p in parts.iter().filter(|p| p.get("type").and_then(|t| t.as_str()) == Some("output_text")) {
                    if let Some(t) = p.get("text").and_then(|t| t.as_str()) {
                        text.push_str(t);
                    }
                }
            }
        }
    }
    text
}

fn incomplete_message(reason: Option<&str>) -> String {
    match reason {
        Some("max_output_tokens") => {
            "The reply was cut off because the model ran out of output space.".into()
        }
        Some("content_filter") => "The reply was stopped by a content filter.".into(),
        _ => "The model stopped before finishing its reply.".into(),
    }
}

/// Incremental interpreter for Responses SSE events.
#[derive(Debug, Default)]
pub struct ResponsesStreamState {
    full_text: String,
    done: bool,
}

impl ResponsesStreamState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_done(&self) -> bool {
        self.done
    }

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
        match kind {
            "response.output_text.delta" => match json.get("delta").and_then(|d| d.as_str()) {
                Some(d) if !d.is_empty() => {
                    self.full_text.push_str(d);
                    vec![StreamEvent::TextDelta {
                        text: d.to_string(),
                        session_id: None,
                    }]
                }
                _ => vec![],
            },
            "response.completed" => {
                self.done = true;
                if self.full_text.is_empty() {
                    if let Some(resp) = json.get("response") {
                        let text = output_text(resp);
                        if !text.is_empty() {
                            self.full_text = text;
                        }
                    }
                }
                vec![
                    StreamEvent::TextDone {
                        text: std::mem::take(&mut self.full_text),
                        session_id: None,
                    },
                    StreamEvent::Done { session_id: None },
                ]
            }
            "response.incomplete" => {
                self.done = true;
                let reason = json
                    .pointer("/response/incomplete_details/reason")
                    .and_then(|r| r.as_str());
                vec![error_event(incomplete_message(reason))]
            }
            "response.failed" => {
                self.done = true;
                let code = json
                    .pointer("/response/error/code")
                    .and_then(|c| c.as_str())
                    .unwrap_or("");
                vec![error_event(friendly_error(&sanitize_token(code), "", 0))]
            }
            "error" => {
                self.done = true;
                // Either {"type":"error","code":..} or {"type":"error","error":{"code":..}}.
                let pick = |key: &str| -> String {
                    json.get(key)
                        .or_else(|| json.get("error").and_then(|e| e.get(key)))
                        .and_then(|v| v.as_str())
                        .map(sanitize_token)
                        .unwrap_or_default()
                };
                vec![error_event(friendly_error(&pick("code"), &pick("param"), 0))]
            }
            _ => vec![],
        }
    }

    /// The byte stream ended: without `response.completed` the request did
    /// not succeed.
    pub fn finish(&mut self) -> Vec<StreamEvent> {
        if self.done {
            return vec![];
        }
        self.done = true;
        vec![error_event(
            "The connection to OpenAI ended before the reply finished. Try again.".into(),
        )]
    }
}

fn error_event(message: String) -> StreamEvent {
    StreamEvent::Error {
        message,
        session_id: None,
    }
}

/// Pump a successful streaming response into `sender`.
pub async fn forward_stream(response: reqwest::Response, sender: &StreamSender) {
    use futures_util::StreamExt;
    let mut stream = response.bytes_stream();
    let mut sse = SseBuffer::new();
    let mut state = ResponsesStreamState::new();
    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(c) => c,
            Err(e) => {
                let _ = sender.send(error_event(network_message(&e))).await;
                return;
            }
        };
        for ev in sse.push(&chunk) {
            for out in state.handle(ev.event.as_deref(), &ev.data) {
                if sender.send(out).await.is_err() {
                    return;
                }
            }
            if state.is_done() {
                return;
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
}

/// Read a streaming response to the end and return the full text, for the
/// non-streaming `chat()` entry points of routes that must stream.
pub async fn collect_stream(response: reqwest::Response) -> Result<String, AiError> {
    let (sender, mut receiver) = streaming::create_channel();
    let pump = tokio::spawn(async move { forward_stream(response, &sender).await });
    let mut result: Result<String, AiError> =
        Err(AiError::Decode("the reply ended without any content".into()));
    while let Some(ev) = receiver.recv().await {
        match ev {
            StreamEvent::TextDone { text, .. } => result = Ok(text),
            StreamEvent::Error { message, .. } => {
                result = Err(AiError::Api(message));
                break;
            }
            StreamEvent::Done { .. } => break,
            StreamEvent::TextDelta { .. } => {}
        }
    }
    pump.abort();
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(role: &str, content: &str) -> ChatMessage {
        ChatMessage {
            role: role.into(),
            content: content.into(),
        }
    }

    fn feed(raw: &str) -> Vec<StreamEvent> {
        let mut sse = SseBuffer::new();
        let mut state = ResponsesStreamState::new();
        let mut out = Vec::new();
        for ev in sse.push(raw.as_bytes()).into_iter().chain(sse.finish()) {
            out.extend(state.handle(ev.event.as_deref(), &ev.data));
        }
        out.extend(state.finish());
        out
    }

    #[test]
    fn own_base_url_detection() {
        for u in [
            "https://api.openai.com",
            "https://api.openai.com/",
            "https://api.openai.com/v1",
            "https://API.OPENAI.COM/v1/",
        ] {
            assert!(is_openai_own_base_url(u), "{u}");
        }
        for u in [
            "https://openrouter.ai/api/v1",
            "https://api.groq.com/openai/v1",
            "http://localhost:11434/v1",
            "https://api.openai.com.evil.example/v1",
            "http://api.openai.com",
            "",
        ] {
            assert!(!is_openai_own_base_url(u), "{u}");
        }
        assert_eq!(responses_url("https://api.openai.com"), "https://api.openai.com/v1/responses");
        assert_eq!(responses_url("https://api.openai.com/v1/"), "https://api.openai.com/v1/responses");
    }

    #[test]
    fn effort_rules_per_model() {
        assert!(validate_effort("gpt-6.1-sol", "none").is_err());
        assert!(validate_effort("gpt-6-astra", "none").is_err());
        assert!(validate_effort("gpt-6.1-terra", "none").is_ok());
        assert!(validate_effort("gpt-6-luna", "none").is_ok());
        assert!(validate_effort("gpt-6.1-sol", "max").is_ok());
        assert!(validate_effort("gpt-6.1-sol", "turbo").is_err());
        assert!(validate_effort("some-other-model", "none").is_ok());
        assert_eq!(effective_effort("gpt-6.1-sol", "none").as_deref(), Some("low"));
        assert_eq!(effective_effort("gpt-6-luna", "none").as_deref(), Some("none"));
        assert_eq!(effective_effort("gpt-4.1", "high"), None);
    }

    #[test]
    fn api_key_body_shape() {
        let msgs = [msg("system", "ctx"), msg("user", "hi"), msg("assistant", "yo"), msg("user", "see")];
        let imgs = [ImageInput { media_type: "image/png".into(), data: "QUJD".into() }];
        let opts = BodyOptions { effort: Some("high".into()), plan: false };
        let body = build_body("stable", &msgs, "gpt-6.1-sol", &imgs, false, &opts);
        assert_eq!(body["instructions"], "stable\n\nctx");
        assert_eq!(body["reasoning"]["effort"], "high");
        assert_eq!(body["max_output_tokens"], 16_000);
        assert_eq!(body["store"], false);
        assert_eq!(body["stream"], false);
        let input = body["input"].as_array().expect("input array");
        assert_eq!(input.len(), 3, "system items are folded into instructions");
        assert_eq!(input[1]["content"][0]["type"], "output_text");
        assert_eq!(input[2]["content"][1]["type"], "input_image");
        assert_eq!(input[2]["content"][1]["image_url"], "data:image/png;base64,QUJD");
        assert!(input[0]["content"][0]["type"] == "input_text");
        assert!(input.iter().all(|i| i["role"] != "system"));
    }

    #[test]
    fn plan_body_omits_forbidden_fields_and_streams_without_storing() {
        let opts = BodyOptions { effort: Some("medium".into()), plan: true };
        let body = build_body("sys", &[msg("user", "hi")], "gpt-6.1-sol", &[], false, &opts);
        assert_eq!(body["store"], false);
        assert_eq!(body["stream"], true);
        let obj = body.as_object().expect("object");
        for f in PLAN_FORBIDDEN_FIELDS {
            assert!(!obj.contains_key(f), "{f}");
        }
        assert!(!obj.contains_key("previous_response_id"));
        assert_eq!(body["instructions"], "sys");

        // sanitize_for_plan also repairs a hostile body.
        let mut dirty = serde_json::json!({
            "model": "m", "input": [], "store": true, "stream": false,
            "temperature": 1, "user": "u", "previous_response_id": "r", "max_output_tokens": 5,
            "metadata": {}, "truncation": "auto", "top_p": 1
        });
        sanitize_for_plan(&mut dirty);
        assert_eq!(dirty["store"], false);
        assert_eq!(dirty["stream"], true);
        for f in ["temperature", "user", "previous_response_id", "max_output_tokens", "metadata", "truncation", "top_p"] {
            assert!(dirty.get(f).is_none(), "{f}");
        }
    }

    #[test]
    fn sse_deltas_then_completed() {
        let raw = concat!(
            "event: response.created\ndata: {\"type\":\"response.created\",\"response\":{}}\n\n",
            "event: response.reasoning_summary_text.delta\ndata: {\"type\":\"response.reasoning_summary_text.delta\",\"delta\":\"hidden\"}\n\n",
            "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"Hel\"}\n\n",
            "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"lo\"}\n\n",
            "event: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\"}}\n\n",
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
    }

    #[test]
    fn sse_completed_without_deltas_uses_output_items() {
        let raw = "data: {\"type\":\"response.completed\",\"response\":{\"output\":[{\"type\":\"reasoning\"},{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"whole\"}]}]}}\n\n";
        let events = feed(raw);
        assert!(events.iter().any(|e| matches!(e, StreamEvent::TextDone { text, .. } if text == "whole")));
    }

    #[test]
    fn sse_failed_incomplete_and_error_events() {
        let failed = feed("data: {\"type\":\"response.failed\",\"response\":{\"error\":{\"code\":\"subscription_sharing_usage_limit_exceeded\",\"message\":\"private\"}}}\n\n");
        assert!(matches!(&failed[0], StreamEvent::Error { message, .. } if message.contains("chatgpt.com/settings/usage") && !message.contains("private")));

        let incomplete = feed("data: {\"type\":\"response.incomplete\",\"response\":{\"incomplete_details\":{\"reason\":\"max_output_tokens\"}}}\n\n");
        assert!(matches!(&incomplete[0], StreamEvent::Error { message, .. } if message.contains("output space")));

        let err = feed("event: error\ndata: {\"type\":\"error\",\"code\":\"subscription_sharing_unsupported_capability\",\"param\":\"tools\",\"message\":\"x\"}\n\n");
        assert!(matches!(&err[0], StreamEvent::Error { message, .. } if message.contains("'tools'")));

        let nested = feed("data: {\"type\":\"error\",\"error\":{\"code\":\"insufficient_quota\"}}\n\n");
        assert!(matches!(&nested[0], StreamEvent::Error { message, .. } if message.contains("credit")));
    }

    #[test]
    fn stream_without_completed_is_an_error() {
        let events = feed("data: {\"type\":\"response.output_text.delta\",\"delta\":\"part\"}\n\n");
        assert!(matches!(events.last(), Some(StreamEvent::Error { .. })));
    }

    #[test]
    fn plan_error_codes_map_to_friendly_text() {
        let limit = friendly_error("subscription_sharing_usage_limit_exceeded", "", 429);
        assert!(limit.contains("https://chatgpt.com/settings/usage"));
        assert!(!limit.to_lowercase().contains("reset"));
        assert!(friendly_error("subscription_sharing_usage_unavailable", "", 503).contains("temporarily"));
        assert!(friendly_error("subscription_sharing_user_unavailable", "", 503).contains("temporarily"));
        assert!(friendly_error("subscription_sharing_user_not_eligible", "", 403).contains("API key"));
        assert!(friendly_error("subscription_sharing_unsupported_capability", "tools", 400).contains("'tools'"));
        assert!(friendly_error("subscription_sharing_route_not_supported", "", 403).contains("doesn't support"));
        assert!(friendly_error("subscription_sharing_invalid_user", "", 401).contains("Sign in again"));
        assert!(friendly_error("chatpass_v2_scope_not_authorized", "", 403).contains("permission"));
        assert!(friendly_error("chatpass_v2_invalid_authorization_context", "", 403).contains("permission"));
        assert!(friendly_error("", "", 503).contains("503"));
    }

    #[test]
    fn http_failure_parsing_ignores_detail_bodies() {
        let f = HttpFailure::from_body(429, r#"{"error":{"code":"subscription_sharing_usage_limit_exceeded","param":null,"message":"secret"}}"#);
        assert_eq!(f.code, "subscription_sharing_usage_limit_exceeded");
        assert!(!failure_message(&f).contains("secret"));
        let bare = HttpFailure::from_body(503, r#"{"detail":"upstream said something private"}"#);
        assert_eq!(bare.code, "");
        assert!(!failure_message(&bare).contains("private"));
        assert_eq!(HttpFailure::from_body(401, "not json").status, 401);
    }

    #[test]
    fn non_streaming_object_requires_completed() {
        let ok = serde_json::json!({"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"hi"}]}]});
        assert_eq!(parse_response_object(&ok).ok().as_deref(), Some("hi"));
        let inc = serde_json::json!({"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"}});
        assert!(parse_response_object(&inc).is_err());
        let failed = serde_json::json!({"status":"failed","error":{"code":"invalid_api_key"}});
        assert!(parse_response_object(&failed).is_err());
    }
}
