use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow};

#[derive(Debug, Clone, Serialize)]
pub struct CursorData {
    pub x: f64,
    pub y: f64,
    pub label: Option<String>,
    pub accent: Option<String>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CursorPayload {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub label: Option<String>,
    pub accent: Option<String>,
    pub animation: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_x: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_y: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RectPayload {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScribblePayload {
    pub points: Vec<[f64; 2]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CaptionPayload {
    pub text: String,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct OverlayState {
    pub cursors: Vec<CursorData>,
    pub rectangles: Vec<RectPayload>,
    pub scribbles: Vec<ScribblePayload>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speech_bubble: Option<CaptionPayload>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_dock: Option<String>,
}

#[cfg(target_os = "windows")]
pub fn set_click_through<R: Runtime>(_window: &WebviewWindow<R>, _enabled: bool) {
    log::info!("Click-through overlay: Windows support pending hwnd integration");
}

#[cfg(target_os = "linux")]
pub fn set_click_through<R: Runtime>(_window: &WebviewWindow<R>, _enabled: bool) {
    log::info!("Click-through overlay: Linux support pending (requires compositor-specific protocol)");
}

#[cfg(target_os = "macos")]
pub fn set_click_through<R: Runtime>(_window: &WebviewWindow<R>, _enabled: bool) {
    log::info!("Click-through overlay: macOS support pending ns_window integration");
}

pub fn show_overlay<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.show().map_err(|e| format!("show overlay: {e}"))?;
        Ok(())
    } else {
        Err("overlay window not found".into())
    }
}

pub fn hide_overlay<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.hide().map_err(|e| format!("hide overlay: {e}"))?;
        Ok(())
    } else {
        Err("overlay window not found".into())
    }
}

fn emit_overlay_event<R: Runtime>(app: &AppHandle<R>, event: &str, payload: impl Serialize + Clone) -> Result<(), String> {
    app.emit(event, payload).map_err(|e| format!("emit {event}: {e}"))
}

pub fn show_cursor<R: Runtime>(app: &AppHandle<R>, x: f64, y: f64, label: Option<String>) -> Result<(), String> {
    let payload = CursorPayload {
        id: format!("cursor-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos()),
        x, y,
        label,
        accent: None,
        animation: "none".into(),
        from_x: None,
        from_y: None,
    };
    emit_overlay_event(app, "show-cursor", payload)
}

pub fn show_rect<R: Runtime>(app: &AppHandle<R>, x: f64, y: f64, w: f64, h: f64, label: Option<String>) -> Result<(), String> {
    let payload = RectPayload {
        id: format!("rect-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos()),
        x, y, w, h, label,
    };
    emit_overlay_event(app, "show-rect", payload)
}

pub fn show_scribble<R: Runtime>(app: &AppHandle<R>, points: Vec<[f64; 2]>, label: Option<String>) -> Result<(), String> {
    let payload = ScribblePayload { points, label };
    emit_overlay_event(app, "show-scribble", payload)
}

pub fn show_caption<R: Runtime>(app: &AppHandle<R>, text: &str, x: f64, y: f64) -> Result<(), String> {
    let payload = CaptionPayload {
        text: text.to_string(),
        x, y,
    };
    emit_overlay_event(app, "show-caption", payload)
}

pub fn clear_overlays<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    emit_overlay_event(app, "clear-overlays", serde_json::json!({}))
}
