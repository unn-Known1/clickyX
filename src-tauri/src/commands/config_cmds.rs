//! config_cmds: Tauri command handlers (split from commands.rs in P3).
//!
//! Re-exported through `crate::commands`; `commands::foo` paths keep working.

use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use crate::audio::VoicePipeline;
use crate::config::{self, AppConfig};
use crate::secret_store::{persist_config_secrets, SecretStore};

use super::types::*;

#[tauri::command]
pub fn get_config(app: AppHandle) -> Result<AppConfig, String> {
    config::load_config(&app)
}

#[tauri::command]
pub fn update_config(app: AppHandle, partial: serde_json::Value) -> Result<AppConfig, String> {
    let mut config = config::load_config(&app)?;
    if let Some(obj) = partial.as_object() {
        if let Some(theme) = obj.get("theme").and_then(|v| v.as_str()) {
            config.theme = theme.to_string();
        }
        if let Some(onboarding_completed) =
            obj.get("onboarding_completed").and_then(|v| v.as_bool())
        {
            config.onboarding_completed = onboarding_completed;
        }
        if let Some(window) = obj.get("window") {
            if let Ok(w) = serde_json::from_value(window.clone()) {
                config.window = w;
            }
        }
        if let Some(screen) = obj.get("screen") {
            if let Ok(s) = serde_json::from_value(screen.clone()) {
                config.screen = s;
            }
        }
        if let Some(overlay) = obj.get("overlay") {
            if let Ok(o) = serde_json::from_value(overlay.clone()) {
                config.overlay = o;
            }
        }
        if let Some(hotkeys) = obj.get("hotkeys") {
            if let Ok(h) = serde_json::from_value::<Vec<config::HotkeyBinding>>(hotkeys.clone()) {
                config::validate_hotkeys(&h)?;
                config.hotkeys = h;
            }
        }
        if let Some(api_keys) = obj.get("api_keys") {
            if let Ok(k) = serde_json::from_value(api_keys.clone()) {
                config.api_keys = k;
                // P3/T2: new provider keys go straight to the keychain.
                persist_config_secrets(&mut config);
            }
        }
        if let Some(computer_use) = obj.get("computer_use") {
            if let Ok(c) = serde_json::from_value(computer_use.clone()) {
                config.computer_use = c;
            }
        }
        if let Some(type_mode) = obj.get("type_mode") {
            if let Ok(t) = serde_json::from_value(type_mode.clone()) {
                config.type_mode = t;
            }
        }
        // #60: persist wake_word changes from the UI
        if let Some(wake_word) = obj.get("wake_word") {
            if let Ok(w) = serde_json::from_value(wake_word.clone()) {
                config.wake_word = w;
            }
        }
        // #60: persist bridge_token changes from the UI
        if let Some(bt) = obj.get("bridge_token") {
            if bt.is_null() {
                config.bridge_token = None;
                // P3/T2: explicit clear also clears the keychain copy so
                // hydration can't resurrect it (best-effort).
                let store = crate::secret_store::KeychainStore;
                if store.available() {
                    let _ = store.delete(crate::secret_store::keys::BRIDGE_TOKEN);
                }
            } else if let Some(s) = bt.as_str() {
                config.bridge_token = if s.is_empty() {
                    None
                } else {
                    Some(s.to_string())
                };
            }
            // Same invariant as set_bridge_token: clearing while enabled rotates.
            if !config.bridge_auth_disabled
                && config
                    .bridge_token
                    .as_ref()
                    .map(|t| t.is_empty())
                    .unwrap_or(true)
            {
                config.bridge_token = Some(config::generate_secret_token());
            }
            // P0-T1: token changes apply to the running bridge immediately.
            apply_bridge_auth_state(&app, &config);
        }
        // P0-T1: explicit auth opt-out flag (UI must warn when true).
        if let Some(disabled) = obj.get("bridge_auth_disabled").and_then(|v| v.as_bool()) {
            config.bridge_auth_disabled = disabled;
            apply_bridge_auth_state(&app, &config);
        }
    }
    // P3/T2: new secrets go straight to the OS keychain when available.
    crate::secret_store::persist_config_secrets(&mut config);
    config::save_config(&app, &config)?;
    crate::register_hotkeys(&app)?;

    if let Some(pipeline) = app.try_state::<Mutex<VoicePipeline>>() {
        if let Ok(pipe) = pipeline.lock() {
            let _ = pipe.update_api_keys(&config.api_keys);
        }
    }

    Ok(config)
}

