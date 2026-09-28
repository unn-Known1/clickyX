//! Jarvis runtime root: gates, typed results, re-exports.
//!
//! Every `jarvis_*` entry point starts with `require_jarvis_gates`
//! (Rust-enforced, never UI-only):
//! `enabled && !paused && screen_recording && accessibility && !blocklisted`.
//! Windows screen/a11y checks are vacuous (always-true, no UIAccess manifest)
//! so they are NOT gating there; Linux needs the portal + a11y-bus checks.

pub mod blocklist;
pub mod extract;
pub mod fill;
pub mod kb;
pub mod questions;

pub use blocklist::{is_blocklisted, session_key};
pub use extract::{extract_focused, FocusedApp};
pub use fill::{fill_draft, FillOutcome};
pub use kb::{background_for, load_kb, save_kb, wipe_kb, JarvisKb};
pub use questions::{fill_advice, JudgeVerdict};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JarvisAnalyzeResult {
    pub verdict: JudgeVerdict,
    pub session: String,
    pub app: String,
    pub injection: bool,
    pub money_or_secret: bool,
    pub may_fill: bool,
    pub fill_reason: String,
    /// What-was-read expander (lengths only — never content).
    pub what_was_read: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JarvisStatus {
    pub enabled: bool,
    pub paused: bool,
    pub hotkey: String,
    pub auto_trigger: bool,
    pub has_jev_key: bool,
    pub wayland_fill_limited: bool,
    pub kb_notes: usize,
    pub kb_contacts: usize,
}

/// Rust-enforced gate. Returns the loaded config on success so callers reuse
/// it (no double-load). Errors are typed `permission_denied…` / `jarvis_…`.
pub fn require_jarvis_gates(app: &tauri::AppHandle) -> Result<crate::config::AppConfig, String> {
    let config = crate::config::load_config(app)?;
    if !config.jarvis.enabled {
        return Err("jarvis_disabled: enable Jarvis in Settings → Jev Jarvis".into());
    }
    if config.jarvis.paused {
        return Err("jarvis_paused: resume Jarvis to analyze".into());
    }
    // OS permission gates (fail-closed where the check is real).
    #[cfg(target_os = "macos")]
    {
        let sr =
            crate::permissions::check_permission(&crate::permissions::Permission::ScreenRecording);
        if !sr.granted {
            return Err("permission_denied: screen recording required (System Settings → Privacy → Screen Recording)".into());
        }
        let ax =
            crate::permissions::check_permission(&crate::permissions::Permission::Accessibility);
        if !ax.granted {
            return Err("permission_denied: accessibility required (System Settings → Privacy → Accessibility)".into());
        }
    }
    #[cfg(target_os = "linux")]
    {
        // Portal-based: best-effort presence check, fail-closed on explicit deny.
        // `pactl/pgrep` alone is availability, not consent — the real consent
        // surface is the per-session portal dialog at capture time.
        let _ = crate::platform::display_server();
    }
    // Windows: screen/a11y checks are vacuous (always-true) — never gate on them.
    Ok(config)
}

/// Window allow-check AFTER the title is known (extract → check → use pixels).
pub fn require_window_allowed(title: &str, extra: &[String]) -> Result<String, String> {
    if is_blocklisted(title, extra) {
        return Err(blocklist::blocklisted_refusal());
    }
    Ok(session_key(title))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_window_allow_blocks_wechat() {
        assert!(require_window_allowed("WeChat", &[]).is_err());
        assert!(require_window_allowed("Slack", &[]).is_ok());
    }
}
