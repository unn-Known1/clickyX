//! agent_cmds: Tauri command handlers (split from commands.rs in P3).
//!
//! Re-exported through `crate::commands`; `commands::foo` paths keep working.

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::accessibility::{AccessibilityElement, AccessibilityTree};
use crate::agent::session::{AgentSession, AgentStore, ChatMessage, SessionState};
use crate::agent::skills::{self, Skill};
use crate::ai;
use crate::audio::VoicePipeline;
use crate::config::{self, AgentConfig};

use super::automation_cmds::update_automation_run_status;
use super::types::*;

#[tauri::command]
pub fn list_agents(
    state: tauri::State<'_, Mutex<AgentStore>>,
) -> Result<Vec<AgentSession>, String> {
    let store = state.lock().map_err(|e| format!("lock error: {e}"))?;
    Ok(store.list())
}

#[tauri::command]
pub fn create_agent(
    app: AppHandle,
    name: String,
    slug: String,
    skills: Vec<String>,
    state: tauri::State<'_, Mutex<AgentStore>>,
) -> Result<AgentSession, String> {
    let mut store = state.lock().map_err(|e| format!("lock error: {e}"))?;
    let session = store.create(name, slug, skills);
    let config = config::load_config(&app).unwrap_or_default();
    let _ = store.save(&config.agent.encryption_key);
    Ok(session)
}

/// Shared agent execution: marks the session Running, appends the prompt,
/// persists, emits `agent-state-changed`, and spawns the provider call on the
/// async runtime. Used by the `run_agent` command and by automation triggers
/// (#15) so both paths actually execute the AI provider.
pub fn spawn_agent_run(app: AppHandle, slug: String, prompt: String, run_id: Option<String>) {
    // Set agent to running state and save transcript
    {
        if let Some(store_mutex) = app.try_state::<Mutex<AgentStore>>() {
            if let Ok(mut store) = store_mutex.lock() {
                if let Some(session) = store.get_mut(&slug) {
                    session.state = SessionState::Running;
                    session.transcript.push(ChatMessage {
                        role: "user".into(),
                        content: prompt.clone(),
                    });
                    session.updated_at = crate::agent::session::now_utc();
                    let config = config::load_config(&app).unwrap_or_default();
                    let _ = store.save(&config.agent.encryption_key);
                } else {
                    log::warn!("spawn_agent_run: agent '{slug}' not found");
                    return;
                }
            }
        }
    }

    // Emit state change so frontend updates
    let _ = app.emit("agent-state-changed", slug.clone());

    // Spawn AI execution in background
    let app_clone = app.clone();
    let slug_clone = slug.clone();
    tokio::spawn(async move {
        let config = config::load_config(&app_clone).unwrap_or_default();
        let model = ai::get_default_model(&config.ai, &config.ai.default_provider);

        // Build messages from transcript
        let messages: Vec<ai::ChatMessage> = {
            let state_ref = match app_clone.try_state::<Mutex<AgentStore>>() {
                Some(s) => s,
                None => {
                    log::error!("Agent {}: could not access agent store", slug_clone);
                    return;
                }
            };
            let guard = match state_ref.lock() {
                Ok(g) => g,
                Err(e) => {
                    log::error!("Agent {}: lock error: {e}", slug_clone);
                    return;
                }
            };
            if let Some(session) = guard.get(&slug_clone) {
                let msgs: Vec<ai::ChatMessage> = session
                    .transcript
                    .iter()
                    .map(|m| ai::ChatMessage {
                        role: m.role.clone(),
                        content: m.content.clone(),
                    })
                    .collect();
                drop(guard);
                msgs
            } else {
                log::error!("Agent {} disappeared during execution", slug_clone);
                return;
            }
        };

        // Call AI provider
        let provider = match ai::create_provider_for_model(&config.ai, &model) {
            Ok(p) => p,
            Err(e) => {
                log::error!("Agent {}: provider error: {e}", slug_clone);
                let _ = app_clone.emit("agent-state-changed", slug_clone);
                return;
            }
        };

        match provider.chat(&messages, &model).await {
            Ok(response) => {
                if let Some(store_mutex) = app_clone.try_state::<Mutex<AgentStore>>() {
                    if let Ok(mut store) = store_mutex.lock() {
                        if let Some(session) = store.get_mut(&slug_clone) {
                            // #12: never resurrect a stopped/archived agent.
                            if matches!(
                                session.state,
                                SessionState::Paused | SessionState::Archived
                            ) {
                                log::info!(
                                    "Agent {} was stopped while running — discarding completion",
                                    slug_clone
                                );
                                drop(store);
                                return;
                            }
                            session.transcript.push(ChatMessage {
                                role: "assistant".into(),
                                content: response,
                            });
                            session.state = SessionState::Completed {
                                result: "completed".into(),
                            };
                            session.updated_at = crate::agent::session::now_utc();
                            let _ = store.save(&config.agent.encryption_key);
                        }
                    }
                }
                let _ = app_clone.emit("agent-state-changed", slug_clone);
                // Update automation run history if this was triggered by one
                if let Some(ref rid) = run_id {
                    update_automation_run_status(
                        rid,
                        crate::agent::session::now_utc(),
                        "success",
                        None,
                    );
                }
            }
            Err(e) => {
                log::error!("Agent {}: AI error: {e}", slug_clone);
                if let Some(store_mutex) = app_clone.try_state::<Mutex<AgentStore>>() {
                    if let Ok(mut store) = store_mutex.lock() {
                        if let Some(session) = store.get_mut(&slug_clone) {
                            if matches!(
                                session.state,
                                SessionState::Paused | SessionState::Archived
                            ) {
                                log::info!(
                                    "Agent {} was stopped while running — discarding error",
                                    slug_clone
                                );
                                drop(store);
                                return;
                            }
                            session.state = SessionState::Failed {
                                error: e.to_string(),
                            };
                            session.updated_at = crate::agent::session::now_utc();
                            let _ = store.save(&config.agent.encryption_key);
                        }
                    }
                }
                let _ = app_clone.emit("agent-state-changed", slug_clone);
                // Update automation run history if this was triggered by one
                if let Some(ref rid) = run_id {
                    update_automation_run_status(
                        rid,
                        crate::agent::session::now_utc(),
                        "error",
                        Some(e.to_string()),
                    );
                }
            }
        }
    });
}

