//! Sign in with ChatGPT: Tauri command handlers (`chatgpt_status`,
//! `chatgpt_sign_in`, `chatgpt_sign_out`). The protocol lives in
//! `crate::auth::chatgpt`; these only wire it to config, the keychain and the
//! system browser.

use serde::Serialize;
use tauri::AppHandle;

use crate::auth::chatgpt::{self, ChatGptAuth, SignInGuard, SignInRequest};
use crate::config;
use crate::secret_store::{KeychainStore, SecretStore};

/// What the settings UI shows. No tokens, ever.
#[derive(Debug, Clone, Serialize)]
pub struct ChatGptStatus {
    pub signed_in: bool,
    pub email: Option<String>,
    /// False when signed in without the plan-usage grant.
    pub plan_enabled: bool,
    pub keychain_available: bool,
    pub client_registered: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatGptSignOutResult {
    /// True when OpenAI confirmed revoking the refresh token.
    pub revocation_confirmed: bool,
    pub status: ChatGptStatus,
}

fn current_status(ai: &crate::ai::AiConfig) -> ChatGptStatus {
    let auth = ChatGptAuth::from_client_id(ai.chatgpt_client_id.clone());
    let session = auth.status();
    ChatGptStatus {
        signed_in: session.signed_in,
        email: if session.signed_in {
            ai.chatgpt_email.clone()
        } else {
            None
        },
        plan_enabled: session.plan_enabled,
        keychain_available: KeychainStore.available(),
        client_registered: ai.chatgpt_client_id.is_some(),
    }
}

#[tauri::command]
pub async fn chatgpt_status(app: AppHandle) -> Result<ChatGptStatus, String> {
    let cfg = config::load_config(&app).unwrap_or_default();
    // The keychain read can block on D-Bus; keep it off the async executor.
    tokio::task::spawn_blocking(move || current_status(&cfg.ai))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn chatgpt_sign_in(app: AppHandle) -> Result<ChatGptStatus, String> {
    let _guard = SignInGuard::acquire().map_err(|e| e.to_string())?;
    let mut cfg = config::load_config(&app).unwrap_or_default();

    // The host id is created once and persisted before the first sign-in.
    if cfg.ai.chatgpt_host_id.as_deref().is_none_or(str::is_empty) {
        cfg.ai.chatgpt_host_id = Some(chatgpt::new_host_id());
        config::save_config(&app, &cfg)?;
    }
    let host_id = cfg.ai.chatgpt_host_id.clone().unwrap_or_default();

    let saved_client = cfg.ai.chatgpt_client_id.clone().filter(|c| !c.is_empty());
    let hint_auth = ChatGptAuth::from_client_id(saved_client.clone());
    let request = SignInRequest {
        saved_client_id: saved_client,
        host_id,
        email: cfg.ai.chatgpt_email.clone(),
        id_token_hint: hint_auth.id_token_hint(),
    };

    let browser_app = app.clone();
    let outcome = chatgpt::sign_in(
        &chatgpt::Endpoints::default(),
        &KeychainStore,
        &request,
        move |url| {
            use tauri_plugin_shell::ShellExt;
            #[allow(deprecated)]
            browser_app
                .shell()
                .open(url, None)
                .map_err(|e| e.to_string())
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    // Reload: another command may have saved config while the browser was open.
    let mut cfg = config::load_config(&app).unwrap_or_default();
    cfg.ai.chatgpt_client_id = Some(outcome.client_id);
    if outcome.email.is_some() {
        cfg.ai.chatgpt_email = outcome.email;
    }
    config::save_config(&app, &cfg)?;

    let ai = cfg.ai.clone();
    tokio::task::spawn_blocking(move || current_status(&ai))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn chatgpt_sign_out(app: AppHandle) -> Result<ChatGptSignOutResult, String> {
    let mut cfg = config::load_config(&app).unwrap_or_default();
    let auth = ChatGptAuth::from_client_id(cfg.ai.chatgpt_client_id.clone());
    let outcome = auth.sign_out().await.map_err(|e| e.to_string())?;

    // Keep the client id, email and host id for the next sign-in; just stop
    // routing chat through a plan that is no longer signed in.
    if cfg.ai.uses_chatgpt_plan() {
        cfg.ai.openai_auth_source = crate::ai::AUTH_SOURCE_API_KEY.into();
        config::save_config(&app, &cfg)?;
    }
    let ai = cfg.ai.clone();
    let status = tokio::task::spawn_blocking(move || current_status(&ai))
        .await
        .map_err(|e| e.to_string())?;
    Ok(ChatGptSignOutResult {
        revocation_confirmed: outcome.revocation_confirmed,
        status,
    })
}
