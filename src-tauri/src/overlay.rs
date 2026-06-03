use tauri::{AppHandle, Manager, Runtime};

#[cfg(target_os = "windows")]
pub fn set_click_through<R: Runtime>(_window: &tauri::Window<R>, _enabled: bool) {
    // Platform-specific click-through via WS_EX_TRANSPARENT + WS_EX_LAYERED
    // Requires hwnd access from tauri window. Placeholder for Phase 1.
    log::info!("Click-through overlay: Windows support pending hwnd integration");
}

#[cfg(target_os = "linux")]
pub fn set_click_through<R: Runtime>(_window: &tauri::Window<R>, _enabled: bool) {
    log::info!("Click-through overlay: Linux support pending (requires compositor-specific protocol)");
}

#[cfg(target_os = "macos")]
pub fn set_click_through<R: Runtime>(_window: &tauri::Window<R>, _enabled: bool) {
    log::info!("Click-through overlay: macOS support pending ns_window integration");
}

pub fn show_overlay<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.show().map_err(|e| format!("failed to show overlay: {e}"))?;
        window.set_focus().ok();
        Ok(())
    } else {
        Err("overlay window not found".into())
    }
}

pub fn hide_overlay<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.hide().map_err(|e| format!("failed to hide overlay: {e}"))?;
        Ok(())
    } else {
        Err("overlay window not found".into())
    }
}
