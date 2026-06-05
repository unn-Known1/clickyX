use serde::Serialize;
use xcap::{Monitor, Window};
use image::codecs::jpeg::JpegEncoder;
use image::ColorType;
use base64::Engine;

#[derive(Debug, Clone, Serialize)]
pub struct ScreenImage {
    pub id: u32,
    pub width: u32,
    pub height: u32,
    #[serde(rename = "data")]
    pub data_base64: String,
}

fn encode_rgba_as_jpeg_base64(img: &image::RgbaImage, quality: u8) -> Result<String, String> {
    let mut buf = Vec::new();
    JpegEncoder::new_with_quality(&mut buf, quality)
        .encode(img.as_raw(), img.width(), img.height(), ColorType::Rgba8.into())
        .map_err(|e| format!("jpeg encoding failed: {e}"))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
}

/// Provide user-facing guidance when screen capture fails on Linux.
#[cfg(target_os = "linux")]
fn with_capture_guide<T>(result: Result<T, String>) -> Result<T, String> {
    result.map_err(|e| {
        if e.contains("portal") || e.contains("PipeWire") || e.contains("pipewire") {
            format!(
                "{}\n\nHint: Ensure PipeWire and xdg-desktop-portal are running:\n  systemctl --user start pipewire xdg-desktop-portal\n\nOr on non-systemd systems, start pipewire manually.",
                e
            )
        } else if e.contains("permission") || e.contains("denied") {
            format!(
                "{}\n\nHint: Grant screen capture permission in your desktop environment's privacy settings.",
                e
            )
        } else {
            e
        }
    })
}

#[cfg(not(target_os = "linux"))]
fn with_capture_guide<T>(result: Result<T, String>) -> Result<T, String> {
    result
}

fn capture_monitor(monitor: &Monitor) -> Result<ScreenImage, String> {
    let id = monitor.id().map_err(|e| format!("monitor id: {e}"))?;
    let width = monitor.width().map_err(|e| format!("monitor width: {e}"))?;
    let height = monitor.height().map_err(|e| format!("monitor height: {e}"))?;
    let img = monitor.capture_image().map_err(|e| format!("monitor capture: {e}"))?;
    let data_base64 = encode_rgba_as_jpeg_base64(&img, 85)?;
    Ok(ScreenImage { id, width, height, data_base64 })
}

pub fn capture_all_screens() -> Result<Vec<ScreenImage>, String> {
    let monitors = Monitor::all().map_err(|e| format!("enumerate monitors: {e}"))?;
    monitors.iter().map(capture_monitor).collect::<Result<Vec<_>, _>>()
        .map_or_else(|e| with_capture_guide(Err(e)), Ok)
}

pub fn capture_cursor_screen() -> Result<ScreenImage, String> {
    if let Ok(windows) = Window::all() {
        for w in &windows {
            if w.is_focused().unwrap_or(false) {
                if let Ok(monitor) = w.current_monitor() {
                    return capture_monitor(&monitor);
                }
            }
        }
    }
    log::info!("capture_cursor_screen: no focused window found, using primary monitor");
    let monitors = Monitor::all().map_err(|e| format!("enumerate monitors: {e}"))?;
    for m in &monitors {
        if m.is_primary().unwrap_or(false) {
            return capture_monitor(m);
        }
    }
    monitors.first().ok_or_else(|| "no monitors found".into()).and_then(capture_monitor)
        .map_or_else(|e| with_capture_guide(Err(e)), Ok)
}

pub fn capture_focused_window() -> Result<Option<ScreenImage>, String> {
    let windows = Window::all().map_err(|e| format!("enumerate windows: {e}"))?;
    for w in &windows {
        if w.is_focused().unwrap_or(false) {
            let img = match w.capture_image() {
                Ok(img) => img,
                Err(e) => return with_capture_guide(Err(format!("window capture: {e}"))),
            };
            let id = w.id().map_err(|e| format!("window id: {e}"))?;
            let width = img.width();
            let height = img.height();
            let data_base64 = encode_rgba_as_jpeg_base64(&img, 85)?;
            return Ok(Some(ScreenImage { id, width, height, data_base64 }));
        }
    }
    log::warn!("capture_focused_window: no focused window found, falling back to primary monitor");
    let monitors = Monitor::all().map_err(|e| format!("enumerate monitors: {e}"))?;
    for m in &monitors {
        if m.is_primary().unwrap_or(false) {
            return capture_monitor(m).map(Some);
        }
    }
    monitors.first().ok_or_else(|| "no monitors found".into()).and_then(|m| capture_monitor(m).map(Some))
}
