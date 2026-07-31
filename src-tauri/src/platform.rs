/// Shared cross-platform utilities.
/// Consolidates duplicated platform detection functions.

/// Detect the current display server on Linux (Wayland vs X11 vs unknown).
/// On non-Linux platforms, returns a platform-specific default.
#[cfg(target_os = "linux")]
pub fn display_server() -> &'static str {
    let sess = std::env::var("XDG_SESSION_TYPE").unwrap_or_default();
    if sess == "wayland" || std::env::var("WAYLAND_DISPLAY").is_ok() {
        "wayland"
    } else if sess == "x11" || std::env::var("DISPLAY").is_ok() {
        "x11"
    } else {
        "unknown"
    }
}

#[cfg(target_os = "macos")]
pub fn display_server() -> &'static str {
    "core-graphics"
}

#[cfg(target_os = "windows")]
pub fn display_server() -> &'static str {
    "gdi"
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
pub fn display_server() -> &'static str {
    "unknown"
}