// ── Bridge auth token (#45, P0-T1) ──────────────────────────────────────────
// Lets the UI rotate/enable/disable the local HTTP bridge token.
// Changes apply to the running bridge immediately (hot-reload).

/// Push the config's bridge-auth state into the shared hot-reload state.
fn apply_bridge_auth_state(app: &AppHandle, config: &AppConfig) {
    if let Some(shared) = app.try_state::<crate::bridge_auth::SharedAuthSettings>() {
        shared.set_token(config.bridge_token.clone());
        shared.set_disabled(config.bridge_auth_disabled);
    }
}

/// Read-only bridge auth status for the UI (never returns the token itself).
#[tauri::command]
pub fn get_bridge_status(app: AppHandle) -> Result<BridgeStatus, String> {
    let config = config::load_config(&app)?;
    Ok(BridgeStatus {
        token_set: config
            .bridge_token
            .as_ref()
            .map(|t| !t.is_empty())
            .unwrap_or(false),
        auth_disabled: config.bridge_auth_disabled,
        dangerous_always_gated: true,
    })
}

#[tauri::command]
pub fn set_bridge_token(app: AppHandle, token: Option<String>) -> Result<(), String> {
    let mut config = config::load_config(&app)?;
    // An explicitly empty string clears the token; a missing token with auth
    // enabled is regenerated on next load (auth stays on by default).
    config.bridge_token = token.filter(|t| !t.is_empty());
    // P0-T1 invariant: auth enabled requires a token NOW, not after restart.
    // Clearing while enabled rotates instead of locking every endpoint out.
    if !config.bridge_auth_disabled
        && config
            .bridge_token
            .as_ref()
            .map(|t| t.is_empty())
            .unwrap_or(true)
    {
        config.bridge_token = Some(config::generate_secret_token());
        log::info!("Bridge token cleared while auth enabled — rotated instead");
    }
    // P3/T2: new secrets go straight to the OS keychain when available.
    crate::secret_store::persist_config_secrets(&mut config);
    config::save_config(&app, &config)?;
    apply_bridge_auth_state(&app, &config);
    log::info!("Bridge token updated (applied immediately, no restart needed)");
    Ok(())
}

/// Generate a fresh bridge token, persist it, apply it immediately, and
/// return it ONCE so the UI can show/copy it. The token is never readable
/// again via any command after this returns.
#[tauri::command]
pub fn rotate_bridge_token(app: AppHandle) -> Result<String, String> {
    let mut config = config::load_config(&app)?;
    let token = config::generate_secret_token();
    config.bridge_token = Some(token.clone());
    config.bridge_auth_disabled = false;
    // P3/T2: new secrets go straight to the OS keychain when available.
    crate::secret_store::persist_config_secrets(&mut config);
    config::save_config(&app, &config)?;
    apply_bridge_auth_state(&app, &config);
    log::info!("Bridge token rotated (applied immediately)");
    Ok(token)
}

