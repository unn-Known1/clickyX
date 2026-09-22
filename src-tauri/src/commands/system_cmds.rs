//! system_cmds: Tauri command handlers (split from commands.rs in P3).
//!
//! Re-exported through `crate::commands`; `commands::foo` paths keep working.

use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

use crate::config::{self};
use crate::permissions::{self, Permission, PermissionStatus};
use crate::type_mode::TypeModeEngine;
use crate::updater::{self, UpdateInfo};

use super::types::*;

// --- Type Mode Commands ---

#[tauri::command]
pub fn activate_type_mode(
    engine: State<'_, Mutex<TypeModeEngine>>,
    state: State<'_, Mutex<AppState>>,
) -> Result<String, String> {
    let eng = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    let result = eng.handle_ctrl_press();
    if result == crate::type_mode::TypeModeState::Active {
        let mut s = state.lock().map_err(|e| format!("lock error: {e}"))?;
        s.app_mode = "typing".into();
    }
    Ok(format!("{:?}", result))
}

#[tauri::command]
pub fn deactivate_type_mode(
    engine: State<'_, Mutex<TypeModeEngine>>,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let eng = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    eng.deactivate();
    let mut s = state.lock().map_err(|e| format!("lock error: {e}"))?;
    s.app_mode = "idle".into();
    Ok(())
}

#[tauri::command]
pub fn get_type_mode_state(engine: State<'_, Mutex<TypeModeEngine>>) -> Result<String, String> {
    let eng = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    Ok(format!("{:?}", eng.get_state()))
}

#[tauri::command]
pub fn type_text(text: String, engine: State<'_, Mutex<TypeModeEngine>>) -> Result<(), String> {
    let eng = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    eng.type_text(&text)
}

