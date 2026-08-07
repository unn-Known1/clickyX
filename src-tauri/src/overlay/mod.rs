pub mod lifecycle;
pub mod manager;
pub mod screen_router;
pub mod window_manager;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow};

use crate::agent::dock::AgentDockState;
use lifecycle::AnnotationState;
use manager::AnnotationManager;

/// Log a warning if running on a display server or compositor with known
/// transparency / input-passthrough limitations.
#[cfg(target_os = "linux")]
fn warn_compositor_quirks() {
    if crate::platform::display_server() == "wayland" {
        let de = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default();
        let known_good = ["GNOME", "KDE", "Unity", "Budgie", "POP"];
        if !known_good.iter().any(|k| de.contains(k)) {
            log::warn!(
                "Display server: Wayland, compositor: {}. Overlay transparency \
                 and input-passthrough may not work as expected on this compositor.",
                if de.is_empty() { "unknown" } else { &de }
            );
        }
    }
}

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn next_id(prefix: &str) -> String {
    format!("{}-{}", prefix, NEXT_ID.fetch_add(1, Ordering::Relaxed))
}

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
    pub state: AnnotationState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_x: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_y: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub control_x: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub control_y: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RectPayload {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub state: AnnotationState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScribblePayload {
    pub points: Vec<[f64; 2]>,
    pub state: AnnotationState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CaptionPayload {
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub state: AnnotationState,
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

pub fn init_manager() -> Mutex<AnnotationManager> {
    #[cfg(target_os = "linux")]
    warn_compositor_quirks();
    Mutex::new(AnnotationManager::new())
}

pub fn start_lifecycle_sweep<R: Runtime>(app: AppHandle<R>, manager: std::sync::Arc<Mutex<AnnotationManager>>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(1));
        let expired_ids = if let Ok(mut mgr) = manager.lock() {
            let ids = mgr.get_expired();
            for id in &ids {
                mgr.miss(id);
                let payload = serde_json::json!({
                    "action": "lifecycle",
                    "id": id,
                    "state": "missed"
                });
                let _ = app.emit("lifecycle-event", payload);
            }
            ids
        } else {
            Vec::new()
        };
        if !expired_ids.is_empty() {
            log::info!("Lifecycle sweep: {} annotations expired", expired_ids.len());
        }
    });
}

pub fn set_click_through<R: Runtime>(window: &WebviewWindow<R>, enabled: bool) -> Result<(), String> {
    window.set_ignore_cursor_events(enabled)
        .map_err(|e| format!("set_ignore_cursor_events: {e}"))
}

pub fn show_overlay<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    // Show all per-screen overlay windows
    let mut shown = false;
    for i in 0.. {
        let label = format!("overlay-{}", i);
        if let Some(window) = app.get_webview_window(&label) {
            window.show().map_err(|e| format!("show overlay {label}: {e}"))?;
            shown = true;
        } else {
            break;
        }
    }
    if shown {
        // #9: brief calibration frame while the overlay fades in.
        if let Ok(monitors) = xcap::Monitor::all() {
            if let Some(m) = monitors.first() {
                let _ = emit_overlay_event(
                    app,
                    "calibration-start",
                    serde_json::json!({
                        "x": m.x().unwrap_or(0),
                        "y": m.y().unwrap_or(0),
                        "w": m.width().unwrap_or(0),
                        "h": m.height().unwrap_or(0),
                    }),
                );
                let app2 = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(1500));
                    let _ = app2.emit("calibration-end", serde_json::json!({}));
                });
            }
        }
        Ok(())
    } else {
        Err("no overlay windows found".into())
    }
}

/// Show hidden overlay windows so annotations are actually visible (#2).
fn ensure_overlay_visible<R: Runtime>(app: &AppHandle<R>) {
    let mut i = 0;
    while let Some(window) = app.get_webview_window(&format!("overlay-{}", i)) {
        if !window.is_visible().unwrap_or(true) {
            let _ = window.show();
        }
        i += 1;
    }
}

fn emit_completed_lifecycle<R: Runtime>(app: &AppHandle<R>, ids: Vec<String>) {
    for id in ids {
        let _ = emit_overlay_event(
            app,
            "lifecycle-event",
            serde_json::json!({ "action": "lifecycle", "id": id, "state": "completed" }),
        );
    }
}

