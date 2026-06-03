use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ScreenImage {
    pub id: u32,
    pub width: u32,
    pub height: u32,
    pub data_base64: String,
}

pub fn capture_all_screens() -> Result<Vec<ScreenImage>, String> {
    log::warn!("Screen capture not yet implemented (Phase 3)");
    Ok(vec![])
}

pub fn capture_cursor_screen() -> Result<ScreenImage, String> {
    log::warn!("Cursor screen capture not yet implemented (Phase 3)");
    Err("Screen capture not yet implemented".into())
}

pub fn capture_focused_window() -> Result<Option<ScreenImage>, String> {
    log::warn!("Focused window capture not yet implemented (Phase 3)");
    Ok(None)
}
