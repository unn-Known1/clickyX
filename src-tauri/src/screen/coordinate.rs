use serde::Serialize;
use xcap::Monitor;

#[derive(Debug, Clone, Serialize)]
pub struct NormalizedPoint {
    pub x: f64,
    pub y: f64,
    pub display_id: u32,
}

/// Convert screenshot pixel coordinates to virtual display coordinates.
///
/// On macOS, the Y-axis is flipped because Core Graphics uses a bottom-left
/// origin while the rest of the system uses top-left. On Windows and Linux,
/// coordinates are 1:1 mapped.
pub fn screenshot_to_display(
    screen_x: u32,
    screen_y: u32,
    _screen_w: u32,
    _screen_h: u32,
    monitor: &Monitor,
) -> NormalizedPoint {
    #[cfg(target_os = "macos")]
    {
        let display_y = monitor.height() as f64 - screen_y as f64;
        NormalizedPoint {
            x: monitor.x() as f64 + screen_x as f64,
            y: monitor.y() as f64 + display_y,
            display_id: monitor.id() as u32,
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        NormalizedPoint {
            x: monitor.x() as f64 + screen_x as f64,
            y: monitor.y() as f64 + screen_y as f64,
            display_id: monitor.id() as u32,
        }
    }
}

pub fn display_to_screenshot(
    disp_x: f64,
    disp_y: f64,
    _screen_w: u32,
    _screen_h: u32,
    monitor: &Monitor,
) -> (u32, u32) {
    let local_x = (disp_x - monitor.x() as f64).max(0.0) as u32;
    #[cfg(target_os = "macos")]
    {
        let local_y = (monitor.height() as f64 - (disp_y - monitor.y() as f64)).max(0.0) as u32;
        (local_x, local_y)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let local_y = (disp_y - monitor.y() as f64).max(0.0) as u32;
        (local_x, local_y)
    }
}
