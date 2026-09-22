use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct MonitorInfo {
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

#[derive(Debug, Clone)]
pub struct ScreenManager {
    monitors: Vec<MonitorInfo>,
    primary_index: usize,
}

impl ScreenManager {
    pub fn new() -> Self {
        let monitors = Self::detect_monitors();
        let primary_index = monitors.iter().position(|m| m.is_primary).unwrap_or(0);
        Self {
            monitors,
            primary_index,
        }
    }

    pub fn refresh(&mut self) {
        self.monitors = Self::detect_monitors();
        self.primary_index = self.monitors.iter().position(|m| m.is_primary).unwrap_or(0);
    }

    fn detect_monitors() -> Vec<MonitorInfo> {
        let mut monitors = Vec::new();
        #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
        {
            if let Ok(all) = xcap::Monitor::all() {
                for m in &all {
                    let scale_factor = m.scale_factor().unwrap_or(1.0) as f64;
                    monitors.push(MonitorInfo {
                        name: m.name().unwrap_or_else(|_| "unknown".into()),
                        x: m.x().unwrap_or(0),
                        y: m.y().unwrap_or(0),
                        width: m.width().unwrap_or(0),
                        height: m.height().unwrap_or(0),
                        scale_factor,
                        is_primary: m.is_primary().unwrap_or(false),
                    });
                }
            }
        }
        if monitors.is_empty() {
            monitors.push(MonitorInfo {
                name: "default".into(),
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                scale_factor: 1.0,
                is_primary: true,
            });
        }
        monitors
    }

    pub fn monitors(&self) -> &[MonitorInfo] {
        &self.monitors
    }

    pub fn primary(&self) -> &MonitorInfo {
        &self.monitors[self.primary_index]
    }
}

impl Default for ScreenManager {
    fn default() -> Self {
        Self::new()
    }
}

pub struct CoordinateNormalizer {
    screen_mgr: ScreenManager,
}

impl CoordinateNormalizer {
    pub fn new(screen_mgr: ScreenManager) -> Self {
        Self { screen_mgr }
    }

    /// Primary monitor's HiDPI scale (1.0 when unknown). Extents (w/h) from AI
    /// tags are screenshot pixels — divide by this to get display points.
    pub fn primary_scale(&self) -> f64 {
        let s = self.screen_mgr.primary().scale_factor;
        if s > 0.0 {
            s
        } else {
            1.0
        }
    }

    /// Map an AI guidance point (screenshot pixels, top-left origin, as vision
    /// models emit) to virtual display coordinates (P1/CR-4 live path).
    ///
    /// Applies the primary monitor's offset + HiDPI scale and the macOS Y-flip
    /// via `screen::coordinate` — previously dead code, now the single path.
    /// Assumption: vision screenshots cover the primary monitor (documented;
    /// multi-monitor composites need per-monitor routing in P3).
    pub fn ai_point_to_virtual(&self, x: f64, y: f64) -> (f64, f64) {
        let m = self.screen_mgr.primary();
        let geom = crate::screen::coordinate::ScreenGeom {
            x: m.x as f64,
            y: m.y as f64,
            width: m.width as f64,
            height: m.height as f64,
            scale: m.scale_factor,
        };
        crate::screen::coordinate::screenshot_to_display_geom(x, y, geom)
    }
}

impl Default for CoordinateNormalizer {
    fn default() -> Self {
        Self::new(ScreenManager::new())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_monitors() -> Vec<MonitorInfo> {
        vec![
            MonitorInfo {
                name: "left".into(),
                x: -1920,
                y: 0,
                width: 1920,
                height: 1080,
                scale_factor: 1.0,
                is_primary: false,
            },
            MonitorInfo {
                name: "main".into(),
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                scale_factor: 1.0,
                is_primary: true,
            },
            MonitorInfo {
                name: "right".into(),
                x: 1920,
                y: 0,
                width: 1920,
                height: 1080,
                scale_factor: 1.0,
                is_primary: false,
            },
        ]
    }

    fn test_screen_mgr() -> ScreenManager {
        let monitors = test_monitors();
        ScreenManager {
            monitors,
            primary_index: 1,
        }
    }

    // P1 (CR-4): AI-point normalization is the live guidance path.
    #[test]
    fn test_ai_point_to_virtual_scale_one() {
        let sm = test_screen_mgr();
        let norm = CoordinateNormalizer::new(sm);
        assert!((norm.primary_scale() - 1.0).abs() < 1e-9);
        let (vx, vy) = norm.ai_point_to_virtual(100.0, 200.0);
        assert!((vx - 100.0).abs() < 1e-9);
        #[cfg(not(target_os = "macos"))]
        assert!((vy - 200.0).abs() < 1e-9);
        #[cfg(target_os = "macos")]
        assert!((vy - 880.0).abs() < 1e-9);
    }

    #[test]
    fn test_ai_point_to_virtual_hidpi_scale() {
        let monitors = vec![MonitorInfo {
            name: "main".into(),
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            scale_factor: 2.0,
            is_primary: true,
        }];
        let norm = CoordinateNormalizer::new(ScreenManager {
            monitors,
            primary_index: 0,
        });
        assert!((norm.primary_scale() - 2.0).abs() < 1e-9);
        // 200 physical px → 100 logical points on x.
        let (vx, _) = norm.ai_point_to_virtual(200.0, 200.0);
        assert!((vx - 100.0).abs() < 1e-9);
    }
}