#[tauri::command]
pub fn set_type_mode_config(
    config: crate::config::TypeModeConfig,
    app: AppHandle,
) -> Result<(), String> {
    let mut app_config = config::load_config(&app)?;
    app_config.type_mode = config;
    config::save_config(&app, &app_config)?;
    if let Some(engine) = app.try_state::<Mutex<TypeModeEngine>>() {
        if let Ok(eng) = engine.lock() {
            eng.set_config(app_config.type_mode);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_type_mode_config(app: AppHandle) -> Result<crate::config::TypeModeConfig, String> {
    let config = config::load_config(&app)?;
    Ok(config.type_mode)
}

// --- 3D Generation Command ---

#[tauri::command]
pub async fn generate_3d_model(
    prompt: String,
    style: Option<String>,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    let config = crate::config::load_config(&app)?;
    let api_key = config
        .api_keys
        .iter()
        .find(|k| k.provider.to_lowercase() == "tripo3d")
        .map(|k| k.key.clone())
        .ok_or_else(|| {
            "Tripo3D API key not configured. Add it in Settings > API Keys.".to_string()
        })?;
    let style = style.unwrap_or_else(|| "realistic".into());
    // Use a stable task-id derived from the prompt so get_3d_model_task can
    // look up the current job. In a production app each poll would query the
    // Tripo API directly; here we return a synthetic id for frontend polling.
    let task_id = uuid::Uuid::new_v4().to_string();
    // Persist the task_id so get_3d_model_task can resolve it.
    let task_path = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("clickyx")
        .join("gen3d_task.json");
    // #65: clear any stale task record so the UI starts fresh instead of
    // showing a previous run's "success" state while the new one polls.
    let _ = std::fs::remove_file(&task_path);
    let task_record = serde_json::json!({
        "task_id": task_id,
        "prompt": prompt,
        "style": style.clone(),
        "status": "pending",
        "created_at": crate::agent::session::now_utc().parse::<u64>().unwrap_or(0),
    });
    if let Some(parent) = task_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(
        &task_path,
        serde_json::to_string_pretty(&task_record).unwrap_or_default(),
    );

    crate::gen3d::generate_3d(&prompt, &style, &api_key).await?;

    // Update the task record to success after generation completes
    let updated = serde_json::json!({
        "task_id": task_id,
        "prompt": prompt,
        "style": style,
        "status": "success",
        "model_url": task_path.to_string_lossy().to_string(),
        "created_at": crate::agent::session::now_utc().parse::<u64>().unwrap_or(0),
    });
    let _ = std::fs::write(
        &task_path,
        serde_json::to_string_pretty(&updated).unwrap_or_default(),
    );

    Ok(updated)
}

/// Return the status of the most recently requested 3D generation task.
#[tauri::command]
pub fn get_3d_model_task() -> Result<serde_json::Value, String> {
    let task_path = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("clickyx")
        .join("gen3d_task.json");
    if !task_path.exists() {
        return Ok(serde_json::json!({
            "task_id": "",
            "status": "pending",
            "prompt": "",
            "style": "realistic",
            "created_at": crate::agent::session::now_utc().parse::<u64>().unwrap_or(0),
        }));
    }
    let content = std::fs::read_to_string(&task_path)
        .map_err(|e| format!("failed to read gen3d task: {e}"))?;
    let task: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("failed to parse gen3d task: {e}"))?;
    Ok(task)
}

#[tauri::command]
pub fn check_permission(permission: String) -> Result<PermissionStatus, String> {
    let perm = Permission::from_name(&permission)
        .ok_or_else(|| format!("unknown permission: {}", permission))?;
    Ok(permissions::check_permission(&perm))
}

#[tauri::command]
pub fn request_permission(permission: String) -> Result<bool, String> {
    let perm = Permission::from_name(&permission)
        .ok_or_else(|| format!("unknown permission: {}", permission))?;
    permissions::request_permission(&perm)
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<UpdateInfo, String> {
    let config = config::load_config(&app).unwrap_or_default();
    updater::check_for_updates(&config.version).await
}

#[tauri::command]
pub async fn install_update(url: String, signature: Option<String>) -> Result<(), String> {
    // P0-T3: download → minisign-verify (fail-closed) → install.
    updater::install_update_from_url(&url, signature.as_deref()).await
}

#[tauri::command]
pub fn get_logs(count: Option<u32>) -> Result<Vec<LogEntry>, String> {
    let count = count.unwrap_or(100) as usize;
    let log_dir = crate::get_log_dir()?;
    let mut entries = Vec::new();

    if !log_dir.exists() {
        return Ok(entries);
    }

    let mut files: Vec<_> = std::fs::read_dir(&log_dir)
        .map_err(|e| format!("failed to read log dir: {e}"))?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext == "log")
                .unwrap_or(false)
        })
        .collect();

    files.sort_by_key(|e| e.path().metadata().and_then(|m| m.modified()).ok());

    for file in files.iter().rev() {
        let content = std::fs::read_to_string(file.path())
            .map_err(|e| format!("failed to read log file: {e}"))?;
        for line in content.lines().rev() {
            if entries.len() >= count {
                break;
            }
            let parts: Vec<&str> = line.splitn(4, " | ").collect();
            if parts.len() == 4 {
                entries.push(LogEntry {
                    timestamp: parts[0].trim().into(),
                    level: parts[1].trim().into(),
                    target: parts[2].trim().into(),
                    message: parts[3].into(),
                });
            } else {
                // env_logger default format: "[2026-08-07T12:00:00Z INFO target] msg"
                let trimmed = line.trim();
                let trimmed = trimmed.trim_start_matches('[').trim_end_matches(']');
                let mut split = trimmed.splitn(3, ' ');
                let ts = split.next().unwrap_or("");
                let lvl = split.next().unwrap_or("");
                let rest = split.next().unwrap_or("");
                if rest.contains("] ") {
                    let mut parts = rest.splitn(2, "] ");
                    entries.push(LogEntry {
                        timestamp: ts.into(),
                        level: lvl.into(),
                        target: parts.next().unwrap_or("").into(),
                        message: parts.next().unwrap_or("").into(),
                    });
                } else {
                    entries.push(LogEntry {
                        timestamp: ts.into(),
                        level: lvl.into(),
                        target: String::new(),
                        message: rest.into(),
                    });
                }
            }
        }
        if entries.len() >= count {
            break;
        }
    }

    entries.reverse();
    Ok(entries)
}

#[tauri::command]
pub fn clear_logs() -> Result<(), String> {
    let log_dir = crate::get_log_dir()?;
    if !log_dir.exists() {
        return Ok(());
    }
    for entry in std::fs::read_dir(&log_dir).map_err(|e| format!("failed to read log dir: {e}"))? {
        let entry = entry.map_err(|e| format!("failed to read entry: {e}"))?;
        if entry
            .path()
            .extension()
            .map(|ext| ext == "log")
            .unwrap_or(false)
        {
            // #39: on Windows the logger holds an open handle, so remove may fail;
            // fall back to truncating so the viewer still clears.
            if let Err(_e) = std::fs::remove_file(entry.path()) {
                let _ = std::fs::OpenOptions::new()
                    .write(true)
                    .truncate(true)
                    .open(entry.path());
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_app_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}
