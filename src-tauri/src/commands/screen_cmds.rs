//! screen_cmds: Tauri command handlers (split from commands.rs in P3).
//!
//! Re-exported through `crate::commands`; `commands::foo` paths keep working.

use std::sync::Mutex;
use tauri::State;

use crate::screen::auto_capture::{AutoCaptureConfig, AutoCaptureEngine};
use crate::screen::capture;

use super::types::*;

#[tauri::command]
pub fn capture_screens() -> Result<Vec<capture::ScreenImage>, String> {
    capture::capture_all_screens()
}

#[tauri::command]
pub fn capture_cursor_screen() -> Result<capture::ScreenImage, String> {
    capture::capture_cursor_screen()
}

#[tauri::command]
pub fn capture_focused_window() -> Result<Option<capture::ScreenImage>, String> {
    capture::capture_focused_window()
}

#[tauri::command]
pub fn start_auto_capture(
    engine: State<'_, Mutex<AutoCaptureEngine>>,
    interval_ms: Option<u64>,
    capture_mode: Option<String>,
) -> Result<(), String> {
    let engine = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    if let Some(ms) = interval_ms {
        let mut cfg = engine.get_config();
        cfg.interval_ms = ms;
        engine.set_config(cfg);
    }
    if let Some(mode) = capture_mode {
        let mut cfg = engine.get_config();
        cfg.capture_mode = mode;
        engine.set_config(cfg);
    }
    engine.start()
}

#[tauri::command]
pub fn stop_auto_capture(engine: State<'_, Mutex<AutoCaptureEngine>>) -> Result<(), String> {
    let engine = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    engine.stop()
}

#[tauri::command]
pub fn get_auto_capture_status(
    engine: State<'_, Mutex<AutoCaptureEngine>>,
) -> Result<AutoCaptureStatus, String> {
    let engine = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    Ok(AutoCaptureStatus {
        running: engine.is_running(),
        last_capture: engine.get_latest(),
        config: engine.get_config(),
    })
}

#[tauri::command]
pub fn set_auto_capture_config(
    engine: State<'_, Mutex<AutoCaptureEngine>>,
    config: AutoCaptureConfig,
) -> Result<(), String> {
    let engine = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    engine.set_config(config);
    Ok(())
}

#[tauri::command]
pub fn get_latest_auto_capture(
    engine: State<'_, Mutex<AutoCaptureEngine>>,
) -> Result<Option<String>, String> {
    let engine = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    Ok(engine.get_latest_data_url())
}

#[tauri::command]
pub fn clear_auto_capture_cache(engine: State<'_, Mutex<AutoCaptureEngine>>) -> Result<(), String> {
    let engine = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    engine.clear_cache();
    Ok(())
}
