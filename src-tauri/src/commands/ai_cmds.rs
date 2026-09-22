//! ai_cmds: Tauri command handlers (split from commands.rs in P3).
//!
//! Re-exported through `crate::commands`; `commands::foo` paths keep working.

use tauri::AppHandle;

use crate::ai;
use crate::ai::catalog::ModelCatalog;
use crate::config::{self};

use super::config_cmds::validate_openai_base_url;

#[tauri::command]
pub async fn get_models(
    app: AppHandle,
    provider: Option<String>,
) -> Result<Vec<ai::catalog::ModelInfo>, String> {
    let mut catalog = ModelCatalog::new();
    let config = config::load_config(&app).unwrap_or_default();
    let ai_cfg = &config.ai;
    if ai_cfg
        .openai_api_key
        .as_ref()
        .is_some_and(|k| !k.is_empty())
    {
        let remote = ModelCatalog::fetch_openai_compatible(
            &ai_cfg.openai_base_url,
            ai_cfg.openai_api_key.as_deref().unwrap_or(""),
        )
        .await;
        catalog.merge_remote(remote);
    }
    match provider {
        Some(p) => Ok(catalog
            .get_provider_models(&p)
            .into_iter()
            .cloned()
            .collect()),
        None => Ok(catalog.models),
    }
}

#[tauri::command]
pub fn get_ai_config(app: AppHandle) -> Result<ai::AiConfig, String> {
    let config = config::load_config(&app).unwrap_or_default();
    Ok(config.ai.clone())
}

#[tauri::command]
pub fn update_ai_config(
    app: AppHandle,
    partial: serde_json::Value,
) -> Result<ai::AiConfig, String> {
    let mut config = config::load_config(&app).unwrap_or_default();
    config.ai = ai::merge_ai_config(&config.ai, &partial);
    // P0-T2/H-6: validate before persisting — this URL receives the API key.
    validate_openai_base_url(&config.ai.openai_base_url)?;
    // P3/T2: new secrets go straight to the OS keychain when available.
    crate::secret_store::persist_config_secrets(&mut config);
    config::save_config(&app, &config)?;
    Ok(config.ai)
}
