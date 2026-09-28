//! ai_cmds: Tauri command handlers (split from commands.rs in P3).
//!
//! Re-exported through `crate::commands`; `commands::foo` paths keep working.

use tauri::AppHandle;

use crate::ai;
use crate::ai::catalog::ModelCatalog;
use crate::ai::jev::{self, JevConfig, JevDecideRequest};
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

/// Chat-capable models only — Jev `decide/judge/rank` entries are excluded
/// by construction so the chat picker can never select a decision model.
#[tauri::command]
pub fn get_chat_models() -> Result<Vec<ai::catalog::ModelInfo>, String> {
    let catalog = ModelCatalog::new();
    Ok(catalog
        .get_capability_models("chat")
        .into_iter()
        .cloned()
        .collect())
}

/// Jev decision models (`decide` capability).
#[tauri::command]
pub fn get_jev_models() -> Result<Vec<ai::catalog::ModelInfo>, String> {
    let catalog = ModelCatalog::new();
    Ok(catalog.get_jev_models().into_iter().cloned().collect())
}

#[tauri::command]
pub fn get_jev_presets() -> Result<Vec<jev::JevPreset>, String> {
    Ok(jev::jev_presets())
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

#[tauri::command]
pub fn get_jev_config(app: AppHandle) -> Result<JevConfig, String> {
    let config = config::load_config(&app).unwrap_or_default();
    Ok(config.jev.clone())
}

#[tauri::command]
pub fn update_jev_config(app: AppHandle, partial: serde_json::Value) -> Result<JevConfig, String> {
    let mut config = config::load_config(&app).unwrap_or_default();
    config.jev = ai::merge_jev_config(&config.jev, &partial);
    // Same invariant as OpenAI: the Jev URL receives the API key.
    jev::validate_jev_base_url(&config.jev.base_url)?;
    crate::secret_store::persist_config_secrets(&mut config);
    config::save_config(&app, &config)?;
    Ok(config.jev.clone())
}

/// Connectivity test: sends one minimal `noul` question. Never persists.
/// Fails closed with declassified errors (no key material in the message).
#[tauri::command]
pub async fn test_jev_judge(app: AppHandle) -> Result<serde_json::Value, String> {
    let config = config::load_config(&app).unwrap_or_default();
    jev::validate_jev_base_url(&config.jev.base_url)?;
    let client =
        jev::JevClient::new(&config.jev).map_err(|e| jev::declassify_jev_error(&e.to_string()))?;
    let mut questions = std::collections::BTreeMap::new();
    questions.insert(
        "ping".into(),
        jev::noul_question("Is this a connectivity test? Answer yes.", None)?,
    );
    let state = serde_json::json!({"test": true});
    let resp = client
        .decide(state, questions)
        .await
        .map_err(|e| jev::declassify_jev_error(&e.to_string()))?;
    let input_tokens = resp.usage.as_ref().map(|u| u.input_tokens).unwrap_or(0);
    Ok(serde_json::json!({
        "ok": true,
        "model": resp.model,
        "answers": resp.answers,
        "usage": resp.usage,
        "cost_usd": jev::jev_cost_usd(input_tokens),
    }))
}

/// Full judge call from the frontend (Jarvis panel / tests).
/// Thin wrapper over `JevClient::decide` with declassified errors.
#[tauri::command]
pub async fn jev_decide(
    app: AppHandle,
    request: JevDecideRequest,
) -> Result<crate::ai::jev::JevDecideResponse, String> {
    let config = config::load_config(&app).unwrap_or_default();
    let client =
        jev::JevClient::new(&config.jev).map_err(|e| jev::declassify_jev_error(&e.to_string()))?;
    // Honor a per-request model override only when non-empty; else config model.
    let model_override = if request.model.trim().is_empty() || request.model == config.jev.model {
        None
    } else {
        Some(request.model.as_str())
    };
    client
        .decide_with_model(request.state, request.questions, model_override)
        .await
        .map_err(|e| jev::declassify_jev_error(&e.to_string()))
}
