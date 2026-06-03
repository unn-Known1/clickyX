use serde::Serialize;
use std::collections::HashMap;

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
        Self { monitors, primary_index }
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
                    monitors.push(MonitorInfo {
                        name: m.name().unwrap_or_else(|_| "unknown".into()),
                        x: m.x(),
                        y: m.y(),
                        width: m.width(),
                        height: m.height(),
                        scale_factor: 1.0,
                        is_primary: m.x() == 0 && m.y() == 0,
                    });
                }
            }
        }
        if monitors.is_empty() {
            monitors.push(MonitorInfo {
                name: "default".into(),
                x: 0, y: 0,
                width: 1920, height: 1080,
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
        self.monitors
            .iter()
            .find(|m| {
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
        Some((virtual_x - monitor.x as f64, virtual_y - monitor.y as f64, monitor))
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
                let idx = self.screen_mgr.monitors().iter().position(|r| std::ptr::eq(r, m));
                format!("screen{}", idx.unwrap_or(0) + 1)
            })
            .unwrap_or_else(|| "screen1".into())
    }
}

impl Default for CoordinateNormalizer {
    fn default() -> Self {
        Self::new(ScreenManager::new())
    }
}