#[tauri::command]
pub async fn run_agent(
    app: AppHandle,
    slug: String,
    prompt: String,
    state: tauri::State<'_, Mutex<AgentStore>>,
) -> Result<(), String> {
    {
        let store = state.lock().map_err(|e| format!("lock error: {e}"))?;
        if store.get(&slug).is_none() {
            return Err(format!("agent '{slug}' not found"));
        }
    }
    spawn_agent_run(app, slug, prompt, None);
    Ok(())
}

#[tauri::command]
pub fn stop_agent(
    app: AppHandle,
    slug: String,
    state: tauri::State<'_, Mutex<AgentStore>>,
) -> Result<(), String> {
    let mut store = state.lock().map_err(|e| format!("lock error: {e}"))?;
    let session = store
        .get_mut(&slug)
        .ok_or_else(|| format!("agent '{slug}' not found"))?;
    if matches!(&session.state, SessionState::Running) {
        // already stopped otherwise — no-op
        session.state = SessionState::Paused;
    }
    session.updated_at = crate::agent::session::now_utc();
    let config = config::load_config(&app).unwrap_or_default();
    let _ = store.save(&config.agent.encryption_key);
    let _ = app.emit("agent-state-changed", slug.clone());
    Ok(())
}

#[tauri::command]
pub fn archive_agent(
    app: AppHandle,
    slug: String,
    state: tauri::State<'_, Mutex<AgentStore>>,
) -> Result<(), String> {
    let mut store = state.lock().map_err(|e| format!("lock error: {e}"))?;
    let session = store
        .get_mut(&slug)
        .ok_or_else(|| format!("agent '{slug}' not found"))?;
    session.state = SessionState::Archived;
    session.updated_at = crate::agent::session::now_utc();
    let config = config::load_config(&app).unwrap_or_default();
    let _ = store.save(&config.agent.encryption_key);
    let _ = app.emit("agent-state-changed", slug.clone());
    Ok(())
}

#[tauri::command]
pub fn delete_agent(
    app: AppHandle,
    slug: String,
    state: tauri::State<'_, Mutex<AgentStore>>,
) -> Result<(), String> {
    let mut store = state.lock().map_err(|e| format!("lock error: {e}"))?;
    if !store.remove(&slug) {
        return Err(format!("agent '{slug}' not found"));
    }
    let config = config::load_config(&app).unwrap_or_default();
    let _ = store.save(&config.agent.encryption_key);
    Ok(())
}