fn register_cursor_annotation<R: Runtime>(app: &AppHandle<R>, id: String, data: CursorData) {
    if let Some(mgr) = app.try_state::<std::sync::Arc<Mutex<AnnotationManager>>>() {
        if let Ok(mut mgr) = mgr.lock() {
            let completed = mgr.add_cursor(id, data);
            emit_completed_lifecycle(app, completed);
        }
    }
}

fn register_rect_annotation<R: Runtime>(app: &AppHandle<R>, id: String, data: RectPayload) {
    if let Some(mgr) = app.try_state::<std::sync::Arc<Mutex<AnnotationManager>>>() {
        if let Ok(mut mgr) = mgr.lock() {
            let completed = mgr.add_rect(id, data);
            emit_completed_lifecycle(app, completed);
        }
    }
}

fn register_scribble_annotation<R: Runtime>(app: &AppHandle<R>, id: String, data: ScribblePayload) {
    if let Some(mgr) = app.try_state::<std::sync::Arc<Mutex<AnnotationManager>>>() {
        if let Ok(mut mgr) = mgr.lock() {
            let completed = mgr.add_scribble(id, data);
            emit_completed_lifecycle(app, completed);
        }
    }
}

fn register_caption_annotation<R: Runtime>(app: &AppHandle<R>, id: String, data: CaptionPayload) {
    if let Some(mgr) = app.try_state::<std::sync::Arc<Mutex<AnnotationManager>>>() {
        if let Ok(mut mgr) = mgr.lock() {
            let completed = mgr.add_caption(id, data);
            emit_completed_lifecycle(app, completed);
        }
    }
}

fn schedule_hide_event<R: Runtime>(app: &AppHandle<R>, event: &'static str, id: String) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(6000));
        let _ = app.emit(event, serde_json::json!({ "id": id }));
    });
}

pub fn hide_overlay<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    // Hide all per-screen overlay windows
    let mut hidden = false;
    for i in 0.. {
        let label = format!("overlay-{}", i);
        if let Some(window) = app.get_webview_window(&label) {
            window.hide().map_err(|e| format!("hide overlay {label}: {e}"))?;
            hidden = true;
        } else {
            break;
        }
    }
    if hidden { Ok(()) } else { Err("no overlay windows found".into()) }
}

fn emit_overlay_event<R: Runtime>(app: &AppHandle<R>, event: &str, payload: impl Serialize + Clone) -> Result<(), String> {
    app.emit(event, payload).map_err(|e| format!("emit {event}: {e}"))
}

pub fn show_cursor<R: Runtime>(app: &AppHandle<R>, x: f64, y: f64, label: Option<String>) -> Result<(), String> {
    let id = next_id("cursor");
    let payload = CursorPayload {
        id: id.clone(),
        x, y,
        label: label.clone(),
        accent: None,
        animation: "none".into(),
        state: AnnotationState::Armed,
        from_x: None,
        from_y: None,
        control_x: None,
        control_y: None,
    };
    ensure_overlay_visible(app);
    // #9: soft glow bloom behind the cursor (same id → lifecycle expiry clears it).
    let _ = emit_overlay_event(
        app,
        "show-glow",
        serde_json::json!({
            "id": id.clone(),
            "x": x - 60.0,
            "y": y - 60.0,
            "w": 120.0,
            "h": 120.0,
            "label": label,
        }),
    );
    // #3: register with the annotation manager so the sweep expires it.
    register_cursor_annotation(
        app,
        id,
        CursorData { x, y, label: payload.label.clone(), accent: None, duration_ms: 5000 },
    );
    emit_overlay_event(app, "show-cursor", payload)
}

fn compute_arc_control_point(from_x: f64, from_y: f64, to_x: f64, to_y: f64) -> (f64, f64) {
    let mid_x = (from_x + to_x) / 2.0;
    let mid_y = (from_y + to_y) / 2.0;
    let dx = to_x - from_x;
    let dy = to_y - from_y;
    let dist = (dx * dx + dy * dy).sqrt().max(1.0);
    let offset = dist * 0.3;
    let perp_x = -dy / dist;
    let perp_y = dx / dist;
    (mid_x + perp_x * offset, mid_y + perp_y * offset)
}

