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

    pub fn find_by_name(&self, name: &str) -> Option<&MonitorInfo> {
        self.monitors.iter().find(|m| m.name == name)
    }

    pub fn find_by_point(&self, x: f64, y: f64) -> Option<&MonitorInfo> {
        self.monitors.iter().find(|m| {
            x >= m.x as f64
                && x < (m.x + m.width as i32) as f64
                && y >= m.y as f64
                && y < (m.y + m.height as i32) as f64
        })
    }

    pub fn count(&self) -> usize {
        self.monitors.len()
    }

    pub fn virtual_bounds(&self) -> (i32, i32, i32, i32) {
        let mut min_x = i32::MAX;
        let mut min_y = i32::MAX;
        let mut max_x = i32::MIN;
        let mut max_y = i32::MIN;
        for m in &self.monitors {
            min_x = min_x.min(m.x);
            min_y = min_y.min(m.y);
            max_x = max_x.max(m.x + m.width as i32);
            max_y = max_y.max(m.y + m.height as i32);
        }
        (min_x, min_y, max_x - min_x, max_y - min_y)
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

    pub fn screen_manager(&self) -> &ScreenManager {
        &self.screen_mgr
    }

    pub fn screen_manager_mut(&mut self) -> &mut ScreenManager {
        &mut self.screen_mgr
    }

    pub fn to_virtual(&self, screen_name: &str, local_x: f64, local_y: f64) -> Option<(f64, f64)> {
        let monitor = self.screen_mgr.find_by_name(screen_name)?;
        Some((local_x + monitor.x as f64, local_y + monitor.y as f64))
    }

    pub fn to_local(&self, virtual_x: f64, virtual_y: f64) -> Option<(f64, f64, &MonitorInfo)> {
        let monitor = self.screen_mgr.find_by_point(virtual_x, virtual_y)?;
        Some((
            virtual_x - monitor.x as f64,
            virtual_y - monitor.y as f64,
            monitor,
        ))
    }

    pub fn clamp_to_bounds(&self, x: f64, y: f64, margin: f64) -> (f64, f64) {
        let (min_x, min_y, w, h) = self.screen_mgr.virtual_bounds();
        (
            x.clamp(min_x as f64 + margin, (min_x + w) as f64 - margin),
            y.clamp(min_y as f64 + margin, (min_y + h) as f64 - margin),
        )
    }

    pub fn tag_screen(&self, x: f64, y: f64) -> String {
        self.screen_mgr
            .find_by_point(x, y)
            .map(|m| {
                let idx = self
                    .screen_mgr
                    .monitors()
                    .iter()
                    .position(|r| std::ptr::eq(r, m));
                format!("screen{}", idx.unwrap_or(0) + 1)
            })
            .unwrap_or_else(|| "screen1".into())
    }

    pub fn get_screen_idx(&self, x: f64, y: f64) -> usize {
        self.screen_mgr
            .find_by_point(x, y)
            .and_then(|m| {
                self.screen_mgr
                    .monitors()
                    .iter()
                    .position(|r| std::ptr::eq(r, m))
            })
            .unwrap_or(0)
    }

    pub fn normalize_coordinates(
        &self,
        virtual_x: f64,
        virtual_y: f64,
        target_screen_idx: usize,
    ) -> Option<(f64, f64)> {
        let monitors = self.screen_mgr.monitors();
        let target = monitors.get(target_screen_idx)?;
        Some((virtual_x - target.x as f64, virtual_y - target.y as f64))
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

    #[test]
    fn test_coordinate_normalizer_to_virtual() {
        let sm = test_screen_mgr();
        let norm = CoordinateNormalizer::new(sm);
        let result = norm.to_virtual("main", 100.0, 200.0);
        assert!(result.is_some());
        let (vx, vy) = result.unwrap();
        assert_eq!(vx, 100.0);
        assert_eq!(vy, 200.0);
    }

    #[test]
    fn test_coordinate_normalizer_to_virtual_left() {
        let sm = test_screen_mgr();
        let norm = CoordinateNormalizer::new(sm);
        let result = norm.to_virtual("left", 100.0, 200.0);
        assert!(result.is_some());
        let (vx, vy) = result.unwrap();
        assert_eq!(vx, -1820.0);
        assert_eq!(vy, 200.0);
    }

    #[test]
    fn test_coordinate_normalizer_to_local() {
        let sm = test_screen_mgr();
        let norm = CoordinateNormalizer::new(sm);
        let result = norm.to_local(100.0, 200.0);
        assert!(result.is_some());
        let (lx, ly, mon) = result.unwrap();
        assert_eq!(lx, 100.0);
        assert_eq!(ly, 200.0);
        assert_eq!(mon.name, "main");
    }

    #[test]
    fn test_clamp_to_bounds() {
        let sm = test_screen_mgr();
        let norm = CoordinateNormalizer::new(sm);
        let (cx, cy) = norm.clamp_to_bounds(-10000.0, -10000.0, 10.0);
        assert!((cx - (-1910.0)).abs() < 0.001);
        assert!((cy - 10.0).abs() < 0.001);
    }

    #[test]
    fn test_tag_screen() {
        let sm = test_screen_mgr();
        let norm = CoordinateNormalizer::new(sm);
        assert_eq!(norm.tag_screen(100.0, 500.0), "screen2");
        assert_eq!(norm.tag_screen(-1000.0, 500.0), "screen1");
    }

    #[test]
    fn test_screen_manager_find_by_point() {
        let sm = test_screen_mgr();
        let m = sm.find_by_point(100.0, 500.0);
        assert!(m.is_some());
        assert_eq!(m.unwrap().name, "main");
    }

    #[test]
    fn test_screen_manager_find_by_name() {
        let sm = test_screen_mgr();
        assert!(sm.find_by_name("main").is_some());
        assert!(sm.find_by_name("nonexistent").is_none());
    }

    #[test]
    fn test_screen_manager_virtual_bounds() {
        let sm = test_screen_mgr();
        let (min_x, min_y, w, h) = sm.virtual_bounds();
        assert_eq!(min_x, -1920);
        assert_eq!(min_y, 0);
        assert_eq!(w, 5760);
        assert_eq!(h, 1080);
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
