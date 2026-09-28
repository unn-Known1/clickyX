//! Fill-only paste (never Enter, never send-click, never a11y press/click/submit).
//!
//! Flow: save original clipboard → set draft → paste (Ctrl/Cmd+V) → restore
//! original within seconds (or clear). Every step is best-effort except the
//! REFUSALS, which are hard errors unit-tested below.
//!
//! - Refuse on: empty text, `press|click|submit`-shaped action requests
//!   (callers must never route those here), Wayland without RemoteDesktop
//!   (copy-only v1 — we copy and report `filled:false, copied:true`).
//! - Secret scan: key/password-shaped drafts force manual-confirm upstream;
//!   this module re-scans and refuses to AUTO-paste on hit (copy-only).
//! - Never logs bytes: `len` only.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FillOutcome {
    pub filled: bool,
    pub copied: bool,
    /// `clipboard-paste` | `copy-only-wayland` | `copy-only-refused-paste`.
    pub mode: String,
    pub restored: bool,
}

fn clipboard() -> Result<arboard::Clipboard, String> {
    arboard::Clipboard::new().map_err(|e| format!("clipboard unavailable: {e}"))
}

/// Hard refusal: action-shaped fills must never reach the paste path.
pub fn refuse_action_shape(action: &str) -> Result<(), String> {
    let a = action.trim().to_ascii_lowercase();
    match a.as_str() {
        "press" | "click" | "submit" | "enter" | "send" => Err(format!(
            "refusing Jarvis fill for action '{action}': fill-only paste, never key/send actions"
        )),
        _ => Ok(()),
    }
}

pub fn is_wayland() -> bool {
    #[cfg(target_os = "linux")]
    {
        crate::platform::display_server() == "wayland"
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

/// Copy text to the clipboard (len-logged only). Used by copy-only paths and
/// as step 2 of the paste flow.
pub fn copy_text(text: &str) -> Result<(), String> {
    if text.is_empty() {
        return Err("refusing to fill empty text".into());
    }
    if text.len() > 4000 {
        return Err("draft exceeds 4000 chars (split before fill)".into());
    }
    let mut cb = clipboard()?;
    cb.set_text(text.to_string())
        .map_err(|e| format!("clipboard set failed: {e}"))?;
    log::info!("jarvis fill: copied draft len={}", text.len());
    Ok(())
}

fn restore_clipboard(original: Option<String>) -> bool {
    let mut cb = match clipboard() {
        Ok(c) => c,
        Err(_) => return false,
    };
    match original {
        Some(t) if !t.is_empty() => cb.set_text(t).is_ok(),
        _ => cb.set_text(String::new()).is_ok(),
    }
}

fn press_paste_combo() -> Result<(), String> {
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("enigo: {e}"))?;
    #[cfg(target_os = "macos")]
    let modifier = Key::Meta;
    #[cfg(not(target_os = "macos"))]
    let modifier = Key::Control;
    enigo
        .key(modifier, Direction::Press)
        .map_err(|e| format!("paste press: {e}"))?;
    let r = enigo.key(Key::Unicode('v'), Direction::Click);
    let _ = enigo.key(modifier, Direction::Release);
    r.map_err(|e| format!("paste key: {e}"))
}

/// Fill-only paste. On Wayland (no programmatic focus) or any paste failure,
/// degrades HONESTLY to copy-only (`filled:false, copied:true`).
pub fn fill_draft(text: &str) -> Result<FillOutcome, String> {
    if text.trim().is_empty() {
        return Err("refusing to fill empty text".into());
    }
    if text.len() > 4000 {
        return Err("draft exceeds 4000 chars (split before fill)".into());
    }
    // Secret-shaped drafts never auto-paste (copy-only; user confirms).
    if super::questions::detect_money_or_secret(text) {
        copy_text(text)?;
        return Ok(FillOutcome {
            filled: false,
            copied: true,
            mode: "copy-only-refused-paste".into(),
            restored: false,
        });
    }

    let original: Option<String> = clipboard().ok().and_then(|mut cb| cb.get_text().ok());

    copy_text(text)?;

    if is_wayland() {
        log::info!("jarvis fill: wayland copy-only len={}", text.len());
        return Ok(FillOutcome {
            filled: false,
            copied: true,
            mode: "copy-only-wayland".into(),
            restored: false,
        });
    }

    match press_paste_combo() {
        Ok(()) => {
            std::thread::sleep(std::time::Duration::from_millis(300));
            let restored = restore_clipboard(original);
            log::info!("jarvis fill: pasted len={} restored={restored}", text.len());
            Ok(FillOutcome {
                filled: true,
                copied: true,
                mode: "clipboard-paste".into(),
                restored,
            })
        }
        Err(e) => {
            log::warn!(
                "jarvis fill: paste failed ({e}) — copy-only len={}",
                text.len()
            );
            Ok(FillOutcome {
                filled: false,
                copied: true,
                mode: "copy-only-refused-paste".into(),
                restored: false,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_refuse_action_shapes() {
        for a in ["press", "click", "submit", "Enter", "SEND"] {
            assert!(refuse_action_shape(a).is_err(), "should refuse {a}");
        }
        assert!(refuse_action_shape("paste-text").is_ok());
    }

    #[test]
    fn test_fill_refuses_empty_and_oversize() {
        assert!(fill_draft("").is_err());
        assert!(fill_draft("   ").is_err());
        assert!(fill_draft(&"x".repeat(4001)).is_err());
    }
}
