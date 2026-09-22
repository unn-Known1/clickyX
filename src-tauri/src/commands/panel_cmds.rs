//! panel_cmds: Tauri command handlers (split from commands.rs in P3).
//!
//! Re-exported through `crate::commands`; `commands::foo` paths keep working.

use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

use super::types::*;

#[tauri::command]
pub fn toggle_panel(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<PanelState, String> {
    let mut state = state.lock().map_err(|e| format!("lock error: {e}"))?;
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            window.hide().map_err(|e| format!("hide error: {e}"))?;
            state.panel_visible = false;
        } else {
            window.show().map_err(|e| format!("show error: {e}"))?;
            window.set_focus().ok();
            state.panel_visible = true;
        }
        Ok(PanelState {
            panel_visible: state.panel_visible,
            panel_pinned: state.panel_pinned,
        })
    } else {
        Err("main window not found".into())
    }
}

#[tauri::command]
pub fn get_panel_state(state: State<'_, Mutex<AppState>>) -> Result<PanelState, String> {
    let state = state.lock().map_err(|e| format!("lock error: {e}"))?;
    Ok(PanelState {
        panel_visible: state.panel_visible,
        panel_pinned: state.panel_pinned,
    })
}

#[tauri::command]
pub fn toggle_panel_pin(state: State<'_, Mutex<AppState>>) -> Result<PanelState, String> {
    let mut state = state.lock().map_err(|e| format!("lock error: {e}"))?;
    state.panel_pinned = !state.panel_pinned;
    Ok(PanelState {
        panel_visible: state.panel_visible,
        panel_pinned: state.panel_pinned,
    })
}

#[tauri::command]
pub fn get_app_state(state: State<'_, Mutex<AppState>>) -> Result<AppState, String> {
    let locked = state.lock().map_err(|e| format!("lock error: {e}"))?;
    Ok(locked.clone())
}

#[tauri::command]
pub fn show_overlay(app: AppHandle) -> Result<(), String> {
    crate::overlay::show_overlay(&app)
}

#[tauri::command]
pub fn hide_overlay(app: AppHandle) -> Result<(), String> {
    crate::overlay::hide_overlay(&app)
}

#[tauri::command]
pub fn set_overlay_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    if visible {
        crate::overlay::show_overlay(&app)
    } else {
        crate::overlay::hide_overlay(&app)
    }
}
