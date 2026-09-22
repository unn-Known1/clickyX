//! overlay_cmds: Tauri command handlers (split from commands.rs in P3).
//!
//! Re-exported through `crate::commands`; `commands::foo` paths keep working.

use tauri::AppHandle;

use super::types::*;

#[tauri::command]
pub fn overlay_show_cursor(
    app: AppHandle,
    x: f64,
    y: f64,
    label: Option<String>,
) -> Result<(), String> {
    crate::overlay::show_cursor(&app, x, y, label)
}

#[tauri::command]
pub fn overlay_show_cursor_on_screen(
    app: AppHandle,
    x: f64,
    y: f64,
    label: Option<String>,
    screen_idx: usize,
) -> Result<(), String> {
    crate::overlay::show_cursor_on_screen(&app, x, y, label, screen_idx)
}

#[tauri::command]
pub fn overlay_show_cursors(app: AppHandle, cursors: Vec<CursorCommand>) -> Result<(), String> {
    for c in cursors {
        crate::overlay::show_cursor(&app, c.x, c.y, c.label)?;
    }
    Ok(())
}

#[tauri::command]
// P2 (clippy): Tauri command arity mirrors the overlay API; grouped in P3.
#[allow(clippy::too_many_arguments)]
pub fn overlay_show_animated_cursor(
    app: AppHandle,
    x: f64,
    y: f64,
    from_x: f64,
    from_y: f64,
    animation: String,
    label: Option<String>,
    accent: Option<String>,
) -> Result<(), String> {
    crate::overlay::show_animated_cursor(&app, x, y, from_x, from_y, &animation, label, accent)
}

#[tauri::command]
// P2 (clippy): Tauri command arity mirrors the overlay API; grouped in P3.
#[allow(clippy::too_many_arguments)]
pub fn overlay_show_animated_cursor_on_screen(
    app: AppHandle,
    x: f64,
    y: f64,
    from_x: f64,
    from_y: f64,
    animation: String,
    label: Option<String>,
    accent: Option<String>,
    screen_idx: usize,
) -> Result<(), String> {
    crate::overlay::show_animated_cursor_on_screen(
        &app, x, y, from_x, from_y, &animation, label, accent, screen_idx,
    )
}

#[tauri::command]
pub fn overlay_show_agent_dock(
    app: AppHandle,
    state: crate::agent::dock::AgentDockState,
) -> Result<(), String> {
    crate::overlay::show_agent_dock(&app, &state)
}

#[tauri::command]
pub fn overlay_hide_agent_dock(app: AppHandle) -> Result<(), String> {
    crate::overlay::hide_agent_dock(&app)
}

#[tauri::command]
pub fn overlay_show_rect(
    app: AppHandle,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    label: Option<String>,
) -> Result<(), String> {
    crate::overlay::show_rect(&app, x, y, w, h, label)
}

#[tauri::command]
pub fn overlay_show_rect_on_screen(
    app: AppHandle,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    label: Option<String>,
    screen_idx: usize,
) -> Result<(), String> {
    crate::overlay::show_rect_on_screen(&app, x, y, w, h, label, screen_idx)
}

#[tauri::command]
pub fn overlay_show_scribble(
    app: AppHandle,
    points: Vec<[f64; 2]>,
    label: Option<String>,
) -> Result<(), String> {
    crate::overlay::show_scribble(&app, points, label)
}

#[tauri::command]
pub fn overlay_show_scribble_on_screen(
    app: AppHandle,
    points: Vec<[f64; 2]>,
    label: Option<String>,
    screen_idx: usize,
) -> Result<(), String> {
    crate::overlay::show_scribble_on_screen(&app, points, label, screen_idx)
}

#[tauri::command]
pub fn overlay_show_caption(app: AppHandle, text: String, x: f64, y: f64) -> Result<(), String> {
    crate::overlay::show_caption(&app, &text, x, y)
}

#[tauri::command]
pub fn overlay_show_caption_on_screen(
    app: AppHandle,
    text: String,
    x: f64,
    y: f64,
    screen_idx: usize,
) -> Result<(), String> {
    crate::overlay::show_caption_on_screen(&app, &text, x, y, screen_idx)
}

#[tauri::command]
pub fn overlay_clear(app: AppHandle) -> Result<(), String> {
    crate::overlay::clear_overlays(&app)
}

// ── Overlay highlight / shape commands (P-005) ───────────────────────────────
// These bridge the gap between the Rust overlay module's show_highlight/show_shape
// helpers and what the frontend can invoke via Tauri commands.

#[tauri::command]
pub fn overlay_show_highlight(
    app: AppHandle,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    label: Option<String>,
) -> Result<(), String> {
    crate::overlay::show_highlight(&app, x, y, w, h, label)
}

#[tauri::command]
pub fn overlay_show_shape(
    app: AppHandle,
    shape_type: String,
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
    label: Option<String>,
) -> Result<(), String> {
    crate::overlay::show_shape(&app, &shape_type, x1, y1, x2, y2, label)
}
