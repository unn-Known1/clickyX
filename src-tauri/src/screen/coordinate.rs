use serde::Serialize;
use xcap::Monitor;

#[derive(Debug, Clone, Serialize)]
pub struct NormalizedPoint {
    pub x: f64,
    pub y: f64,
    pub display_id: u32,
}

/// Plain monitor geometry for the pure (unit-testable) math core below.
#[derive(Debug, Clone, Copy)]
pub struct ScreenGeom {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    /// Physical-pixels-per-logical-point (1.0 = no scaling).
    pub scale: f64,
}

impl ScreenGeom {
    pub fn scale_or_one(&self) -> f64 {
        if self.scale > 0.0 {
            self.scale
        } else {
            1.0
        }
    }
}

/// Screenshot (physical pixels, top-left origin — what vision models emit)
/// → virtual display coordinates.
///
/// - divides by the monitor scale (HiDPI: screenshot pixels ≠ display points);
/// - on macOS flips Y (Core Graphics display space is bottom-left origin);
/// - adds the monitor's virtual-desktop offset (multi-monitor).
///
/// P1 (CR-4): this used to be dead code (`coordinate.rs` was never declared in
/// `screen/mod.rs`). It is now the single normalization path for guidance tags.
pub fn screenshot_to_display_geom(x: f64, y: f64, geom: ScreenGeom) -> (f64, f64) {
    let scale = geom.scale_or_one();
    let lx = x / scale;
    let ly = y / scale;
    #[cfg(target_os = "macos")]
    let ly = (geom.height - ly).max(0.0);
    (geom.x + lx, geom.y + ly)
}

/// Inverse: virtual display coordinates → screenshot pixels.
pub fn display_to_screenshot_geom(x: f64, y: f64, geom: ScreenGeom) -> (f64, f64) {
    let scale = geom.scale_or_one();
    let lx = (x - geom.x).max(0.0);
    let ly = (y - geom.y).max(0.0);
    #[cfg(target_os = "macos")]
    let ly = (geom.height - ly).max(0.0);
    (lx * scale, ly * scale)
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
    let geom = ScreenGeom {
        x: monitor.x().unwrap_or(0) as f64,
        y: monitor.y().unwrap_or(0) as f64,
        width: monitor.width().unwrap_or(0) as f64,
        height: monitor.height().unwrap_or(0) as f64,
        scale: monitor.scale_factor().unwrap_or(1.0) as f64,
    };
    let (x, y) = screenshot_to_display_geom(screen_x as f64, screen_y as f64, geom);
    NormalizedPoint {
        x,
        y,
        display_id: monitor.id().unwrap_or(0),
    }
}

pub fn display_to_screenshot(
    disp_x: f64,
    disp_y: f64,
    _screen_w: u32,
    _screen_h: u32,
    monitor: &Monitor,
) -> (u32, u32) {
    let geom = ScreenGeom {
        x: monitor.x().unwrap_or(0) as f64,
        y: monitor.y().unwrap_or(0) as f64,
        width: monitor.width().unwrap_or(0) as f64,
        height: monitor.height().unwrap_or(0) as f64,
        scale: monitor.scale_factor().unwrap_or(1.0) as f64,
    };
    let (x, y) = display_to_screenshot_geom(disp_x, disp_y, geom);
    (x as u32, y as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn geom_1080p() -> ScreenGeom {
        ScreenGeom {
            x: 0.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
            scale: 1.0,
        }
    }

    #[test]
    fn test_screenshot_identity_at_scale_one() {
        // Non-macOS: offset + identity. (On macOS Y flips — see next test.)
        let (x, y) = screenshot_to_display_geom(100.0, 200.0, geom_1080p());
        #[cfg(not(target_os = "macos"))]
        {
            assert_eq!((x, y), (100.0, 200.0));
        }
        #[cfg(target_os = "macos")]
        {
            assert_eq!((x, y), (100.0, 880.0));
        }
    }

    #[test]
    fn test_scale_division_hidpi() {
        let hidpi = ScreenGeom {
            x: 0.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
            scale: 2.0,
        };
        // 200 physical px = 100 logical points (Y assertion is platform-specific).
        let (x, _) = screenshot_to_display_geom(200.0, 200.0, hidpi);
        assert!((x - 100.0).abs() < 1e-9);
    }

    #[test]
    fn test_monitor_offset_applies() {
        let right = ScreenGeom {
            x: 1920.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
            scale: 1.0,
        };
        let (x, _) = screenshot_to_display_geom(10.0, 10.0, right);
        assert!((x - 1930.0).abs() < 1e-9);
    }

    #[test]
    fn test_roundtrip_display_screenshot() {
        let g = ScreenGeom {
            x: -1920.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
            scale: 1.0,
        };
        let (vx, vy) = screenshot_to_display_geom(320.0, 240.0, g);
        let (sx, sy) = display_to_screenshot_geom(vx, vy, g);
        assert!((sx - 320.0).abs() < 1e-9);
        assert!((sy - 240.0).abs() < 1e-9);
    }

    #[test]
    fn test_zero_scale_falls_back_to_one() {
        let g = ScreenGeom {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 100.0,
            scale: 0.0,
        };
        assert_eq!(g.scale_or_one(), 1.0);
    }
}
