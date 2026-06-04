use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Permission {
    Microphone,
    ScreenRecording,
    Notifications,
    Camera,
    Accessibility,
}

impl Permission {
    pub fn name(&self) -> &str {
        match self {
            Self::Microphone => "microphone",
            Self::ScreenRecording => "screen_recording",
            Self::Notifications => "notifications",
            Self::Camera => "camera",
            Self::Accessibility => "accessibility",
        }
    }

    pub fn from_name(s: &str) -> Option<Self> {
        match s {
            "microphone" => Some(Self::Microphone),
            "screen_recording" => Some(Self::ScreenRecording),
            "notifications" => Some(Self::Notifications),
            "camera" => Some(Self::Camera),
            "accessibility" => Some(Self::Accessibility),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionStatus {
    pub permission: String,
    pub granted: bool,
    pub description: String,
}

// ────────────────────────────────────────────────────────────────────────────
// macOS implementation
// ────────────────────────────────────────────────────────────────────────────
#[cfg(target_os = "macos")]
fn check_os_permission(perm: &Permission) -> PermissionStatus {
    match perm {
        Permission::Microphone => {
            // Query the TCC database for microphone access.
            // The system TCC DB lives at /Library/Application Support/com.apple.TCC/TCC.db
            // and the user-level at ~/Library/Application Support/com.apple.TCC/TCC.db.
            // We check both with sqlite3. A "granted" row has auth_value=2.
            let granted = check_tcc_permission("kTCCServiceMicrophone");
            PermissionStatus {
                permission: perm.name().into(),
                granted,
                description: if granted {
                    "macOS: microphone access granted".into()
                } else {
                    "macOS: microphone access not granted — open System Settings > Privacy & Security > Microphone".into()
                },
            }
        }
        Permission::ScreenRecording => {
            // Try a test screencapture to a temp file. If screen recording is denied,
            // screencapture exits with an error or produces an empty file.
            let granted = check_screen_recording();
            PermissionStatus {
                permission: perm.name().into(),
                granted,
                description: if granted {
                    "macOS: screen recording access granted".into()
                } else {
                    "macOS: screen recording not granted — open System Settings > Privacy & Security > Screen Recording".into()
                },
            }
        }
        Permission::Notifications => {
            // Notifications: check TCC for kTCCServiceNotifications. Falls back to true
            // if the DB is unreadable (e.g., sandbox restrictions).
            let granted = check_tcc_permission("kTCCServiceUserNotification");
            PermissionStatus {
                permission: perm.name().into(),
                granted,
                description: if granted {
                    "macOS: notifications permitted".into()
                } else {
                    "macOS: notifications not permitted — open System Settings > Notifications".into()
                },
            }
        }
        Permission::Camera => {
            let granted = check_tcc_permission("kTCCServiceCamera");
            PermissionStatus {
                permission: perm.name().into(),
                granted,
                description: if granted {
                    "macOS: camera access granted".into()
                } else {
                    "macOS: camera access not granted — open System Settings > Privacy & Security > Camera".into()
                },
            }
        }
        Permission::Accessibility => {
            // Use osascript to attempt a UI scripting operation.
            // If Accessibility is not granted, osascript returns a non-zero exit code.
            let result = Command::new("osascript")
                .args([
                    "-e",
                    "tell application \"System Events\" to return name of every process whose visible is true",
                ])
                .output();
            let granted = match result {
                Ok(out) => out.status.success(),
                Err(_) => false,
            };
            PermissionStatus {
                permission: perm.name().into(),
                granted,
                description: if granted {
                    "macOS: accessibility (UI scripting) granted".into()
                } else {
                    "macOS: accessibility not granted — open System Settings > Privacy & Security > Accessibility".into()
                },
            }
        }
    }
}

/// Read the TCC SQLite database via `sqlite3` shell command.
/// Returns true if the calling bundle (or any app) has `auth_value=2` (granted)
/// for the given service. We check both the user and system TCC databases.
#[cfg(target_os = "macos")]
fn check_tcc_permission(service: &str) -> bool {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/root".into());
    let user_db = format!(
        "{}/Library/Application Support/com.apple.TCC/TCC.db",
        home
    );
    let system_db = "/Library/Application Support/com.apple.TCC/TCC.db";

    for db in [user_db.as_str(), system_db] {
        let query = format!(
            "SELECT auth_value FROM access WHERE service='{}' AND auth_value=2 LIMIT 1;",
            service
        );
        let out = Command::new("sqlite3")
            .args([db, query.as_str()])
            .output();
        if let Ok(o) = out {
            let stdout = String::from_utf8_lossy(&o.stdout);
            if stdout.trim() == "2" {
                return true;
            }
        }
    }
    false
}

/// Attempt a test screen capture to /tmp and check if it succeeds.
#[cfg(target_os = "macos")]
fn check_screen_recording() -> bool {
    let tmp = "/tmp/clickyx_cap_test.png";
    let out = Command::new("screencapture")
        .args(["-x", "-t", "png", tmp])
        .output();
    match out {
        Ok(o) if o.status.success() => {
            // If the file was created and is non-empty, recording is allowed.
            let ok = std::fs::metadata(tmp).map(|m| m.len() > 0).unwrap_or(false);
            let _ = std::fs::remove_file(tmp);
            ok
        }
        _ => false,
    }
}

#[cfg(target_os = "macos")]
fn request_os_permission(perm: &Permission) -> Result<bool, String> {
    log::info!("Requesting permission: {:?} (macOS)", perm);
    let url = match perm {
        Permission::Microphone => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
        }
        Permission::ScreenRecording => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        }
        Permission::Notifications => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Notifications"
        }
        Permission::Camera => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera"
        }
        Permission::Accessibility => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        }
    };

    let result = Command::new("open")
        .arg(url)
        .output()
        .map_err(|e| format!("Failed to open System Settings: {e}"))?;

    if result.status.success() {
        log::info!("Opened System Settings for permission: {:?}", perm);
        Ok(false) // User still needs to grant; we just opened the dialog
    } else {
        let stderr = String::from_utf8_lossy(&result.stderr);
        Err(format!("Failed to open settings: {}", stderr))
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Windows implementation
// ────────────────────────────────────────────────────────────────────────────
#[cfg(target_os = "windows")]
fn check_os_permission(perm: &Permission) -> PermissionStatus {
    match perm {
        Permission::Microphone => {
            // Query the Windows Capability Access Manager registry for microphone consent.
            let granted = check_windows_capability("microphone");
            PermissionStatus {
                permission: perm.name().into(),
                granted,
                description: if granted {
                    "Windows: microphone access granted".into()
                } else {
                    "Windows: microphone access denied — check Settings > Privacy > Microphone".into()
                },
            }
        }
        Permission::Camera => {
            let granted = check_windows_capability("webcam");
            PermissionStatus {
                permission: perm.name().into(),
                granted,
                description: if granted {
                    "Windows: camera access granted".into()
                } else {
                    "Windows: camera access denied — check Settings > Privacy > Camera".into()
                },
            }
        }
        Permission::ScreenRecording => {
            // Windows doesn't gate screen capture at the OS level for desktop apps.
            PermissionStatus {
                permission: perm.name().into(),
                granted: true,
                description: "Windows: screen capture available via DXGI (no explicit permission gate)".into(),
            }
        }
        Permission::Notifications => {
            // Query the notifications capability store.
            let granted = check_windows_capability("userNotificationListener");
            PermissionStatus {
                permission: perm.name().into(),
                granted,
                description: if granted {
                    "Windows: notifications permitted".into()
                } else {
                    "Windows: notifications denied — check Settings > System > Notifications".into()
                },
            }
        }
        Permission::Accessibility => {
            // Windows accessibility is controlled by UIAccess manifest flag, not a TCC-style
            // gate. For normal desktop apps this is always effectively available.
            PermissionStatus {
                permission: perm.name().into(),
                granted: true,
                description: "Windows: UI Automation accessibility available (UIAccess manifest)".into(),
            }
        }
    }
}

/// Query the Windows Capability Access Manager consent store via PowerShell.
/// Returns true if the registry key "Allow" value is "Allow".
#[cfg(target_os = "windows")]
fn check_windows_capability(capability: &str) -> bool {
    let query = format!(
        "(Get-ItemProperty 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\{}' -ErrorAction SilentlyContinue).Value",
        capability
    );
    let out = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &query])
        .output();
    match out {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_lowercase();
            s == "allow"
        }
        Err(_) => {
            // If the key doesn't exist (older Windows), assume granted
            true
        }
    }
}