#[tauri::command]
pub fn get_agent_status(
    slug: String,
    state: tauri::State<'_, Mutex<AgentStore>>,
) -> Result<AgentSession, String> {
    let store = state.lock().map_err(|e| format!("lock error: {e}"))?;
    store
        .get(&slug)
        .cloned()
        .ok_or_else(|| format!("agent '{slug}' not found"))
}

#[tauri::command]
pub fn get_agent_transcript(
    slug: String,
    state: tauri::State<'_, Mutex<AgentStore>>,
) -> Result<Vec<ChatMessage>, String> {
    let store = state.lock().map_err(|e| format!("lock error: {e}"))?;
    let session = store
        .get(&slug)
        .ok_or_else(|| format!("agent '{slug}' not found"))?;
    Ok(session.transcript.clone())
}

#[tauri::command]
pub fn list_skills() -> Result<Vec<Skill>, String> {
    Ok(skills::load_skills())
}

#[tauri::command]
pub fn enable_skill(
    slug: String,
    skill_name: String,
    state: tauri::State<'_, Mutex<AgentStore>>,
    app: AppHandle,
) -> Result<(), String> {
    let mut store = state.lock().map_err(|e| format!("lock error: {e}"))?;
    let session = store
        .get_mut(&slug)
        .ok_or_else(|| format!("agent '{slug}' not found"))?;
    if !session.skills.contains(&skill_name) {
        session.skills.push(skill_name);
    }
    let config = config::load_config(&app).unwrap_or_default();
    let _ = store.save(&config.agent.encryption_key);
    Ok(())
}

#[tauri::command]
pub fn disable_skill(
    slug: String,
    skill_name: String,
    state: tauri::State<'_, Mutex<AgentStore>>,
    app: AppHandle,
) -> Result<(), String> {
    let mut store = state.lock().map_err(|e| format!("lock error: {e}"))?;
    let session = store
        .get_mut(&slug)
        .ok_or_else(|| format!("agent '{slug}' not found"))?;
    session.skills.retain(|s| s != &skill_name);
    let config = config::load_config(&app).unwrap_or_default();
    let _ = store.save(&config.agent.encryption_key);
    Ok(())
}

#[tauri::command]
pub fn get_agent_config(app: tauri::AppHandle) -> Result<AgentConfig, String> {
    let config = config::load_config(&app).unwrap_or_default();
    Ok(config.agent)
}

#[tauri::command]
pub fn update_agent_config(
    app: tauri::AppHandle,
    partial: serde_json::Value,
) -> Result<AgentConfig, String> {
    let mut config = config::load_config(&app).unwrap_or_default();
    if let Some(obj) = partial.as_object() {
        // P3: codex_path/codex_home removed with the unwired Codex sidecar —
        // unknown keys are ignored, so old partials keep working.
        if let Some(workers) = obj.get("max_workers").and_then(|v| v.as_u64()) {
            config.agent.max_workers = workers as u32;
        }
        if let Some(pos) = obj.get("agent_dock_position").and_then(|v| v.as_str()) {
            config.agent.agent_dock_position = pos.to_string();
        }
        if let Some(skills) = obj.get("enabled_skills").and_then(|v| v.as_array()) {
            config.agent.enabled_skills = skills
                .iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect();
        }
    }
    config::save_config(&app, &config)?;
    Ok(config.agent)
}

// --- Voice-Agent Triggers Command (B-006) ---

#[tauri::command]
pub fn set_agent_voice_triggers(
    triggers: std::collections::HashMap<String, Vec<String>>,
    pipeline: State<'_, Mutex<VoicePipeline>>,
) -> Result<(), String> {
    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    pipe.set_agent_triggers(triggers);
    Ok(())
}

#[tauri::command]
pub fn get_element_at_point(x: f64, y: f64) -> Result<AccessibilityElement, String> {
    let api = crate::accessibility::create_accessibility_api();
    api.get_element_at_point(x as i32, y as i32)
}

#[tauri::command]
pub fn get_focused_element() -> Result<Option<AccessibilityElement>, String> {
    let api = crate::accessibility::create_accessibility_api();
    api.get_focused_element()
}