pub fn show_animated_cursor<R: Runtime>(
    app: &AppHandle<R>,
    x: f64,
    y: f64,
    from_x: f64,
    from_y: f64,
    animation: &str,
    label: Option<String>,
    accent: Option<String>,
) -> Result<(), String> {
    let (control_x, control_y) = match animation {
        "arc" | "bounce" => {
            let (cx, cy) = compute_arc_control_point(from_x, from_y, x, y);
            (Some(cx), Some(cy))
        }
        _ => (None, None),
    };
    let payload = CursorPayload {
        id: next_id("cursor"),
        x, y,
        label,
        accent,
        animation: animation.into(),
        state: AnnotationState::Armed,
        from_x: Some(from_x),
        from_y: Some(from_y),
        control_x,
        control_y,
    };
    emit_overlay_event(app, "show-cursor", payload)
}

pub fn show_agent_dock<R: Runtime>(app: &AppHandle<R>, state: &AgentDockState) -> Result<(), String> {
    emit_overlay_event(app, "show-agent-dock", state)
}

pub fn hide_agent_dock<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    emit_overlay_event(app, "hide-agent-dock", serde_json::json!({}))
}

pub fn show_rect<R: Runtime>(app: &AppHandle<R>, x: f64, y: f64, w: f64, h: f64, label: Option<String>) -> Result<(), String> {
    let id = next_id("rect");
    let payload = RectPayload {
        id: id.clone(),
        x, y, w, h, label: label.clone(),
        state: AnnotationState::Armed,
    };
    ensure_overlay_visible(app);
    let _ = emit_overlay_event(
        app,
        "show-glow",
        serde_json::json!({
            "id": id.clone(),
            "x": x - 24.0,
            "y": y - 24.0,
            "w": w + 48.0,
            "h": h + 48.0,
            "label": label,
        }),
    );
    register_rect_annotation(app, id, payload.clone());
    emit_overlay_event(app, "show-rect", payload)
}

pub fn show_scribble<R: Runtime>(app: &AppHandle<R>, points: Vec<[f64; 2]>, label: Option<String>) -> Result<(), String> {
    let id = next_id("scribble");
    let payload = ScribblePayload { points: points.clone(), label: label.clone(), state: AnnotationState::Armed };
    ensure_overlay_visible(app);
    // Glow over the scribble's bounding box.
    if !points.is_empty() {
        let min_x = points.iter().map(|p| p[0]).fold(f64::INFINITY, f64::min);
        let max_x = points.iter().map(|p| p[0]).fold(f64::NEG_INFINITY, f64::max);
        let min_y = points.iter().map(|p| p[1]).fold(f64::INFINITY, f64::min);
        let max_y = points.iter().map(|p| p[1]).fold(f64::NEG_INFINITY, f64::max);
        let _ = emit_overlay_event(
            app,
            "show-glow",
            serde_json::json!({
                "id": id.clone(),
                "x": min_x - 20.0,
                "y": min_y - 20.0,
                "w": (max_x - min_x) + 40.0,
                "h": (max_y - min_y) + 40.0,
                "label": label,
            }),
        );
    }
    register_scribble_annotation(app, id, payload.clone());
    emit_overlay_event(app, "show-scribble", payload)
}

pub fn show_caption<R: Runtime>(app: &AppHandle<R>, text: &str, x: f64, y: f64) -> Result<(), String> {
    let id = next_id("caption");
    let payload = CaptionPayload {
        text: text.to_string(),
        x, y,
        state: AnnotationState::Armed,
    };
    ensure_overlay_visible(app);
    register_caption_annotation(app, id, payload.clone());
    emit_overlay_event(app, "show-caption", payload)
}

/// P-005: accent-tinted HIGHLIGHT annotation (emits `show-highlight`).
pub fn show_highlight<R: Runtime>(
    app: &AppHandle<R>,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    label: Option<String>,
) -> Result<(), String> {
    let id = next_id("highlight");
    ensure_overlay_visible(app);
    emit_overlay_event(
        app,
        "show-highlight",
        serde_json::json!({
            "id": id.clone(),
            "x": x,
            "y": y,
            "w": w,
            "h": h,
            "label": label,
        }),
    )?;
    schedule_hide_event(app, "hide-highlight", id);
    Ok(())
}

