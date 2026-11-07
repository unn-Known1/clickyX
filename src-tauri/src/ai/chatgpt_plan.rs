//! OpenAI inference on the user's ChatGPT plan ("Sign in with ChatGPT").
//!
//! `POST https://api.openai.com/v1/responses` with the plan access token as
//! the bearer. The plan route is stricter than the API-key route: every
//! request must be `store:false` + `stream:true` (so `chat()` streams and
//! collects), a list of fields must be omitted, the system prompt goes in
//! `instructions`, and audio / transcription / realtime are unavailable.
//!
//! Failure policy: a 401 triggers exactly one token refresh and one retry;
//! 503 "plan usage unavailable" retries with backoff; everything else maps to
//! a friendly message. OAuth is never re-run from here.

use std::sync::Arc;
use std::time::Duration;

use super::catalog::ModelInfo;
use super::responses::{self, BodyOptions, HttpFailure};
use super::streaming::{self, StreamEvent};
use super::{AiError, AiProvider, ChatMessage, ImageInput};
use crate::auth::chatgpt::{ChatGptAuth, ChatGptError};

/// Backoff before each retry of a transient 503.
const DEFAULT_RETRY_DELAYS: [Duration; 2] = [Duration::from_secs(1), Duration::from_secs(3)];

pub struct ChatGptPlanProvider {
    auth: Arc<ChatGptAuth>,
    system_prompt: String,
    effort: String,
    retry_delays: Vec<Duration>,
}

impl ChatGptPlanProvider {
    pub fn new(auth: Arc<ChatGptAuth>, system_prompt: String, effort: &str) -> Self {
        Self {
            auth,
            system_prompt,
            effort: effort.to_string(),
            retry_delays: DEFAULT_RETRY_DELAYS.to_vec(),
        }
    }

    #[cfg(test)]
    fn without_backoff(mut self) -> Self {
        self.retry_delays = vec![Duration::ZERO, Duration::ZERO];
        self
    }

    fn body(&self, messages: &[ChatMessage], model: &str, images: &[ImageInput]) -> serde_json::Value {
        let opts = BodyOptions {
            effort: responses::effective_effort(model, &self.effort),
            plan: true,
        };
        responses::build_body(&self.system_prompt, messages, model, images, true, &opts)
    }

    /// Send the request; returns the open SSE response.
    async fn open(&self, body: &serde_json::Value) -> Result<reqwest::Response, AiError> {
        let url = responses::responses_url(self.auth.api_base());
        let client = responses::build_client(true)?;
        let mut token = self.auth.access_token().await.map_err(auth_error)?;
        let mut refreshed = false;
        let mut retries = 0usize;
        loop {
            let response = client
                .post(&url)
                .header("Authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .header("accept", "text/event-stream")
                .json(body)
                .send()
                .await
                .map_err(|e| AiError::Network(responses::network_message(&e)))?;
            if response.status().is_success() {
                return Ok(response);
            }
            let failure = responses::read_failure(response).await;
            log::warn!(
                "ChatGPT plan request failed: HTTP {} code={}",
                failure.status,
                if failure.code.is_empty() { "none" } else { &failure.code }
            );
            if failure.status == 401 && !refreshed {
                refreshed = true;
                token = self
                    .auth
                    .refresh_after_unauthorized(&token)
                    .await
                    .map_err(auth_error)?;
                continue;
            }
            if is_transient(&failure) && retries < self.retry_delays.len() {
                tokio::time::sleep(self.retry_delays[retries]).await;
                retries += 1;
                continue;
            }
            return Err(AiError::Api(plan_failure_message(&failure)));
        }
    }
}

fn auth_error(e: ChatGptError) -> AiError {
    match e {
        ChatGptError::Network(_) | ChatGptError::RefreshFailed(_) => AiError::Network(e.to_string()),
        other => AiError::Config(other.to_string()),
    }
}

/// 503s (plan usage / user briefly unavailable) are worth a backoff retry.
fn is_transient(f: &HttpFailure) -> bool {
    f.status == 503
        && (f.code.is_empty()
            || f.code == "subscription_sharing_usage_unavailable"
            || f.code == "subscription_sharing_user_unavailable")
}

/// Friendly text for a failed plan request. A bare 401 (no code) means the
/// token was refused even after a refresh.
fn plan_failure_message(f: &HttpFailure) -> String {
    if f.code.is_empty() && f.status == 401 {
        return "ChatGPT didn't accept this sign-in. Sign in again in AI Providers.".into();
    }
    if f.code.is_empty() && f.status == 403 {
        return "ChatGPT refused to let ClickyX use your plan (403). Sign in again and allow plan usage, or use an API key.".into();
    }
    responses::failure_message(f)
}

#[async_trait::async_trait]
impl AiProvider for ChatGptPlanProvider {
    async fn chat(&self, messages: &[ChatMessage], model: &str) -> Result<String, AiError> {
        self.chat_with_vision(messages, model, &[]).await
    }

