//! automation_cmds: Tauri command handlers (split from commands.rs in P3).
//!
//! Re-exported through `crate::commands`; `commands::foo` paths keep working.

use std::sync::Mutex;
use tauri::State;

use super::types::*;

// --- Automation Commands ---

#[tauri::command]
pub fn list_automations(
    state: State<'_, Mutex<crate::automation::AutomationEngine>>,
) -> Result<Vec<crate::automation::Automation>, String> {
    let engine = state.lock().map_err(|e| format!("lock error: {e}"))?;
    Ok(engine.automations.clone())
}

#[tauri::command]
pub fn create_automation(
    state: State<'_, Mutex<crate::automation::AutomationEngine>>,
    automation: crate::automation::Automation,
) -> Result<crate::automation::Automation, String> {
    let mut engine = state.lock().map_err(|e| format!("lock error: {e}"))?;
    let mut a = automation;
    if a.id.is_empty() {
        a.id = uuid::Uuid::new_v4().to_string();
    }
    engine.add(a.clone());
    Ok(a)
}

#[tauri::command]
pub fn update_automation(
    state: State<'_, Mutex<crate::automation::AutomationEngine>>,
    automation: crate::automation::Automation,
) -> Result<crate::automation::Automation, String> {
    let mut engine = state.lock().map_err(|e| format!("lock error: {e}"))?;
    engine.update(automation.clone());
    Ok(automation)
}

#[tauri::command]
pub fn delete_automation(
    state: State<'_, Mutex<crate::automation::AutomationEngine>>,
    id: String,
) -> Result<bool, String> {
    let mut engine = state.lock().map_err(|e| format!("lock error: {e}"))?;
    engine.remove(&id);
    Ok(true)
}

#[tauri::command]
pub fn toggle_automation(
    state: State<'_, Mutex<crate::automation::AutomationEngine>>,
    id: String,
    enabled: bool,
) -> Result<crate::automation::Automation, String> {
    let mut engine = state.lock().map_err(|e| format!("lock error: {e}"))?;
    if let Some(automation) = engine.automations.iter_mut().find(|a| a.id == id) {
        automation.enabled = enabled;
        let a = automation.clone();
        let _ = engine.save();
        return Ok(a);
    }
    Err("automation not found".into())
}

fn usage_log_path() -> std::path::PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("clickyx")
        .join("usage_log.json")
}

fn automation_runs_path() -> std::path::PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("clickyx")
        .join("automation_runs.json")
}

#[tauri::command]
pub fn get_app_usage_log() -> Result<Vec<AppUsageEntry>, String> {
    let path = usage_log_path();
    if !path.exists() {
        return Ok(vec![]);
    }
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("failed to read usage log: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("failed to parse usage log: {e}"))
}

#[tauri::command]
pub fn clear_app_usage_log() -> Result<(), String> {
    let path = usage_log_path();
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("failed to clear usage log: {e}"))?;
    }
    Ok(())
}

/// Record focused-app usage; merges into the on-disk log (called by capture paths).
pub fn record_app_usage(app_name: &str) {
    let now = crate::agent::session::now_utc();
    let mut entries = get_app_usage_log().unwrap_or_default();
    if let Some(entry) = entries.iter_mut().find(|e| e.app == app_name) {
        entry.interaction_count += 1;
        entry.last_seen = now.clone();
    } else {
        entries.push(AppUsageEntry {
            app: app_name.to_string(),
            duration_secs: 0,
            last_seen: now,
            interaction_count: 1,
        });
    }
    entries.sort_by(|a, b| b.last_seen.cmp(&a.last_seen));
    if let Some(parent) = usage_log_path().parent() {
        std::fs::create_dir_all(parent).unwrap_or_default();
    }
    if let Ok(json) = serde_json::to_string(&entries) {
        let _ = std::fs::write(usage_log_path(), json);
    }
}

#[tauri::command]
pub fn get_automation_runs(automation_id: String) -> Result<Vec<AutomationRunEntry>, String> {
    let path = automation_runs_path();
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("failed to read automation runs: {e}"))?;
    let all: Vec<AutomationRunEntry> = serde_json::from_str(&content)
        .map_err(|e| format!("failed to parse automation runs: {e}"))?;
    Ok(all
        .into_iter()
        .filter(|r| r.automation_id == automation_id)
        .collect())
}

/// Append an automation run entry (used by the automation tick loop).
pub fn record_automation_run(entry: AutomationRunEntry) {
    let mut all: Vec<AutomationRunEntry> = {
        let path = automation_runs_path();
        if path.exists() {
            std::fs::read_to_string(&path)
                .ok()
                .and_then(|c| serde_json::from_str(&c).ok())
                .unwrap_or_default()
        } else {
            Vec::new()
        }
    };
    all.push(entry);
    if all.len() > 200 {
        all.drain(0..all.len() - 200);
    }
    if let Some(parent) = automation_runs_path().parent() {
        std::fs::create_dir_all(parent).unwrap_or_default();
    }
    if let Ok(json) = serde_json::to_string(&all) {
        let _ = std::fs::write(automation_runs_path(), json);
    }
}

/// Mark a previously recorded automation run as completed or failed.
/// Called from `spawn_agent_run` after the AI provider returns so the
/// Connections "Run History" panel reflects the actual outcome.
pub fn update_automation_run_status(
    run_id: &str,
    finished_at: String,
    status: &str,
    error: Option<String>,
) {
    let mut all: Vec<AutomationRunEntry> = {
        let path = automation_runs_path();
        if path.exists() {
            std::fs::read_to_string(&path)
                .ok()
                .and_then(|c| serde_json::from_str(&c).ok())
                .unwrap_or_default()
        } else {
            Vec::new()
        }
    };
    if let Some(run) = all.iter_mut().find(|r| r.id == run_id) {
        run.finished_at = Some(finished_at);
        run.status = status.to_string();
        run.error = error;
    }
    if let Ok(json) = serde_json::to_string(&all) {
        let _ = std::fs::write(automation_runs_path(), json);
    }
}
