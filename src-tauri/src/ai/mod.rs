pub mod anthropic;
pub mod app_contexts;
pub mod catalog;
pub mod chatgpt_plan;
pub mod guidance;
pub mod jev;
pub mod migrate;
pub mod openai;
pub mod responses;
pub mod streaming;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageInput {
    pub media_type: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AiConfig {
    pub anthropic_api_key: Option<String>,
    pub anthropic_model: String,
    /// `output_config.effort` for Claude: low | medium | high | xhigh | max.
    pub anthropic_effort: String,
    pub openai_api_key: Option<String>,
    pub openai_model: String,
    /// `reasoning.effort` for OpenAI's own endpoint (none only on terra/luna).
    pub openai_effort: String,
    pub openai_base_url: String,
    /// How the OpenAI side authenticates: `api_key` (default) or `chatgpt`
    /// (Sign in with ChatGPT: runs on the user's plan, OpenAI's own endpoint).
    pub openai_auth_source: String,
    /// Issued OAuth client id from the first ChatGPT sign-in (set by the
    /// sign-in command, never by the UI). Not a secret.
    pub chatgpt_client_id: Option<String>,
    /// Email of the last ChatGPT account, used as `login_hint`.
    pub chatgpt_email: Option<String>,
    /// Stable opaque id of this computer (`urn:uuid:...`) for the sign-in flow.
    pub chatgpt_host_id: Option<String>,
    pub default_provider: String,
    pub system_prompt: String,
}

pub const AUTH_SOURCE_API_KEY: &str = "api_key";
pub const AUTH_SOURCE_CHATGPT: &str = "chatgpt";

impl AiConfig {
    pub fn uses_chatgpt_plan(&self) -> bool {
        self.openai_auth_source == AUTH_SOURCE_CHATGPT
    }
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            anthropic_api_key: None,
            anthropic_model: anthropic::DEFAULT_MODEL.into(),
            anthropic_effort: anthropic::DEFAULT_EFFORT.into(),
            openai_api_key: None,
            openai_model: responses::DEFAULT_MODEL.into(),
            openai_effort: responses::DEFAULT_EFFORT.into(),
            openai_base_url: "https://api.openai.com".into(),
            openai_auth_source: AUTH_SOURCE_API_KEY.into(),
            chatgpt_client_id: None,
            chatgpt_email: None,
            chatgpt_host_id: None,
            default_provider: "anthropic".into(),
            system_prompt: "You are ClickyX, a helpful AI assistant.".into(),
        }
    }
}

#[derive(Debug)]
pub enum AiError {
    Config(String),
    Api(String),
    Network(String),
    Decode(String),
}

impl std::fmt::Display for AiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AiError::Config(msg) => write!(f, "Configuration error: {msg}"),
            AiError::Api(msg) => write!(f, "API error: {msg}"),
            AiError::Network(msg) => write!(f, "Network error: {msg}"),
            AiError::Decode(msg) => write!(f, "Decode error: {msg}"),
        }
    }
}

impl std::error::Error for AiError {}

#[async_trait::async_trait]
pub trait AiProvider: Send + Sync {
    async fn chat(&self, messages: &[ChatMessage], model: &str) -> Result<String, AiError>;
    async fn chat_stream(
        &self,
        messages: &[ChatMessage],
        model: &str,
    ) -> Result<streaming::StreamReceiver, AiError>;
    async fn chat_with_vision(
        &self,
        messages: &[ChatMessage],
        model: &str,
        images: &[ImageInput],
    ) -> Result<String, AiError>;
}

pub const CUA_SYSTEM_PROMPT: &str = r#"
You have Computer Use capabilities. You can interact with the user's screen by outputting specific text tags in your response. 
- To click the mouse at specific coordinates, output: [POINT:x,y]
- To highlight an area on the screen, output: [HIGHLIGHT:x,y,w,h:optional_label]
- To draw an arrow or curve, output: [SHAPE:arrow:x1,y1:x2,y2:optional_label]
Only use these tags when you explicitly need to interact with the screen.
"#;

