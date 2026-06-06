pub mod catalog;
pub mod anthropic;
pub mod openai;
pub mod streaming;
pub mod guidance;
pub mod app_contexts;

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
    pub openai_api_key: Option<String>,
    pub openai_model: String,
    pub openai_base_url: String,
    pub default_provider: String,
    pub system_prompt: String,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            anthropic_api_key: None,
            anthropic_model: "claude-sonnet-4-20250514".into(),
            openai_api_key: None,
            openai_model: "gpt-4o".into(),
            openai_base_url: "https://api.openai.com".into(),
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

pub fn create_provider(config: &AiConfig) -> Result<Box<dyn AiProvider>, AiError> {
    let full_prompt = format!("{}\n{}", config.system_prompt, CUA_SYSTEM_PROMPT);
    match config.default_provider.as_str() {
        "anthropic" => {
            let api_key = config
                .anthropic_api_key
                .clone()
                .ok_or_else(|| AiError::Config("Anthropic API key not configured".into()))?;
            Ok(Box::new(anthropic::AnthropicProvider::new(
                api_key,
                full_prompt,
            )))
        }
        "openai" => {
            let api_key = config
                .openai_api_key
                .clone()
                .ok_or_else(|| AiError::Config("OpenAI API key not configured".into()))?;
            Ok(Box::new(openai::OpenAIProvider::new(
                api_key,
                full_prompt,
                config.openai_base_url.clone(),
            )))
        }
        p => Err(AiError::Config(format!("Unknown provider: {p}"))),
    }
}

pub fn resolve_provider_for_model(model: &str) -> &str {
    if model.contains("claude") || model.contains("anthropic") {
        "anthropic"
    } else {
        "openai"
    }
}

pub fn create_provider_for_model(config: &AiConfig, model: &str) -> Result<Box<dyn AiProvider>, AiError> {
    let provider_name = resolve_provider_for_model(model);
    let full_prompt = format!("{}\n{}", config.system_prompt, CUA_SYSTEM_PROMPT);
    match provider_name {
        "anthropic" => {
            let api_key = config
                .anthropic_api_key
                .clone()
                .ok_or_else(|| AiError::Config("Anthropic API key not configured".into()))?;
            Ok(Box::new(anthropic::AnthropicProvider::new(
                api_key,
                full_prompt,
            )))
        }
        "openai" => {
            let api_key = config
                .openai_api_key
                .clone()
                .ok_or_else(|| AiError::Config("OpenAI API key not configured".into()))?;
            Ok(Box::new(openai::OpenAIProvider::new(
                api_key,
                full_prompt,
                config.openai_base_url.clone(),
            )))
        }
        p => Err(AiError::Config(format!("Unknown provider for model: {p}"))),
    }
}


pub fn get_default_model(config: &AiConfig, provider: &str) -> String {
    match provider {
        "anthropic" => config.anthropic_model.clone(),
        "openai" => config.openai_model.clone(),
        _ => config.anthropic_model.clone(),
    }
}

pub fn merge_ai_config(current: &AiConfig, partial: &serde_json::Value) -> AiConfig {
    let mut config = current.clone();
    if let Some(obj) = partial.as_object() {
        if let Some(v) = obj.get("anthropic_api_key").and_then(|v| v.as_str()) {
            config.anthropic_api_key = Some(v.to_string());
        }
        if let Some(v) = obj.get("anthropic_model").and_then(|v| v.as_str()) {
            config.anthropic_model = v.to_string();
        }
        if let Some(v) = obj.get("openai_api_key").and_then(|v| v.as_str()) {
            config.openai_api_key = Some(v.to_string());
        }
        if let Some(v) = obj.get("openai_model").and_then(|v| v.as_str()) {
            config.openai_model = v.to_string();
        }
        if let Some(v) = obj.get("openai_base_url").and_then(|v| v.as_str()) {
            config.openai_base_url = v.to_string();
        }
        if let Some(v) = obj.get("default_provider").and_then(|v| v.as_str()) {
            config.default_provider = v.to_string();
        }
        if let Some(v) = obj.get("system_prompt").and_then(|v| v.as_str()) {
            config.system_prompt = v.to_string();
        }
    }
    config
}