/// P-005: SHAPE annotation (arrow/curve, emits `show-shape`).
pub fn show_shape<R: Runtime>(
    app: &AppHandle<R>,
    shape_type: &str,
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
    label: Option<String>,
) -> Result<(), String> {
    let id = next_id("shape");
    let shape_type = if shape_type == "curve" { "curve" } else { "arrow" };
    ensure_overlay_visible(app);
    emit_overlay_event(
        app,
        "show-shape",
        serde_json::json!({
            "id": id.clone(),
            "shapeType": shape_type,
            "x1": x1,
            "y1": y1,
            "x2": x2,
            "y2": y2,
            "label": label,
        }),
    )?;
    schedule_hide_event(app, "hide-shape", id);
    Ok(())
}

pub fn clear_overlays<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    emit_overlay_event(app, "clear-overlays", serde_json::json!({}))
}

pub fn clear_overlays_on_screen<R: Runtime>(app: &AppHandle<R>, screen_idx: usize) -> Result<(), String> {
    let window_label = format!("overlay-{}", screen_idx);
    if let Some(window) = app.get_webview_window(&window_label) {
        window
            .emit("clear-overlays", serde_json::json!({}))
            .map_err(|e| format!("emit on {window_label}: {e}"))
    } else {
        emit_overlay_event(app, "clear-overlays", serde_json::json!({}))
    }
}

pub fn show_cursor_on_screen<R: Runtime>(
    app: &AppHandle<R>,
    x: f64,
    y: f64,
    label: Option<String>,
    screen_idx: usize,
) -> Result<(), String> {
    let payload = CursorPayload {
        id: next_id("cursor"),
        x, y,
        label,
        accent: None,
        animation: "none".into(),
        state: AnnotationState::Armed,
        from_x: None,
        from_y: None,
        control_x: None,
        control_y: None,
    };
    let window_label = format!("overlay-{}", screen_idx);
    if let Some(window) = app.get_webview_window(&window_label) {
        window
            .emit("show-cursor", payload)
            .map_err(|e| format!("emit on {window_label}: {e}"))
    } else {
        emit_overlay_event(app, "show-cursor", payload)
    }
}

pub fn show_rect_on_screen<R: Runtime>(
    app: &AppHandle<R>,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    label: Option<String>,
    screen_idx: usize,
) -> Result<(), String> {
    let payload = RectPayload {
        id: next_id("rect"),
        x, y, w, h, label,
        state: AnnotationState::Armed,
    };
    let window_label = format!("overlay-{}", screen_idx);
    if let Some(window) = app.get_webview_window(&window_label) {
        window
            .emit("show-rect", payload)
            .map_err(|e| format!("emit on {window_label}: {e}"))
    } else {
        emit_overlay_event(app, "show-rect", payload)
    }
}

pub fn show_scribble_on_screen<R: Runtime>(
    app: &AppHandle<R>,
    points: Vec<[f64; 2]>,
    label: Option<String>,
    screen_idx: usize,
) -> Result<(), String> {
    let payload = ScribblePayload { points, label, state: AnnotationState::Armed };
    let window_label = format!("overlay-{}", screen_idx);
    if let Some(window) = app.get_webview_window(&window_label) {
        window
            .emit("show-scribble", payload)
            .map_err(|e| format!("emit on {window_label}: {e}"))
    } else {
        emit_overlay_event(app, "show-scribble", payload)
    }
}

pub fn show_caption_on_screen<R: Runtime>(
    app: &AppHandle<R>,
    text: &str,
    x: f64,
    y: f64,
    screen_idx: usize,
) -> Result<(), String> {
    let payload = CaptionPayload {
        text: text.to_string(),
        x, y,
        state: AnnotationState::Armed,
    };
    let window_label = format!("overlay-{}", screen_idx);
    if let Some(window) = app.get_webview_window(&window_label) {
        window
            .emit("show-caption", payload)
            .map_err(|e| format!("emit on {window_label}: {e}"))
    } else {
        emit_overlay_event(app, "show-caption", payload)
    }
}