#[cfg(target_os = "windows")]
fn request_os_permission(perm: &Permission) -> Result<bool, String> {
    log::info!("Requesting permission: {:?} (Windows)", perm);
    let ms_settings_uri = match perm {
        Permission::Microphone => "ms-settings:privacy-microphone",
        Permission::Camera => "ms-settings:privacy-webcam",
        Permission::Notifications => "ms-settings:notifications",
        Permission::ScreenRecording => "ms-settings:privacy-broadfilesystemaccess",
        Permission::Accessibility => "ms-settings:easeofaccess-narrator",
    };

    let result = Command::new("cmd")
        .args(["/C", "start", "", ms_settings_uri])
        .output()
        .map_err(|e| format!("Failed to open Settings: {e}"))?;

    if result.status.success() {
        log::info!("Opened Windows Settings for permission: {:?}", perm);
        Ok(false)
    } else {
        let stderr = String::from_utf8_lossy(&result.stderr);
        Err(format!("Failed to open settings: {}", stderr))
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Linux implementation
// ────────────────────────────────────────────────────────────────────────────
#[cfg(target_os = "linux")]
fn check_os_permission(perm: &Permission) -> PermissionStatus {
    match perm {
        Permission::Microphone => {
            // Check if PulseAudio/PipeWire is running and has audio devices.
            let granted = check_linux_audio();
            PermissionStatus {
                permission: perm.name().into(),
                granted,
                description: if granted {
                    "Linux: PulseAudio/PipeWire audio available".into()
                } else {
                    "Linux: no audio server detected (pactl not responding)".into()
                },
            }
        }
        Permission::ScreenRecording => {
            // Check if PipeWire xdg-desktop-portal is running.
            let granted = check_linux_pipewire();
            PermissionStatus {
                permission: perm.name().into(),
                granted,
                description: if granted {
                    "Linux: PipeWire portal available for screen capture".into()
                } else {
                    "Linux: xdg-desktop-portal-pipewire not active — try: systemctl --user start pipewire".into()
                },
            }
        }
        Permission::Notifications => {
            // Check if a D-Bus notification daemon is running.
            let granted = check_linux_notifications();
            PermissionStatus {
                permission: perm.name().into(),
                granted,
                description: if granted {
                    "Linux: D-Bus notification service active".into()
                } else {
                    "Linux: no notification daemon found on D-Bus".into()
                },
            }
        }
        Permission::Camera => {
            // Check if /dev/video0 or similar exists and is accessible.
            let granted = std::path::Path::new("/dev/video0").exists()
                || std::path::Path::new("/dev/video1").exists();
            PermissionStatus {
                permission: perm.name().into(),
                granted,
                description: if granted {
                    "Linux: video device found (/dev/video*)".into()
                } else {
                    "Linux: no /dev/video* device detected".into()
                },
            }
        }
        Permission::Accessibility => {
            // Check if at-spi-bus-launcher is running.
            let granted = check_linux_atspi();
            PermissionStatus {
                permission: perm.name().into(),
                granted,
                description: if granted {
                    "Linux: AT-SPI2 accessibility bus active".into()
                } else {
                    "Linux: AT-SPI2 not detected — ensure at-spi2-core is installed".into()
                },
            }
        }
    }
}

/// Check if PulseAudio/PipeWire is available via `pactl info`.
#[cfg(target_os = "linux")]
fn check_linux_audio() -> bool {
    // Try pactl first, then check /proc/asound
    if let Ok(out) = Command::new("pactl").arg("info").output() {
        if out.status.success() {
            return true;
        }
    }
    // Fallback: check if ALSA sound devices exist
    std::path::Path::new("/proc/asound/cards").exists()
}

/// Check if PipeWire screen sharing portal is active.
#[cfg(target_os = "linux")]
fn check_linux_pipewire() -> bool {
    if let Ok(out) = Command::new("systemctl")
        .args(["--user", "is-active", "pipewire"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if s == "active" {
            return true;
        }
    }
    // Also check xdg-desktop-portal
    if let Ok(out) = Command::new("systemctl")
        .args(["--user", "is-active", "xdg-desktop-portal"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if s == "active" {
            return true;
        }
    }
    false
}

/// Check D-Bus for a running notification service.
#[cfg(target_os = "linux")]
fn check_linux_notifications() -> bool {
    if let Ok(out) = Command::new("busctl")
        .args(["--user", "list"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&out.stdout).to_lowercase();
        return stdout.contains("notifications") || stdout.contains("notify");
    }
    // Fallback: try gdbus
    if let Ok(out) = Command::new("gdbus")
        .args([
            "call",
            "--session",
            "--dest",
            "org.freedesktop.Notifications",
            "--object-path",
            "/org/freedesktop/Notifications",
            "--method",
            "org.freedesktop.DBus.Peer.Ping",
        ])
        .output()
    {
        return out.status.success();
    }
    false
}

/// Check if at-spi-bus-launcher is running.
#[cfg(target_os = "linux")]
fn check_linux_atspi() -> bool {
    if let Ok(out) = Command::new("pgrep")
        .args(["-x", "at-spi-bus-laun"])
        .output()
    {
        return out.status.success();
    }
    // Also check via systemctl
    if let Ok(out) = Command::new("systemctl")
        .args(["--user", "is-active", "at-spi-dbus-bus"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        return s == "active";
    }
    false
}

#[cfg(target_os = "linux")]
fn request_os_permission(perm: &Permission) -> Result<bool, String> {
    log::info!("Requesting permission: {:?} (Linux)", perm);
    // On Linux, most permissions are controlled by the distribution's
    // package/group setup. We can try to open the relevant settings app.
    match perm {
        Permission::Microphone | Permission::Camera => {
            // Try to open GNOME Control Center privacy panel
            let _ = Command::new("gnome-control-center")
                .arg("privacy")
                .spawn();
        }
        Permission::ScreenRecording => {
            // Try to start PipeWire if not running
            let _ = Command::new("systemctl")
                .args(["--user", "start", "pipewire"])
                .output();
            let _ = Command::new("systemctl")
                .args(["--user", "start", "xdg-desktop-portal"])
                .output();
        }
        Permission::Accessibility => {
            // Try to ensure at-spi2 is running
            let _ = Command::new("systemctl")
                .args(["--user", "start", "at-spi-dbus-bus"])
                .output();
        }
        Permission::Notifications => {
            let _ = Command::new("gnome-control-center")
                .arg("notifications")
                .spawn();
        }
    }
    // Re-check after attempting to enable
    Ok(check_os_permission(perm).granted)
}

// ────────────────────────────────────────────────────────────────────────────
// Fallback for unsupported platforms
// ────────────────────────────────────────────────────────────────────────────
#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
fn check_os_permission(perm: &Permission) -> PermissionStatus {
    PermissionStatus {
        permission: perm.name().into(),
        granted: false,
        description: format!("unsupported platform for {:?}", perm),
    }
}

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
fn request_os_permission(_perm: &Permission) -> Result<bool, String> {
    Err("permission requests not supported on this platform".into())
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────
pub fn check_permission(perm: &Permission) -> PermissionStatus {
    check_os_permission(perm)
}

pub fn request_permission(perm: &Permission) -> Result<bool, String> {
    request_os_permission(perm)
}
