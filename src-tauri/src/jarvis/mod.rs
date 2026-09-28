//! Jarvis runtime root: gates, typed results, re-exports.
//!
//! Every `jarvis_*` entry point starts with `require_jarvis_gates`
//! (Rust-enforced, never UI-only):
//! `enabled && !paused && screen_recording && accessibility && !blocklisted`.
//!
//! Per-OS enforcement level (honest accounting, R-MAJ-8):
//! - macOS: REAL gates — Screen Recording + Accessibility are checked via the
//!   OS permission APIs and denial is fail-closed.
//! - Windows: NOT enforced — no UIAccess manifest is shipped, so there is no
//!   OS screen/a11y check to gate on; Jarvis proceeds after a one-time
//!   warning (capture-time consent still applies wherever the OS prompts).
//! - Linux: INFORMATIONAL only — `display_server()` reports availability,
//!   not consent; the real consent surface is the per-session portal dialog
//!   at capture time. Never treated as a gate.

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
        // Informational only: never a gate (see module docs).
        let _ = crate::platform::display_server();
        warn_once_non_macos_gates();
    }
    #[cfg(target_os = "windows")]
    {
        // No UIAccess manifest is shipped: there is no OS screen/a11y check
        // to gate on. Proceed after a one-time warning (see module docs).
        warn_once_non_macos_gates();
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        warn_once_non_macos_gates();
    }
    Ok(config)
}

/// One-time warning for platforms without real OS permission gates (R-MAJ-8).
#[cfg(not(target_os = "macos"))]
fn warn_once_non_macos_gates() {
    static WARNED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if !WARNED.swap(true, std::sync::atomic::Ordering::Relaxed) {
        log::warn!(
            "jarvis gates: OS screen/accessibility checks are not enforced on this platform \
             (real gates exist on macOS via TCC only); capture-time consent still applies"
        );
    }
}

/// Window allow-check AFTER the title is known (extract → check → use pixels).
pub fn require_window_allowed(title: &str, extra: &[String]) -> Result<String, String> {
    if is_blocklisted(title, extra) {
        return Err(blocklist::blocklisted_refusal());
    }
    Ok(session_key(title))
}

/// Server-side focus re-resolution (S-MAJ-1).
/// Resolves the OS focused window FRESH via `extract_focused()` and enforces,
/// fail-closed, never trusting the caller-supplied `app_id`:
/// - focus resolution failure → refuse;
/// - focused title blocklisted (incl. empty/unknown) → refuse;
/// - caller `app_id` blocklisted → refuse (defense in depth);
/// - caller `app_id` mismatches the fresh focus (neither normalized form
///   contains the other) → refuse as stale/spoofed.
///
/// Returns the trusted OS title on success. Never logs title bytes.
pub fn require_focused_window_allowed(app_id: &str, extra: &[String]) -> Result<String, String> {
    let focused = extract::extract_focused().map_err(|e| {
        format!("refusing Jarvis action: could not resolve the focused window ({e})")
    })?;
    // Trust the OS reading, never the caller claim.
    require_window_allowed(&focused.title, extra)?;
    // The caller's claim must ALSO be clean.
    require_window_allowed(app_id, extra)?;
    let norm_focused = blocklist::normalize_window_title(&focused.title);
    let norm_claim = blocklist::normalize_window_title(app_id);
    if norm_focused != norm_claim
        && !norm_focused.contains(&norm_claim)
        && !norm_claim.contains(&norm_focused)
    {
        log::warn!(
            "jarvis: focused-window mismatch (lengths: focused={} claim={})",
            norm_focused.len(),
            norm_claim.len()
        );
        return Err(
            "refusing Jarvis action: focused window changed since extract — re-extract before retry"
                .into(),
        );
    }
    Ok(focused.title)
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
