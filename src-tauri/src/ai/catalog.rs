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
                id: "claude-sonnet-4-20250514".into(),
                provider: "anthropic".into(),
                name: "Claude Sonnet 4".into(),
                capabilities: vec!["chat".into(), "vision".into(), "streaming".into(), "tools".into()],
            },
            ModelInfo {
                id: "claude-opus-4-20250514".into(),
                provider: "anthropic".into(),
                name: "Claude Opus 4".into(),
                capabilities: vec!["chat".into(), "vision".into(), "streaming".into(), "tools".into()],
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
                capabilities: vec!["chat".into(), "vision".into(), "streaming".into(), "tools".into()],
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
        ]
    }

    pub async fn fetch_openai_compatible(base_url: &str, api_key: &str) -> Vec<ModelInfo> {
        let url = format!("{}/v1/models", base_url.trim_end_matches('/'));
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
            Ok(r) if r.status().is_success() => r.json().await.unwrap_or(RemoteModelList { data: vec![] }),
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

    pub fn get_model(&self, id: &str) -> Option<&ModelInfo> {
        self.models.iter().find(|m| m.id == id)
    }

    pub fn get_provider_models(&self, provider: &str) -> Vec<&ModelInfo> {
        self.models
            .iter()
            .filter(|m| m.provider == provider)
            .collect()
    }

    pub fn merge_remote(&mut self, remote: Vec<ModelInfo>) {
        for model in remote {
            if !self.models.iter().any(|m| m.id == model.id) {
                self.models.push(model);
            }
        }
    }
}