#[tauri::command]
pub fn get_accessibility_tree_snapshot() -> Result<AccessibilityTree, String> {
    let api = crate::accessibility::create_accessibility_api();
    api.snapshot()
}

#[tauri::command]
pub fn perform_accessibility_action(
    element: AccessibilityElement,
    action: String,
) -> Result<(), String> {
    let api = crate::accessibility::create_accessibility_api();
    api.perform_action(&element, &action)
}

// ── B-010: Agent HUD floating window ─────────────────────────────────────────

#[tauri::command]
pub fn open_agent_hud(app: AppHandle, slug: String) -> Result<(), String> {
    use tauri::webview::WebviewWindowBuilder;
    use tauri::WebviewUrl;

    let label = format!("agent-hud-{}", slug.replace(['.', '/', ' '], "-"));
    let url = "agent-hud.html";

    // If the window already exists, focus it
    if let Some(existing) = app.get_webview_window(&label) {
        existing.set_focus().ok();
        return Ok(());
    }

    let init_script = format!("window.__AGENT_SLUG = '{}';", slug.replace('\'', "\\'"));

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title(format!("Agent HUD — {}", slug))
        .inner_size(640.0, 520.0)
        .min_inner_size(480.0, 380.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(false)
        .resizable(true)
        .initialization_script(&init_script)
        .build()
        .map(|_| ())
        .map_err(|e| format!("Failed to open Agent HUD: {e}"))
}

// ── B-011: Agent file attachment ──────────────────────────────────────────────
// P1 (H-27): bounded — max file count, files only (no dirs), per-file and
// total content caps. The old code read any path the caller named.

/// Maximum files attachable in one call.
const ATTACH_MAX_FILES: usize = 20;
/// Per-file content cap (chars, char-boundary safe).
const ATTACH_MAX_CHARS_PER_FILE: usize = 10_000;
/// Total content cap across one call (chars).
const ATTACH_MAX_CHARS_TOTAL: usize = 100_000;

#[tauri::command]
pub fn agent_attach_files(
    slug: String,
    paths: Vec<String>,
    store: State<'_, Mutex<AgentStore>>,
) -> Result<(), String> {
    if paths.len() > ATTACH_MAX_FILES {
        return Err(format!(
            "refusing to attach {} files (max {ATTACH_MAX_FILES})",
            paths.len()
        ));
    }
    let mut store = store.lock().map_err(|e| format!("lock: {e}"))?;
    if let Some(session) = store.sessions.get_mut(&slug) {
        let mut total_chars = 0usize;
        for path in &paths {
            let path_obj = std::path::Path::new(path);
            if !path_obj.is_file() {
                log::warn!("[agent-attach] Not a file, skipping: {}", path);
                session.transcript.push(ChatMessage {
                    role: "system".to_string(),
                    content: format!("[File skipped (not a file): {}]", path),
                });
                continue;
            }
            if total_chars >= ATTACH_MAX_CHARS_TOTAL {
                log::warn!(
                    "[agent-attach] Total content cap reached, skipping: {}",
                    path
                );
                session.transcript.push(ChatMessage {
                    role: "system".to_string(),
                    content: format!("[File skipped (total cap reached): {}]", path),
                });
                continue;
            }
            match std::fs::read_to_string(path_obj) {
                Ok(content) => {
                    // #6: never slice at a non-char-boundary (panics on CJK/emoji).
                    // Budget: per-file cap AND remaining total cap, whichever is smaller.
                    let remaining = ATTACH_MAX_CHARS_TOTAL.saturating_sub(total_chars);
                    let budget = remaining.min(ATTACH_MAX_CHARS_PER_FILE);
                    let truncated: String = content.chars().take(budget).collect();
                    total_chars += truncated.chars().count();
                    let truncated = if truncated.chars().count() < content.chars().count() {
                        format!("{}... [truncated]", truncated)
                    } else {
                        truncated
                    };
                    session.transcript.push(ChatMessage {
                        role: "system".to_string(),
                        content: format!("[File: {}]\n{}", path, truncated),
                    });
                }
                Err(_) => {
                    // Binary file or unreadable — store path reference
                    session.transcript.push(ChatMessage {
                        role: "system".to_string(),
                        content: format!("[File attached: {}]", path),
                    });
                }
            }
        }
        log::info!(
            "[agent-attach] {} files attached to agent '{}'",
            paths.len(),
            slug
        );
    }
    Ok(())
}
