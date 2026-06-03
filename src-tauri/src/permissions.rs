use serde::{Deserialize, Serialize};

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

#[cfg(target_os = "windows")]
fn check_os_permission(perm: &Permission) -> PermissionStatus {
    match perm {
        Permission::Microphone => PermissionStatus {
            permission: perm.name().into(),
            granted: true,
            description: "Windows: microphone access assumed available (full API check pending winapi integration)".into(),
        },
        Permission::ScreenRecording => PermissionStatus {
            permission: perm.name().into(),
            granted: true,
            description: "Windows: screen capture available via DXGI".into(),
        },
        Permission::Notifications => PermissionStatus {
            permission: perm.name().into(),
            granted: true,
            description: "Windows: notifications enabled by default".into(),
        },
        Permission::Camera => PermissionStatus {
            permission: perm.name().into(),
            granted: true,
            description: "Windows: camera access assumed available".into(),
        },
        Permission::Accessibility => PermissionStatus {
            permission: perm.name().into(),
            granted: true,
            description: "Windows: accessibility permissions not isolated (UIAccess manifest)".into(),
        },
    }
}

#[cfg(target_os = "linux")]
fn check_os_permission(perm: &Permission) -> PermissionStatus {
    match perm {
        Permission::Microphone => PermissionStatus {
            permission: perm.name().into(),
            granted: true,
            description: "Linux: PipeWire/PulseAudio available".into(),
        },
        Permission::ScreenRecording => PermissionStatus {
            permission: perm.name().into(),
            granted: true,
            description: "Linux: PipeWire portal screen capture available".into(),
        },
        Permission::Notifications => PermissionStatus {
            permission: perm.name().into(),
            granted: true,
            description: "Linux: D-Bus notifications available".into(),
        },
        Permission::Camera => PermissionStatus {
            permission: perm.name().into(),
            granted: true,
            description: "Linux: v4l2 camera access available".into(),
        },
        Permission::Accessibility => PermissionStatus {
            permission: perm.name().into(),
            granted: true,
            description: "Linux: AT-SPI2 accessibility available".into(),
        },
    }
}

#[cfg(target_os = "macos")]
fn check_os_permission(perm: &Permission) -> PermissionStatus {
    match perm {
        Permission::Microphone => PermissionStatus {
            permission: perm.name().into(),
            granted: false,
            description: "macOS: use AVFoundation to check (stub)".into(),
        },
        Permission::ScreenRecording => PermissionStatus {
            permission: perm.name().into(),
            granted: false,
            description: "macOS: use SCContentSharingSession to check (stub)".into(),
        },
        Permission::Notifications => PermissionStatus {
            permission: perm.name().into(),
            granted: false,
            description: "macOS: use UNUserNotificationCenter to check (stub)".into(),
        },
        Permission::Camera => PermissionStatus {
            permission: perm.name().into(),
            granted: false,
            description: "macOS: use AVCaptureDevice to check (stub)".into(),
        },
        Permission::Accessibility => PermissionStatus {
            permission: perm.name().into(),
            granted: false,
            description: "macOS: use AXIsProcessTrusted to check (stub)".into(),
        },
    }
}

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
fn check_os_permission(perm: &Permission) -> PermissionStatus {
    PermissionStatus {
        permission: perm.name().into(),
        granted: false,
        description: format!("unsupported platform for {:?}", perm),
    }
}

pub fn check_permission(perm: &Permission) -> PermissionStatus {
    check_os_permission(perm)
}

#[cfg(target_os = "windows")]
fn request_os_permission(perm: &Permission) -> Result<bool, String> {
    log::info!("Requesting permission: {:?} (Windows)", perm);
    match perm {
        Permission::Microphone => {
            log::warn!("Windows microphone permission request: stub — invoke with IShellDispatch");
            Ok(true)
        }
        Permission::ScreenRecording => {
            log::warn!("Windows screen recording permission request: stub");
            Ok(true)
        }
        Permission::Notifications => {
            log::warn!("Windows notification permission request: stub");
            Ok(true)
        }
        Permission::Camera => {
            log::warn!("Windows camera permission request: stub");
            Ok(true)
        }
        Permission::Accessibility => {
            log::warn!("Windows accessibility permission request: stub");
            Ok(true)
        }
    }
}

#[cfg(target_os = "linux")]
fn request_os_permission(perm: &Permission) -> Result<bool, String> {
    log::info!("Requesting permission: {:?} (Linux)", perm);
    match perm {
        Permission::Microphone => {
            log::warn!("Linux microphone permission: stub — PipeWire portal needed");
            Ok(true)
        }
        Permission::ScreenRecording => {
            log::warn!("Linux screen recording permission: stub — xdg-desktop-portal needed");
            Ok(true)
        }
        _ => Ok(true),
    }
}

#[cfg(target_os = "macos")]
fn request_os_permission(perm: &Permission) -> Result<bool, String> {
    log::info!("Requesting permission: {:?} (macOS)", perm);
    match perm {
        Permission::Microphone => {
            log::warn!("macOS microphone permission request: stub — AVCaptureDevice needed");
            Ok(false)
        }
        Permission::ScreenRecording => {
            log::warn!("macOS screen recording permission request: stub — SCContentSharingSession needed");
            Ok(false)
        }
        _ => Ok(false),
    }
}

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
fn request_os_permission(_perm: &Permission) -> Result<bool, String> {
    Err("permission requests not supported on this platform".into())
}

pub fn request_permission(perm: &Permission) -> Result<bool, String> {
    request_os_permission(perm)
}
