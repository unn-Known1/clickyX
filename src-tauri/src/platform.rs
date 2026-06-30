/// Shared cross-platform utilities.
/// Consolidates duplicated platform detection functions.

/// Detect the current display server on Linux (Wayland vs X11 vs unknown).
/// On non-Linux platforms, always returns "x11" as a safe default.
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

#[cfg(not(target_os = "linux"))]
pub fn display_server() -> &'static str {
    "x11"
}