fn redact_config_value(config: &AppConfig) -> serde_json::Value {
    let mut v = serde_json::to_value(config).unwrap_or(serde_json::Value::Null);
    if let Some(obj) = v.as_object_mut() {
        // Top-level secrets.
        if obj.contains_key("bridge_token") {
            obj.insert(
                "bridge_token".into(),
                serde_json::Value::String(REDACTED_SENTINEL.into()),
            );
        }
        // Legacy per-provider keys.
        if let Some(keys) = obj.get_mut("api_keys").and_then(|k| k.as_array_mut()) {
            for entry in keys.iter_mut() {
                if let Some(e) = entry.as_object_mut() {
                    e.insert(
                        "key".into(),
                        serde_json::Value::String(REDACTED_SENTINEL.into()),
                    );
                }
            }
        }
        // AI provider keys + agent-store encryption key.
        for section in ["ai", "agent"] {
            if let Some(sec) = obj.get_mut(section).and_then(|s| s.as_object_mut()) {
                // Explicit secret fields (kept in sync with AiConfig/AgentConfig).
                for field in ["anthropic_api_key", "openai_api_key", "encryption_key"] {
                    if sec.contains_key(field) {
                        sec.insert(
                            field.into(),
                            serde_json::Value::String(REDACTED_SENTINEL.into()),
                        );
                    }
                }
            }
        }
        // MCP server env blocks frequently hold tokens — redact values, keep names.
        if let Some(servers) = obj.get_mut("mcp_servers").and_then(|s| s.as_array_mut()) {
            for server in servers.iter_mut() {
                if let Some(env) = server.get_mut("env").and_then(|e| e.as_object_mut()) {
                    for (_k, val) in env.iter_mut() {
                        *val = serde_json::Value::String(REDACTED_SENTINEL.into());
                    }
                }
            }
        }
    }
    v
}

#[tauri::command]
pub fn export_config(app: AppHandle, include_secrets: bool) -> Result<String, String> {
    let config = config::load_config(&app)?;
    if include_secrets {
        log::warn!("Config exported WITH secrets — the file contains API keys and tokens");
        serde_json::to_string_pretty(&config)
            .map_err(|e| format!("failed to serialize config: {e}"))
    } else {
        serde_json::to_string_pretty(&redact_config_value(&config))
            .map_err(|e| format!("failed to serialize config: {e}"))
    }
}

#[tauri::command]
pub fn import_config(app: AppHandle, json: String) -> Result<AppConfig, String> {
    // P0-T2: refuse redacted exports — importing one would silently wipe every
    // secret (keys, tokens, MCP env) with the __REDACTED__ sentinel.
    if json.contains(REDACTED_SENTINEL) {
        return Err(
            "refusing to import a redacted export (secrets were stripped). \
             Re-export with \"include secrets\" checked, or re-enter keys manually."
                .into(),
        );
    }
    let mut config: AppConfig =
        serde_json::from_str(&json).map_err(|e| format!("invalid config JSON: {e}"))?;
    // P0-T2/H-6: the OpenAI-compatible base URL receives the user's API key —
    // only allow explicit http(s) hosts so a typo can't become key exfiltration.
    validate_openai_base_url(&config.ai.openai_base_url)?;
    // P3/T2: new secrets go straight to the OS keychain when available.
    crate::secret_store::persist_config_secrets(&mut config);
    config::save_config(&app, &config)?;
    apply_bridge_auth_state(&app, &config);
    Ok(config)
}

/// P0-T2/H-6 guard: `openai_base_url` gets `Authorization: Bearer <user key>`,
/// so it must be an explicit http(s) URL — never empty, never another scheme.
pub(crate) fn validate_openai_base_url(base_url: &str) -> Result<(), String> {
    let lower = base_url.trim().to_ascii_lowercase();
    if lower.starts_with("https://") || lower.starts_with("http://") {
        Ok(())
    } else {
        Err(format!(
            "refusing openai_base_url without explicit http(s) scheme: {base_url}"
        ))
    }
}

#[tauri::command]
pub fn reset_config(app: AppHandle) -> Result<AppConfig, String> {
    let config = AppConfig::default();
    config::save_config(&app, &config)?;
    Ok(config)
}