pub fn resolve_provider_for_model(model: &str) -> &str {
    let lower = model.to_ascii_lowercase();
    if lower.contains("jev") || lower.starts_with("typesafe/") || lower.starts_with("typesafe-ai/")
    {
        "jev"
    } else if model.contains("claude") || model.contains("anthropic") {
        "anthropic"
    } else {
        "openai"
    }
}

pub fn create_provider_for_model(
    config: &AiConfig,
    model: &str,
) -> Result<Box<dyn AiProvider>, AiError> {
    let provider_name = resolve_provider_for_model(model);
    let full_prompt = format!("{}\n{}", config.system_prompt, CUA_SYSTEM_PROMPT);
    match provider_name {
        "jev" => Err(AiError::Config(
            "Jev models are decision-only (choice/noul/score) — use JevClient::decide, not chat()"
                .into(),
        )),
        "anthropic" => {
            let api_key = config
                .anthropic_api_key
                .clone()
                .ok_or_else(|| AiError::Config("Anthropic API key not configured".into()))?;
            Ok(Box::new(
                anthropic::AnthropicProvider::new(api_key, full_prompt)
                    .with_effort(&config.anthropic_effort),
            ))
        }
        "openai" if config.uses_chatgpt_plan() => {
            // Plan usage only exists on OpenAI's own endpoint, whatever the
            // base URL says; tokens are read from the keychain per request.
            let auth = std::sync::Arc::new(crate::auth::chatgpt::ChatGptAuth::from_client_id(
                config.chatgpt_client_id.clone(),
            ));
            let status = auth.status();
            if !status.signed_in {
                return Err(AiError::Config(
                    crate::auth::chatgpt::ChatGptError::NotSignedIn.to_string(),
                ));
            }
            if !status.plan_enabled {
                return Err(AiError::Config(
                    crate::auth::chatgpt::ChatGptError::PlanUsageDisabled.to_string(),
                ));
            }
            Ok(Box::new(chatgpt_plan::ChatGptPlanProvider::new(
                auth,
                full_prompt,
                &config.openai_effort,
            )))
        }
        "openai" => {
            let api_key = config
                .openai_api_key
                .clone()
                .ok_or_else(|| AiError::Config("OpenAI API key not configured".into()))?;
            Ok(Box::new(
                openai::OpenAIProvider::new(api_key, full_prompt, config.openai_base_url.clone())
                    .with_effort(&config.openai_effort),
            ))
        }
        p => Err(AiError::Config(format!("Unknown provider for model: {p}"))),
    }
}

pub fn get_default_model(config: &AiConfig, provider: &str) -> String {
    match provider {
        "anthropic" => config.anthropic_model.clone(),
        "openai" => config.openai_model.clone(),
        "jev" => "typesafe/jev-1.13".to_string(),
        _ => config.anthropic_model.clone(),
    }
}

pub use jev::merge_jev_config;

