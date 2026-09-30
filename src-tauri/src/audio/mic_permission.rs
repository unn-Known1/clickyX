//! macOS microphone/camera permission via AVFoundation (#113).
//!
//! `cpal` opens CoreAudio directly and never triggers the TCC microphone
//! prompt, so without an in-process
//! `AVCaptureDevice.requestAccess(for:)` call the app never appears in
//! System Settings → Privacy & Security → Microphone and every voice path
//! (always-on, hold-to-talk, wake word) fails silently.
//!
//! The old `permissions.rs` approach — reading `TCC.db` via `sqlite3` —
//! could only *observe* a grant (and only with Full Disk Access); it could
//! never *request* one. This module performs the real request and reads the
//! real authorization status. Non-macOS platforms keep their existing
//! OS-specific checks; the stubs below are permissive no-ops so shared
//! call sites (`capture.rs`, `permissions.rs`) stay cross-platform.

#[cfg(target_os = "macos")]
use block2::StackBlock;
#[cfg(target_os = "macos")]
use objc2::runtime::Bool;
#[cfg(target_os = "macos")]
use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaType};

/// AV media services that need an in-process TCC prompt on macOS.
#[cfg(target_os = "macos")]
#[derive(Clone, Copy)]
enum MediaKind {
    Audio,
    Video,
}

#[cfg(target_os = "macos")]
impl MediaKind {
    fn media_type(self) -> Result<&'static AVMediaType, String> {
        // SAFETY: reading an extern static provided by AVFoundation; the
        // audio/video media-type constants are always present.
        let mt = unsafe {
            match self {
                MediaKind::Audio => objc2_av_foundation::AVMediaTypeAudio,
                MediaKind::Video => objc2_av_foundation::AVMediaTypeVideo,
            }
        };
        mt.ok_or_else(|| "AVFoundation media type unavailable".to_string())
    }

    fn settings_pane(self) -> &'static str {
        match self {
            MediaKind::Audio => "Microphone",
            MediaKind::Video => "Camera",
        }
    }

    fn denied_message(self) -> String {
        format!(
            "{} access denied — grant it in System Settings > Privacy & Security > {}, then relaunch the app (TCC requires a restart to take effect)",
            self.settings_pane(),
            self.settings_pane()
        )
    }
}

/// Synchronous TCC status read — never prompts, never touches `TCC.db`.
#[cfg(target_os = "macos")]
fn access_granted(kind: MediaKind) -> bool {
    kind.media_type()
        .map(|mt| {
            // SAFETY: pure class-method status query, no callbacks.
            unsafe { AVCaptureDevice::authorizationStatusForMediaType(mt) == AVAuthorizationStatus::Authorized }
        })
        .unwrap_or(false)
}

/// Prompt the user when status is `NotDetermined`, then block (up to 60 s)
/// until they answer. Returns `Ok` only when actually authorized, so
/// callers can surface the remediation instead of failing silently.
#[cfg(target_os = "macos")]
fn ensure_access(kind: MediaKind) -> Result<(), String> {
    let mt = kind.media_type()?;
    // SAFETY: pure class-method status query, no callbacks.
    let status = unsafe { AVCaptureDevice::authorizationStatusForMediaType(mt) };
    if status == AVAuthorizationStatus::Authorized {
        return Ok(());
    }
    if status == AVAuthorizationStatus::Denied || status == AVAuthorizationStatus::Restricted {
        return Err(kind.denied_message());
    }

    // NotDetermined: request in-process. AVFoundation copies completion
    // blocks synchronously on call, and we block on `rx` below so this
    // stack frame outlives the prompt — the stack block cannot dangle.
    let (tx, rx) = std::sync::mpsc::channel::<bool>();
    let handler = StackBlock::new(move |granted: Bool| {
        let _ = tx.send(granted.as_bool());
    });
    // SAFETY: system prompt API; the handler is copied before return.
    unsafe {
        AVCaptureDevice::requestAccessForMediaType_completionHandler(mt, &handler);
    }
    match rx.recv_timeout(std::time::Duration::from_secs(60)) {
        Ok(true) => Ok(()),
        Ok(false) => Err(kind.denied_message()),
        Err(_) => Err(format!(
            "{} permission request timed out — grant access in System Settings > Privacy & Security > {}, then relaunch the app",
            kind.settings_pane(),
            kind.settings_pane()
        )),
    }
}

#[cfg(target_os = "macos")]
pub fn microphone_access_granted() -> bool {
    access_granted(MediaKind::Audio)
}

#[cfg(target_os = "macos")]
pub fn camera_access_granted() -> bool {
    access_granted(MediaKind::Video)
}

#[cfg(target_os = "macos")]
pub fn ensure_microphone_access() -> Result<(), String> {
    ensure_access(MediaKind::Audio)
}

#[cfg(target_os = "macos")]
pub fn ensure_camera_access() -> Result<(), String> {
    ensure_access(MediaKind::Video)
}

// ────────────────────────────────────────────────────────────────────────────
// Non-macOS stubs: other platforms keep their own checks in permissions.rs.
// ────────────────────────────────────────────────────────────────────────────

#[cfg(not(target_os = "macos"))]
pub fn microphone_access_granted() -> bool {
    true
}

#[cfg(not(target_os = "macos"))]
pub fn camera_access_granted() -> bool {
    true
}

#[cfg(not(target_os = "macos"))]
pub fn ensure_microphone_access() -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn ensure_camera_access() -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stubs_are_permissive_off_macos() {
        // On macOS these hit the real TCC state (no prompt for the
        // status read), so only assert the no-op contract elsewhere.
        #[cfg(not(target_os = "macos"))]
        {
            assert!(microphone_access_granted());
            assert!(camera_access_granted());
            assert!(ensure_microphone_access().is_ok());
            assert!(ensure_camera_access().is_ok());
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn denied_message_names_remediation() {
        for kind in [MediaKind::Audio, MediaKind::Video] {
            let msg = kind.denied_message();
            assert!(msg.contains(kind.settings_pane()), "{msg}");
            assert!(msg.contains("System Settings"), "{msg}");
            assert!(msg.contains("relaunch"), "{msg}");
        }
    }
}