    async fn chat_stream(
        &self,
        messages: &[ChatMessage],
        model: &str,
    ) -> Result<streaming::StreamReceiver, AiError> {
        let body = self.body(messages, model, &[]);
        let (sender, receiver) = streaming::create_channel();
        match self.open(&body).await {
            Ok(response) => {
                tokio::spawn(async move { responses::forward_stream(response, &sender).await });
            }
            Err(e) => {
                let message = match e {
                    AiError::Api(m) | AiError::Network(m) | AiError::Decode(m) | AiError::Config(m) => m,
                };
                let _ = sender
                    .send(StreamEvent::Error {
                        message,
                        session_id: None,
                    })
                    .await;
            }
        }
        Ok(receiver)
    }

    /// The plan route only streams, so the "non-streaming" call streams and
    /// collects.
    async fn chat_with_vision(
        &self,
        messages: &[ChatMessage],
        model: &str,
        images: &[ImageInput],
    ) -> Result<String, AiError> {
        let body = self.body(messages, model, images);
        let response = self.open(&body).await?;
        responses::collect_stream(response).await
    }
}

/// Parse a `GET /v1/models` body in either shape: the plan route's
/// top-level `models` array (keep `visibility == "list"`, id = `slug`) or the
/// standard `data[].id` list (chat-capable ids only).
pub fn parse_plan_models(json: &serde_json::Value) -> Vec<ModelInfo> {
    let caps = || vec!["chat".to_string(), "vision".to_string(), "streaming".to_string()];
    let mut out: Vec<ModelInfo> = Vec::new();
    let mut push = |id: &str, name: Option<&str>| {
        if !id.is_empty() && !out.iter().any(|m| m.id == id) {
            out.push(ModelInfo {
                id: id.to_string(),
                provider: "openai".into(),
                name: name.filter(|n| !n.is_empty()).unwrap_or(id).to_string(),
                capabilities: caps(),
            });
        }
    };
    if let Some(models) = json.get("models").and_then(|m| m.as_array()) {
        for m in models {
            // Hidden entries carry another visibility; an absent field is kept.
            let visible = m
                .get("visibility")
                .and_then(|v| v.as_str())
                .is_none_or(|v| v == "list");
            let id = m
                .get("slug")
                .or_else(|| m.get("id"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if visible {
                push(id, m.get("display_name").and_then(|v| v.as_str()));
            }
        }
    } else if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
        for m in data {
            let id = m.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if is_chat_model_id(id) {
                push(id, None);
            }
        }
    }
    out
}

/// Chat-capable ids from the standard list (drops audio / image / embedding ones).
fn is_chat_model_id(id: &str) -> bool {
    let starts = id.starts_with("gpt-")
        || (id.starts_with('o') && id.chars().nth(1).is_some_and(|c| c.is_ascii_digit()));
    let excluded = ["audio", "realtime", "transcribe", "tts", "image", "embedding", "search"]
        .iter()
        .any(|w| id.contains(w));
    starts && !excluded
}

/// List models available to the signed-in plan.
pub async fn list_models(auth: &ChatGptAuth) -> Result<Vec<ModelInfo>, AiError> {
    let token = auth.access_token().await.map_err(auth_error)?;
    let client = responses::build_client(false)?;
    let url = format!("{}/v1/models", auth.api_base().trim_end_matches('/'));
    let response = client
        .get(url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| AiError::Network(responses::network_message(&e)))?;
    if !response.status().is_success() {
        let failure = responses::read_failure(response).await;
        return Err(AiError::Api(plan_failure_message(&failure)));
    }
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| AiError::Decode(e.to_string()))?;
    Ok(parse_plan_models(&json))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::chatgpt::{Endpoints, PLAN_SCOPE};
    use crate::secret_store::{keys, MemoryStore, SecretStore};
    use crate::test_support::{MockResponse, MockServer};
    use std::sync::Mutex;

    const OK_SSE: &str = "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"hi\"}\n\nevent: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{}}\n\n";

    fn msg(text: &str) -> ChatMessage {
        ChatMessage {
            role: "user".into(),
            content: text.into(),
        }
    }

    fn seed(store: &MemoryStore, access: &str, scope: &str) {
        let tokens = serde_json::json!({
            "access_token": access, "refresh_token": "rt-0", "id_token": null,
            "token_type": "Bearer", "expires_at": u64::MAX / 2, "scope": scope
        });
        store.set(keys::CHATGPT_TOKENS, &tokens.to_string()).expect("seed");
    }

    fn provider(server: &MockServer, store: Arc<MemoryStore>) -> ChatGptPlanProvider {
        let endpoints = Endpoints {
            token_url: format!("{}/token", server.base_url),
            api_base: server.base_url.clone(),
            ..Endpoints::default()
        };
        let auth = Arc::new(ChatGptAuth::new(store, endpoints, Some("oaiapp_1".into())));
        ChatGptPlanProvider::new(auth, "be helpful".into(), "high").without_backoff()
    }

    #[tokio::test]
    async fn plan_request_is_stateless_streaming_and_free_of_forbidden_fields() {
        let server = MockServer::start(|_| MockResponse::sse(OK_SSE)).await;
        let store = Arc::new(MemoryStore::new_available());
        seed(&store, "plan-token", PLAN_SCOPE);
        let p = provider(&server, store);
        // Non-streaming entry point streams under the hood and collects.
        let out = p.chat(&[msg("hello")], "gpt-6.1-sol").await;
        assert_eq!(out.ok().as_deref(), Some("hi"));
        let reqs = server.requests();
        assert_eq!(reqs.len(), 1);
        assert_eq!(reqs[0].path, "/v1/responses");
        assert_eq!(reqs[0].header("authorization"), Some("Bearer plan-token"));
        let body = reqs[0].json();
        assert_eq!(body["store"], false);
        assert_eq!(body["stream"], true);
        assert_eq!(body["instructions"], "be helpful");
        assert_eq!(body["reasoning"]["effort"], "high");
        let obj = body.as_object().expect("object");
        for f in responses::PLAN_FORBIDDEN_FIELDS {
            assert!(!obj.contains_key(f), "{f}");
        }
        assert!(!obj.contains_key("previous_response_id"));
        // No system-role items in input.
        assert!(body["input"].as_array().expect("input").iter().all(|i| i["role"] != "system"));
    }

    #[tokio::test]
    async fn unauthorized_refreshes_once_and_retries_once() {
        let tokens_seen = Arc::new(Mutex::new(Vec::<String>::new()));
        let seen = tokens_seen.clone();
        let server = MockServer::start(move |req| {
            if req.path == "/token" {
                return MockResponse::json(200, serde_json::json!({
                    "access_token": "fresh-token", "refresh_token": "rt-1", "expires_in": 3600, "scope": PLAN_SCOPE
                }));
            }
            let auth = req.header("authorization").unwrap_or("").to_string();
            seen.lock().expect("lock").push(auth.clone());
            if auth == "Bearer fresh-token" {
                MockResponse::sse(OK_SSE)
            } else {
                MockResponse::json(401, serde_json::json!({"error": {"code": "subscription_sharing_invalid_user"}}))
            }
        })
        .await;
        let store = Arc::new(MemoryStore::new_available());
        seed(&store, "stale-token", PLAN_SCOPE);
        let p = provider(&server, store);
        assert_eq!(p.chat(&[msg("x")], "gpt-6.1-sol").await.ok().as_deref(), Some("hi"));
        assert_eq!(*tokens_seen.lock().expect("lock"), vec!["Bearer stale-token", "Bearer fresh-token"]);
        assert_eq!(server.requests().iter().filter(|r| r.path == "/token").count(), 1);
    }

    #[tokio::test]
    async fn persistent_401_does_not_loop_oauth() {
        let server = MockServer::start(|req| {
            if req.path == "/token" {
                MockResponse::json(200, serde_json::json!({"access_token": "t2", "refresh_token": "rt", "expires_in": 3600, "scope": PLAN_SCOPE}))
            } else {
                MockResponse::json(401, serde_json::json!({"detail": "Unauthorized"}))
            }
        })
        .await;
        let store = Arc::new(MemoryStore::new_available());
        seed(&store, "t1", PLAN_SCOPE);
        let p = provider(&server, store);
        let err = p.chat(&[msg("x")], "gpt-6.1-sol").await.err().map(|e| e.to_string()).unwrap_or_default();
        assert!(err.contains("Sign in again"), "{err}");
        let reqs = server.requests();
        assert_eq!(reqs.iter().filter(|r| r.path == "/token").count(), 1, "exactly one refresh");
        assert_eq!(reqs.iter().filter(|r| r.path == "/v1/responses").count(), 2, "exactly one retry");
    }

    #[tokio::test]
    async fn plan_error_codes_become_friendly_messages_without_retries() {
        for (status, code, needle) in [
            (429u16, "subscription_sharing_usage_limit_exceeded", "https://chatgpt.com/settings/usage"),
            (403, "subscription_sharing_user_not_eligible", "can't use its plan"),
            (400, "subscription_sharing_unsupported_capability", "doesn't support"),
            (403, "subscription_sharing_route_not_supported", "doesn't support"),
            (403, "chatpass_v2_scope_not_authorized", "permission"),
            (403, "chatpass_v2_invalid_authorization_context", "permission"),
        ] {
            let server = MockServer::start(move |_| {
                MockResponse::json(status, serde_json::json!({"error": {"code": code, "param": "tools", "message": "user private text"}}))
            })
            .await;
            let store = Arc::new(MemoryStore::new_available());
            seed(&store, "tok", PLAN_SCOPE);
            let err = provider(&server, store).chat(&[msg("x")], "gpt-6.1-sol").await.err().map(|e| e.to_string()).unwrap_or_default();
            assert!(err.contains(needle), "{code}: {err}");
            assert!(!err.contains("private"), "{err}");
            assert_eq!(server.requests().len(), 1, "{code} must not retry");
        }
    }

    #[tokio::test]
    async fn unavailable_503_retries_with_backoff_then_succeeds() {
        let calls = Arc::new(Mutex::new(0u32));
        let c = calls.clone();
        let server = MockServer::start(move |_| {
            let mut n = c.lock().expect("lock");
            *n += 1;
            if *n < 3 {
                MockResponse::json(503, serde_json::json!({"error": {"code": "subscription_sharing_usage_unavailable"}}))
            } else {
                MockResponse::sse(OK_SSE)
            }
        })
        .await;
        let store = Arc::new(MemoryStore::new_available());
        seed(&store, "tok", PLAN_SCOPE);
        assert_eq!(provider(&server, store).chat(&[msg("x")], "gpt-6.1-sol").await.ok().as_deref(), Some("hi"));
        assert_eq!(*calls.lock().expect("lock"), 3);
    }

    #[tokio::test]
    async fn bare_503_with_detail_gives_up_after_the_backoff_budget() {
        let server = MockServer::start(|_| MockResponse::json(503, serde_json::json!({"detail": "upstream private"}))).await;
        let store = Arc::new(MemoryStore::new_available());
        seed(&store, "tok", PLAN_SCOPE);
        let err = provider(&server, store).chat(&[msg("x")], "gpt-6.1-sol").await.err().map(|e| e.to_string()).unwrap_or_default();
        assert!(err.contains("503") && !err.contains("private"), "{err}");
        assert_eq!(server.requests().len(), 3);
    }

    #[tokio::test]
    async fn disabled_plan_scope_and_signed_out_fail_before_any_request() {
        let server = MockServer::start(|_| MockResponse::sse(OK_SSE)).await;
        let store = Arc::new(MemoryStore::new_available());
        seed(&store, "tok", "openid profile");
        let err = provider(&server, store).chat(&[msg("x")], "gpt-6.1-sol").await.err().map(|e| e.to_string()).unwrap_or_default();
        assert!(err.contains("plan usage is not enabled"), "{err}");
        let empty = Arc::new(MemoryStore::new_available());
        let err = provider(&server, empty).chat(&[msg("x")], "gpt-6.1-sol").await.err().map(|e| e.to_string()).unwrap_or_default();
        assert!(err.contains("Sign in with ChatGPT"), "{err}");
        assert!(server.requests().is_empty());
    }

    #[tokio::test]
    async fn streaming_entry_point_emits_deltas_and_errors() {
        let server = MockServer::start(|_| MockResponse::sse(OK_SSE)).await;
        let store = Arc::new(MemoryStore::new_available());
        seed(&store, "tok", PLAN_SCOPE);
        let mut rx = provider(&server, store).chat_stream(&[msg("x")], "gpt-6-luna").await.expect("opens");
        let mut text = String::new();
        while let Some(ev) = rx.recv().await {
            match ev {
                StreamEvent::TextDelta { text: t, .. } => text.push_str(&t),
                StreamEvent::Done { .. } => break,
                StreamEvent::Error { message, .. } => panic!("{message}"),
                StreamEvent::TextDone { .. } => {}
            }
        }
        assert_eq!(text, "hi");

        let limited = MockServer::start(|_| MockResponse::json(429, serde_json::json!({"error": {"code": "subscription_sharing_usage_limit_exceeded"}}))).await;
        let store = Arc::new(MemoryStore::new_available());
        seed(&store, "tok", PLAN_SCOPE);
        let mut rx = provider(&limited, store).chat_stream(&[msg("x")], "gpt-6-luna").await.expect("opens");
        assert!(matches!(rx.recv().await, Some(StreamEvent::Error { message, .. }) if message.contains("settings/usage")));
    }

    #[tokio::test]
    async fn list_models_uses_the_plan_token() {
        let server = MockServer::start(|req| {
            assert_eq!(req.method, "GET");
            MockResponse::json(200, serde_json::json!({"models": [{"slug": "gpt-6.1-sol", "visibility": "list", "display_name": "GPT-6.1 Sol"}]}))
        })
        .await;
        let store = Arc::new(MemoryStore::new_available());
        seed(&store, "tok", PLAN_SCOPE);
        let endpoints = Endpoints { api_base: server.base_url.clone(), ..Endpoints::default() };
        let auth = ChatGptAuth::new(store, endpoints, Some("oaiapp_1".into()));
        let models = list_models(&auth).await.expect("models");
        assert_eq!(models.len(), 1);
        assert_eq!(server.requests()[0].header("authorization"), Some("Bearer tok"));
    }

    #[test]
    fn model_list_parses_the_plan_shape_and_the_standard_shape() {
        let plan = serde_json::json!({"models": [
            {"slug": "gpt-6.1-sol", "visibility": "list", "display_name": "GPT-6.1 Sol"},
            {"slug": "internal-thing", "visibility": "hide"},
            {"slug": "gpt-6-luna", "visibility": "list"},
            {"slug": "gpt-6-luna", "visibility": "list"}
        ]});
        let m = parse_plan_models(&plan);
        let ids: Vec<&str> = m.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(ids, vec!["gpt-6.1-sol", "gpt-6-luna"]);
        assert_eq!(m[0].name, "GPT-6.1 Sol");
        assert_eq!(m[1].name, "gpt-6-luna");

        let standard = serde_json::json!({"data": [
            {"id": "gpt-6-astra"}, {"id": "gpt-transcribe"}, {"id": "text-embedding-4"},
            {"id": "gpt-6-realtime"}, {"id": "o4-mini"}, {"id": "dall-e-4"}
        ]});
        let ids: Vec<String> = parse_plan_models(&standard).into_iter().map(|m| m.id).collect();
        assert_eq!(ids, vec!["gpt-6-astra", "o4-mini"]);
        assert!(parse_plan_models(&serde_json::json!({})).is_empty());
    }
}