pub fn merge_ai_config(current: &AiConfig, partial: &serde_json::Value) -> AiConfig {
    let mut config = current.clone();
    if let Some(obj) = partial.as_object() {
        if let Some(v) = obj.get("anthropic_api_key").and_then(|v| v.as_str()) {
            if !v.is_empty() {
                config.anthropic_api_key = Some(v.to_string());
            }
        }
        if let Some(v) = obj.get("anthropic_model").and_then(|v| v.as_str()) {
            if !v.is_empty() {
                config.anthropic_model = v.to_string();
            }
        }
        if let Some(v) = obj.get("anthropic_effort").and_then(|v| v.as_str()) {
            // Only the five documented levels are accepted; anything else is ignored.
            let lower = v.trim().to_ascii_lowercase();
            if anthropic::EFFORTS.contains(&lower.as_str()) {
                config.anthropic_effort = lower;
            }
        }
        if let Some(v) = obj.get("openai_api_key").and_then(|v| v.as_str()) {
            if !v.is_empty() {
                config.openai_api_key = Some(v.to_string());
            }
        }
        if let Some(v) = obj.get("openai_model").and_then(|v| v.as_str()) {
            if !v.is_empty() {
                config.openai_model = v.to_string();
            }
        }
        if let Some(v) = obj.get("openai_effort").and_then(|v| v.as_str()) {
            let lower = v.trim().to_ascii_lowercase();
            if responses::EFFORTS.contains(&lower.as_str()) {
                config.openai_effort = lower;
            }
        }
        if let Some(v) = obj.get("openai_auth_source").and_then(|v| v.as_str()) {
            if v == AUTH_SOURCE_API_KEY || v == AUTH_SOURCE_CHATGPT {
                config.openai_auth_source = v.to_string();
            }
        }
        if let Some(v) = obj.get("openai_base_url").and_then(|v| v.as_str()) {
            if !v.is_empty() {
                config.openai_base_url = v.to_string();
            }
        }
        if let Some(v) = obj.get("default_provider").and_then(|v| v.as_str()) {
            if !v.is_empty() {
                config.default_provider = v.to_string();
            }
        }
        if let Some(v) = obj.get("system_prompt").and_then(|v| v.as_str()) {
            // system_prompt may legitimately be cleared — allow empty here.
            config.system_prompt = v.to_string();
        }
    }
    config
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_validates_efforts_and_auth_source() {
        let base = AiConfig::default();
        let merged = merge_ai_config(
            &base,
            &serde_json::json!({
                "anthropic_effort": "XHIGH",
                "openai_effort": "max",
                "openai_auth_source": "chatgpt"
            }),
        );
        assert_eq!(merged.anthropic_effort, "xhigh");
        assert_eq!(merged.openai_effort, "max");
        assert!(merged.uses_chatgpt_plan());

        let rejected = merge_ai_config(
            &merged,
            &serde_json::json!({
                "anthropic_effort": "turbo",
                "openai_effort": "extreme",
                "openai_auth_source": "oauth"
            }),
        );
        assert_eq!(rejected.anthropic_effort, "xhigh");
        assert_eq!(rejected.openai_effort, "max");
        assert!(rejected.uses_chatgpt_plan());
    }

    #[test]
    fn ui_updates_cannot_overwrite_the_chatgpt_identity_fields() {
        let base = AiConfig {
            chatgpt_client_id: Some("oaiapp_issued".into()),
            chatgpt_email: Some("me@example.com".into()),
            chatgpt_host_id: Some("urn:uuid:abc".into()),
            ..AiConfig::default()
        };
        let merged = merge_ai_config(
            &base,
            &serde_json::json!({
                "chatgpt_client_id": "dynamic_agent_client",
                "chatgpt_email": "x@y.z",
                "chatgpt_host_id": "urn:uuid:other"
            }),
        );
        assert_eq!(merged.chatgpt_client_id.as_deref(), Some("oaiapp_issued"));
        assert_eq!(merged.chatgpt_email.as_deref(), Some("me@example.com"));
        assert_eq!(merged.chatgpt_host_id.as_deref(), Some("urn:uuid:abc"));
    }

    #[test]
    fn defaults_use_the_current_models_and_api_key_auth() {
        let d = AiConfig::default();
        assert_eq!(d.anthropic_model, "claude-opus-5-5");
        assert_eq!(d.openai_model, "gpt-6.1-sol");
        assert_eq!(d.openai_auth_source, "api_key");
        assert!(!d.uses_chatgpt_plan());
        assert!(d.chatgpt_client_id.is_none());
    }

    #[test]
    fn model_names_route_to_providers() {
        assert_eq!(resolve_provider_for_model("claude-opus-5-5"), "anthropic");
        assert_eq!(resolve_provider_for_model("gpt-6.1-sol"), "openai");
        assert_eq!(resolve_provider_for_model("typesafe/jev-1.13"), "jev");
    }
}
