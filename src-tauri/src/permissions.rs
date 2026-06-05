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
/// Falls back to true if the DB is unreadable or query fails (to avoid blocking features).
#[cfg(target_os = "macos")]
fn check_tcc_permission(service: &str) -> bool {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/root".into());
    let user_db = format!(
        "{}/Library/Application Support/com.apple.TCC/TCC.db",
        home
    );
    let system_db = "/Library/Application Support/com.apple.TCC/TCC.db";

    // Try multiple query patterns to handle schema changes across macOS versions:
    // - macOS 10.14-13: `access` table with `auth_value` column
    // - macOS 14+: may use different columns or table names
    let queries = [
        // Standard schema: auth_value=2 means allowed
        format!(
            "SELECT auth_value FROM access WHERE service='{}' AND auth_value=2 LIMIT 1;",
            service
        ),
        // Alternative: check for any row with the service (some macOS 14+ schemas)
        format!(
            "SELECT COUNT(*) FROM access WHERE service='{}' LIMIT 1;",
            service
        ),
    ];

    for db in [user_db.as_str(), system_db] {
        for query in &queries {
            let out = Command::new("sqlite3")
                .args([db, query.as_str()])
                .output();
            if let Ok(o) = out {
                let stdout = String::from_utf8_lossy(&o.stdout);
                let trimmed = stdout.trim();
                if trimmed == "2" || (trimmed == "1" && query.contains("COUNT(*)")) {
                    return true;
                }
            }
        }
    }

    log::warn!(
        "TCC permission check for '{}' failed — DB may be unreadable or schema changed. Assuming denied.",
        service
    );
    false
}

/// Attempt a test screen capture to a temp file and check if it succeeds.
#[cfg(target_os = "macos")]
fn check_screen_recording() -> bool {
    let tmp_dir = std::env::temp_dir().join("clickyx_cap_test.png");
    let tmp = tmp_dir.to_string_lossy().to_string();
    // Note: -x flag was removed in macOS 14 Sonoma; omit it for compatibility
    let out = Command::new("screencapture")
        .args(["-t", "png", &tmp])
        .output();
    match out {
        Ok(o) if o.status.success() => {
            let ok = std::fs::metadata(&tmp).map(|m| m.len() > 0).unwrap_or(false);
            let _ = std::fs::remove_file(&tmp);
            ok
        }
        _ => false,
    }
}

#[cfg(target_os = "macos")]
fn macos_version() -> (u32, u32) {
    let out = Command::new("sw_vers")
        .arg("-productVersion")
        .output();
    if let Ok(o) = out {
        let ver = String::from_utf8_lossy(&o.stdout).trim().to_string();
        let parts: Vec<&str> = ver.split('.').collect();
        let major = parts.get(0).and_then(|s| s.parse().ok()).unwrap_or(0);
        let minor = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
        return (major, minor);
    }
    (0, 0)
}

/// Get the System Settings/Preferences URL for a given permission and macOS version.
/// macOS 12 (Monterey) and earlier use the old `com.apple.preference.security` panes.
/// macOS 13+ (Ventura) uses the new Settings app with different pane IDs.
#[cfg(target_os = "macos")]
fn permission_settings_url(perm: &Permission) -> String {
    let (major, minor) = macos_version();
    // macOS 13.0 = Ventura = first major Settings rewrite
    let is_ventura_or_newer = major >= 13;

    let old_base = "x-apple.systempreferences:com.apple.preference.security?Privacy_";
    let new_base = "x-apple.systempreferences:com.apple.settings.PrivacySecurity.Protected";

    if is_ventura_or_newer {
        // On Ventura+, open the general Privacy & Security pane.
        // Deep links to specific sub-panes are unreliable across minor versions.
        new_base.into()
    } else {
        // macOS 12 and below: use legacy pane deep links
        let suffix = match perm {
            Permission::Microphone => "Microphone",
            Permission::ScreenRecording => "ScreenCapture",
            Permission::Notifications => "Notifications",
            Permission::Camera => "Camera",
            Permission::Accessibility => "Accessibility",
        };
        format!("{}{}", old_base, suffix)
    }
}