pub fn show_animated_cursor_on_screen<R: Runtime>(
    app: &AppHandle<R>,
    x: f64,
    y: f64,
    from_x: f64,
    from_y: f64,
    animation: &str,
    label: Option<String>,
    accent: Option<String>,
    screen_idx: usize,
) -> Result<(), String> {
    let (control_x, control_y) = match animation {
        "arc" | "bounce" => {
            let (cx, cy) = compute_arc_control_point(from_x, from_y, x, y);
            (Some(cx), Some(cy))
        }
        _ => (None, None),
    };
    let payload = CursorPayload {
        id: next_id("cursor"),
        x, y,
        label,
        accent,
        animation: animation.into(),
        state: AnnotationState::Armed,
        from_x: Some(from_x),
        from_y: Some(from_y),
        control_x,
        control_y,
    };
    let window_label = format!("overlay-{}", screen_idx);
    if let Some(window) = app.get_webview_window(&window_label) {
        window
            .emit("show-cursor", payload)
            .map_err(|e| format!("emit on {window_label}: {e}"))
    } else {
        emit_overlay_event(app, "show-cursor", payload)
    }
}

pub fn start_hotplug_poll<R: Runtime>(app: AppHandle<R>, url: &str) {
    use window_manager::OverlayWindowManager;
    let url = url.to_string();
    std::thread::spawn(move || {
        // Initialize with current state so first tick doesn't trigger creation
        let (mut last_count, mut last_geoms) = match xcap::Monitor::all() {
            Ok(m) => {
                let geoms: Vec<_> = m.iter()
                    .map(|mon| (mon.x().unwrap_or(0), mon.y().unwrap_or(0), mon.width().unwrap_or(0), mon.height().unwrap_or(0)))
                    .collect();
                let count = geoms.len();
                (count, geoms)
            }
            Err(_) => (0, Vec::new()),
        };
        loop {
            std::thread::sleep(std::time::Duration::from_secs(3));

            let current = match xcap::Monitor::all() {
                Ok(m) => m
                    .iter()
                    .map(|mon| (mon.x().unwrap_or(0), mon.y().unwrap_or(0), mon.width().unwrap_or(0), mon.height().unwrap_or(0)))
                    .collect::<Vec<_>>(),
                Err(_) => continue,
            };

            if current.len() != last_count || current != last_geoms {
                log::info!(
                    "Display configuration changed: {} monitors (was {})",
                    current.len(),
                    last_count
                );
                last_count = current.len();
                last_geoms = current.clone();

                // #2: refresh through the window manager created at startup so we
                // never duplicate window labels.
                if let Some(wm_mutex) = app.try_state::<Mutex<OverlayWindowManager<R>>>() {
                    match wm_mutex.lock() {
                        Ok(mut wm) => {
                            if let Err(e) = wm.refresh_windows(&app, &url) {
                                log::error!("Hotplug window refresh failed: {e}");
                            } else {
                                let _ = app.emit(
                                    "display-config-changed",
                                    serde_json::json!({ "monitor_count": last_count }),
                                );
                            }
                        }
                        Err(e) => log::error!("Hotplug: window manager lock error: {e}"),
                    }
                } else {
                    log::warn!("Hotplug: overlay window manager not initialized");
                }
            }
        }
    });
}

pub fn get_screen_for_point(x: f64, y: f64) -> usize {
    if let Ok(all) = xcap::Monitor::all() {
        for (i, m) in all.iter().enumerate() {
            if x >= m.x().unwrap_or(0) as f64
                && x < (m.x().unwrap_or(0) + m.width().unwrap_or(0) as i32) as f64
                && y >= m.y().unwrap_or(0) as f64
                && y < (m.y().unwrap_or(0) + m.height().unwrap_or(0) as i32) as f64
            {
                return i;
            }
        }
    }
    0
}

/// Get the screen index for a point using cached ScreenManager.
pub fn get_screen_for_point_cached(x: f64, y: f64, manager: &crate::overlay::screen_router::ScreenManager) -> usize {
    manager.monitors().iter().position(|m| {
        x >= m.x as f64
            && x < (m.x + m.width as i32) as f64
            && y >= m.y as f64
            && y < (m.y + m.height as i32) as f64
    }).unwrap_or(0)
}
