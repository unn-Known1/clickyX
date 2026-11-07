use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub provider: String,
    pub name: String,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct RemoteModelList {
    data: Vec<RemoteModel>,
}

#[derive(Debug, Deserialize)]
struct RemoteModel {
    id: String,
}

pub struct ModelCatalog {
    pub models: Vec<ModelInfo>,
}

impl ModelCatalog {
    pub fn new() -> Self {
        Self {
            models: Self::default_models(),
        }
    }

    fn default_models() -> Vec<ModelInfo> {
        vec![
            ModelInfo {
                id: "claude-opus-5-5".into(),
                provider: "anthropic".into(),
                name: "Claude Opus 5.5".into(),
                capabilities: vec![
                    "chat".into(),
                    "vision".into(),
                    "streaming".into(),
                    "tools".into(),
                ],
            },
            ModelInfo {
                id: "claude-sonnet-5-5".into(),
                provider: "anthropic".into(),
                name: "Claude Sonnet 5.5".into(),
                capabilities: vec![
                    "chat".into(),
                    "vision".into(),
                    "streaming".into(),
                    "tools".into(),
                ],
            },
            ModelInfo {
                id: "claude-haiku-5-5".into(),
                provider: "anthropic".into(),
                name: "Claude Haiku 5.5".into(),
                capabilities: vec![
                    "chat".into(),
                    "vision".into(),
                    "streaming".into(),
                    "tools".into(),
                ],
            },
            ModelInfo {
                id: "claude-fable-5-1".into(),
                provider: "anthropic".into(),
                name: "Claude Fable 5.1".into(),
                capabilities: vec![
                    "chat".into(),
                    "vision".into(),
                    "streaming".into(),
                    "tools".into(),
                ],
            },
            ModelInfo {
                id: "gpt-6.1-sol".into(),
                provider: "openai".into(),
                name: "GPT-6.1 Sol".into(),
                capabilities: vec![
                    "chat".into(),
                    "vision".into(),
                    "streaming".into(),
                    "tools".into(),
                ],
            },
            ModelInfo {
                id: "gpt-6-astra".into(),
                provider: "openai".into(),
                name: "GPT-6 Astra".into(),
                capabilities: vec![
                    "chat".into(),
                    "vision".into(),
                    "streaming".into(),
                    "tools".into(),
                ],
            },
            ModelInfo {
                id: "gpt-6.1-terra".into(),
                provider: "openai".into(),
                name: "GPT-6.1 Terra".into(),
                capabilities: vec![
                    "chat".into(),
                    "vision".into(),
                    "streaming".into(),
                    "tools".into(),
                ],
            },
            ModelInfo {
                id: "gpt-6-luna".into(),
                provider: "openai".into(),
                name: "GPT-6 Luna".into(),
                capabilities: vec![
                    "chat".into(),
                    "vision".into(),
                    "streaming".into(),
                    "tools".into(),
                ],
            },
            // Jev decision models — decide/judge/rank only, NEVER chat.
            ModelInfo {
                id: "typesafe/jev-1.13".into(),
                provider: "jev".into(),
                name: "Jev 1.13 (OpenRouter)".into(),
                capabilities: vec!["decide".into(), "judge".into(), "rank".into()],
            },
            ModelInfo {
                id: "jev-1.13.0".into(),
                provider: "jev".into(),
                name: "Jev 1.13.0 (Direct)".into(),
                capabilities: vec!["decide".into(), "judge".into(), "rank".into()],
            },
            ModelInfo {
                id: "jev-latest".into(),
                provider: "jev".into(),
                name: "Jev Latest (Direct)".into(),
                capabilities: vec!["decide".into(), "judge".into(), "rank".into()],
            },
        ]
    }

    pub async fn fetch_openai_compatible(base_url: &str, api_key: &str) -> Vec<ModelInfo> {
        // #13: don't duplicate `/v1` when the base URL already ends with it.
        let base = base_url.trim_end_matches('/');
        let url = if base.ends_with("/v1") {
            format!("{}/models", base)
        } else {
            format!("{}/v1/models", base)
        };
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .ok();

        let client = match client {
            Some(c) => c,
            None => return vec![],
        };

        let response = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .await;

        let list: RemoteModelList = match response {
            Ok(r) if r.status().is_success() => {
                r.json().await.unwrap_or(RemoteModelList { data: vec![] })
            }
            _ => return vec![],
        };

        list.data
            .into_iter()
            .map(|m| {
                let model_id = m.id;
                ModelInfo {
                    id: model_id.clone(),
                    provider: "openai".into(),
                    name: model_id,
                    capabilities: vec!["chat".into(), "streaming".into()],
                }
            })
            .collect()
    }

    pub fn get_provider_models(&self, provider: &str) -> Vec<&ModelInfo> {
        self.models
            .iter()
            .filter(|m| m.provider == provider)
            .collect()
    }

    /// Models exposing a capability (e.g. `"chat"` for the chat picker,
    /// `"decide"`/`"judge"` for the Jev picker). Jev entries carry
    /// `decide/judge/rank` and are excluded from chat lists by construction.
    pub fn get_capability_models(&self, capability: &str) -> Vec<&ModelInfo> {
        self.models
            .iter()
            .filter(|m| m.capabilities.iter().any(|c| c == capability))
            .collect()
    }

    pub fn get_jev_models(&self) -> Vec<&ModelInfo> {
        self.get_provider_models("jev")
    }

    pub fn merge_remote(&mut self, remote: Vec<ModelInfo>) {
        for model in remote {
            if !self.models.iter().any(|m| m.id == model.id) {
                self.models.push(model);
            }
        }
    }
}
