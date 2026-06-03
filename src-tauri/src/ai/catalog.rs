use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub provider: String,
    pub name: String,
    pub capabilities: Vec<String>,
}

pub struct ModelCatalog {
    pub models: Vec<ModelInfo>,
}

impl ModelCatalog {
    pub fn new() -> Self {
        Self {
            models: vec![
                ModelInfo {
                    id: "claude-sonnet-4-20250514".into(),
                    provider: "anthropic".into(),
                    name: "Claude Sonnet 4".into(),
                    capabilities: vec![
                        "chat".into(),
                        "vision".into(),
                        "streaming".into(),
                        "tools".into(),
                    ],
                },
                ModelInfo {
                    id: "claude-opus-4-20250514".into(),
                    provider: "anthropic".into(),
                    name: "Claude Opus 4".into(),
                    capabilities: vec![
                        "chat".into(),
                        "vision".into(),
                        "streaming".into(),
                        "tools".into(),
                    ],
                },
                ModelInfo {
                    id: "claude-haiku-3-20250313".into(),
                    provider: "anthropic".into(),
                    name: "Claude Haiku 3".into(),
                    capabilities: vec!["chat".into(), "vision".into(), "streaming".into()],
                },
                ModelInfo {
                    id: "gpt-4o".into(),
                    provider: "openai".into(),
                    name: "GPT-4o".into(),
                    capabilities: vec![
                        "chat".into(),
                        "vision".into(),
                        "streaming".into(),
                        "tools".into(),
                    ],
                },
                ModelInfo {
                    id: "gpt-4o-mini".into(),
                    provider: "openai".into(),
                    name: "GPT-4o Mini".into(),
                    capabilities: vec!["chat".into(), "vision".into(), "streaming".into()],
                },
                ModelInfo {
                    id: "o3-mini".into(),
                    provider: "openai".into(),
                    name: "o3-mini".into(),
                    capabilities: vec!["chat".into(), "streaming".into()],
                },
            ],
        }
    }

    pub fn get_model(&self, id: &str) -> Option<&ModelInfo> {
        self.models.iter().find(|m| m.id == id)
    }

    pub fn get_provider_models(&self, provider: &str) -> Vec<&ModelInfo> {
        self.models
            .iter()
            .filter(|m| m.provider == provider)
            .collect()
    }
}
