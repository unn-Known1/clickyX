//! Focused-window extraction ladder (MVP: a11y title/geometry + vision-LLM).
//!
//! - Step 1 (free, always): window title via xcap (never bubble text).
//! - Step 2 (MVP): focused-window JPEG reused as the vision input — the
//!   frontend (or a future `jarvis_analyze_image` caller) sends it to
//!   `chat_with_vision`. No OCR crate in this phase.
//! - Native AT-SPI2/UIA/AX FFI, Wayland portal picker, and Rust OCR are
//!   Phase-4 follow-ups (see report §7). Wayland focused-window capture is
//!   best-effort: xcap falls back to the primary monitor and we say so.
//!
//! Logging rule: `len + dims` only — never title bytes, never pixels.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FocusedApp {
    pub title: String,
    pub app_name: String,
    pub session: String,
    pub width: u32,
    pub height: u32,
    /// JPEG base64 (focused window; primary-monitor fallback when no focused
    /// window exists — caller records `fallback: true` in that case).
    pub image_base64: String,
    pub fallback: bool,
    pub display_server: String,
}

/// Extract the focused app: title + JPEG. Enforces nothing by itself —
/// callers run `require_window_allowed` (blocklist) BEFORE using the pixels.
pub fn extract_focused() -> Result<FocusedApp, String> {
    let display_server = crate::platform::display_server().to_string();

    // Title pass (cheap). Proven xcap API only: all/title/is_focused.
    let mut title = String::new();
    if let Ok(windows) = xcap::Window::all() {
        for w in &windows {
            if w.is_focused().unwrap_or(false) {
                if let Ok(t) = w.title() {
                    if !t.trim().is_empty() {
                        title = t;
                        break;
                    }
                }
            }
        }
    }

    // Pixel pass reuses the tested capture path (quality 85, fallback inside).
    let (img, fallback) = match crate::screen::capture::capture_focused_window() {
        Ok(Some(i)) => (i, false),
        Ok(None) => {
            let all = crate::screen::capture::capture_all_screens()?;
            let first = all.into_iter().next().ok_or("no monitors found")?;
            (first, true)
        }
        Err(e) => return Err(e),
    };

    if title.trim().is_empty() {
        title = "unknown window".to_string();
    }
    let app_name = title.clone();
    let session = super::blocklist::session_key(&title);

    let focused = FocusedApp {
        title,
        app_name,
        session,
        width: img.width,
        height: img.height,
        image_base64: img.data_base64,
        fallback,
        display_server,
    };
    log::info!("jarvis extract: {}", extract_summary(&focused));
    Ok(focused)
}

/// One-line declassified summary for logs/status (no title, no pixels).
pub fn extract_summary(f: &FocusedApp) -> String {
    format!(
        "session={} {}x{} img_len={} fallback={} ds={}",
        f.session,
        f.width,
        f.height,
        f.image_base64.len(),
        f.fallback,
        f.display_server
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_summary_redacts_title_and_pixels() {
        let f = FocusedApp {
            title: "Super Secret Chat".into(),
            app_name: "chat".into(),
            session: "jarvis-abc".into(),
            width: 800,
            height: 600,
            image_base64: "aGVsbG8=".into(),
            fallback: false,
            display_server: "x11".into(),
        };
        let s = extract_summary(&f);
        assert!(!s.contains("Secret"));
        assert!(!s.contains("aGVsbG8"));
        assert!(s.contains("800x600"));
    }
}