#[cfg(target_os = "macos")]
fn request_os_permission(perm: &Permission) -> Result<bool, String> {
    log::info!("Requesting permission: {:?} (macOS)", perm);
    let url = permission_settings_url(perm);

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
            // Check if any /dev/video* device exists and is accessible.
            let granted = (0..=9).any(|i| std::path::Path::new(&format!("/dev/video{}", i)).exists());
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

/// Check if PulseAudio/PipeWire is available via `pactl info` or `pw-cli`.
#[cfg(target_os = "linux")]
fn check_linux_audio() -> bool {
    if let Ok(out) = Command::new("pactl").arg("info").output() {
        if out.status.success() {
            return true;
        }
    }
    // Check pure PipeWire via pw-cli
    if let Ok(out) = Command::new("pw-cli").arg("info").output() {
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
    // Try pw-cli first (works without systemd)
    if let Ok(out) = Command::new("pw-cli").arg("info").output() {
        if out.status.success() {
            return true;
        }
    }
    // Fallback: check the pipewire runtime socket (/run/user/<uid>/pipewire-0)
    if let Ok(entries) = std::fs::read_dir("/run/user") {
        for entry in entries.flatten() {
            let sock = entry.path().join("pipewire-0");
            if sock.exists() {
                return true;
            }
        }
    }
    // Also try pgrep
    if let Ok(out) = Command::new("pgrep").args(["-x", "pipewire"]).output() {
        if out.status.success() {
            return true;
        }
    }
    // Try systemctl last (systemd-only)
    if let Ok(out) = Command::new("systemctl")
        .args(["--user", "is-active", "pipewire"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if s == "active" {
            return true;
        }
    }
    // Also check xdg-desktop-portal via pgrep
    if let Ok(out) = Command::new("pgrep").args(["-x", "xdg-desktop-portal"]).output() {
        if out.status.success() {
            return true;
        }
    }
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
    // Try gdbus first (more portable than busctl)
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
    // Fallback: systemd's busctl
    if let Ok(out) = Command::new("busctl")
        .args(["--user", "list"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&out.stdout).to_lowercase();
        return stdout.contains("notifications") || stdout.contains("notify");
    }
    false
}

/// Check if at-spi-bus-launcher is running.
#[cfg(target_os = "linux")]
fn check_linux_atspi() -> bool {
    // pgrep works on all distros
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

/// Detect the current desktop environment.
#[cfg(target_os = "linux")]
fn detect_desktop_environment() -> &'static str {
    let de = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default();
    let de_lower = de.to_lowercase();
    if de_lower.contains("kde") { "kde" }
    else if de_lower.contains("gnome") || de_lower.contains("unity") { "gnome" }
    else if de_lower.contains("xfce") { "xfce" }
    else if de_lower.contains("cinnamon") { "cinnamon" }
    else if de_lower.contains("mate") { "mate" }
    else { "other" }
}

#[cfg(target_os = "linux")]
fn request_os_permission(perm: &Permission) -> Result<bool, String> {
    log::info!("Requesting permission: {:?} (Linux)", perm);
    let de = detect_desktop_environment();
    match perm {
        Permission::Microphone | Permission::Camera => {
            match de {
                "gnome" => {
                    let _ = Command::new("gnome-control-center")
                        .arg("privacy")
                        .spawn();
                }
                "kde" => {
                    let _ = Command::new("systemsettings")
                        .arg("kcm_privacy")
                        .spawn();
                }
                _ => {
                    log::info!("No settings app known for DE '{}'; user must grant manually", de);
                }
            }
        }
        Permission::ScreenRecording => {
            // Try to start PipeWire if not running via multiple methods
            if Command::new("systemctl").arg("--version").output().is_ok() {
                let _ = Command::new("systemctl")
                    .args(["--user", "start", "pipewire"])
                    .output();
                let _ = Command::new("systemctl")
                    .args(["--user", "start", "xdg-desktop-portal"])
                    .output();
            } else {
                log::info!("systemctl not available; user must start PipeWire manually");
            }
        }
        Permission::Accessibility => {
            if Command::new("systemctl").arg("--version").output().is_ok() {
                let _ = Command::new("systemctl")
                    .args(["--user", "start", "at-spi-dbus-bus"])
                    .output();
            } else {
                log::info!("systemctl not available; user must start at-spi2 manually");
            }
        }
        Permission::Notifications => {
            // Try to open notification settings based on DE
            match de {
                "gnome" => {
                    let _ = Command::new("gnome-control-center")
                        .arg("notifications")
                        .spawn();
                }
                "kde" => {
                    let _ = Command::new("systemsettings")
                        .arg("kcm_notifications")
                        .spawn();
                }
                _ => {
                    log::info!("No settings app known for DE '{}'; user must configure notifications manually", de);
                }
            }
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
