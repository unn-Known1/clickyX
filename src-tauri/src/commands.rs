use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

use crate::config::{self, AppConfig};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub panel_visible: bool,
    pub panel_pinned: bool,
    pub active_tab: String,
    pub app_mode: String,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            panel_visible: false,
            panel_pinned: false,
            active_tab: "home".into(),
            app_mode: "idle".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanelState {
    pub panel_visible: bool,
    pub panel_pinned: bool,
}

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
        if let Some(window) = obj.get("window") {
            if let Ok(w) = serde_json::from_value(window.clone()) {
                config.window = w;
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
            }
        }
    }
    config::save_config(&app, &config)?;
    crate::register_hotkeys(&app)?;
    Ok(config)
}

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
