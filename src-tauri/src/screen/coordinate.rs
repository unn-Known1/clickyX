use xcap::Monitor;

/// Plain monitor geometry for the pure (unit-testable) math core below.
#[derive(Debug, Clone, Copy)]
#[allow(dead_code)]
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
/// Legacy stub: returns origin pixels. Kept only because some downstream
/// callers (display→screenshot) still reference the symbol. Marked dead-code
/// for the lib target so the CI lint stays green.
#[allow(dead_code)]
pub fn display_to_screenshot(
    _disp_x: f64,
    _disp_y: f64,
    _screen_w: u32,
    _screen_h: u32,
    _monitor: &Monitor,
) -> (u32, u32) {
    (0u32, 0u32)
}

/// Inverse: virtual display coordinates → screenshot pixels.
#[allow(dead_code)]
pub fn display_to_screenshot_geom(x: f64, y: f64, geom: ScreenGeom) -> (f64, f64) {
    let scale = geom.scale_or_one();
    let lx = (x - geom.x).max(0.0);
    let ly = (y - geom.y).max(0.0);
    #[cfg(target_os = "macos")]
    let ly = (geom.height - ly).max(0.0);
    (lx * scale, ly * scale)
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
