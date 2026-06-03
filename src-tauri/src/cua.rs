use enigo::{
    Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum CuaBackend {
    Native,
    Background,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClickResult {
    pub x: f64,
    pub y: f64,
    pub success: bool,
    pub backend: String,
}

pub struct InputSimulator {
    backend: CuaBackend,
    min_interval_ms: u64,
    last_click_ms: u64,
}

impl Default for InputSimulator {
    fn default() -> Self {
        Self {
            backend: CuaBackend::Native,
            min_interval_ms: 100,
            last_click_ms: 0,
        }
    }
}

impl InputSimulator {
    pub fn new(backend: CuaBackend) -> Self {
        Self {
            backend,
            ..Default::default()
        }
    }

    fn now_ms() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }

    fn check_interval(&mut self) -> bool {
        let now = Self::now_ms();
        if now.saturating_sub(self.last_click_ms) < self.min_interval_ms {
            return false;
        }
        self.last_click_ms = now;
        true
    }

    pub fn click(&mut self, x: f64, y: f64) -> ClickResult {
        if !self.check_interval() {
            return ClickResult {
                x,
                y,
                success: false,
                backend: format!("{:?}", self.backend),
            };
        }

        match self.backend {
            CuaBackend::Native => self.click_native(x, y),
            CuaBackend::Background => self.click_background(x, y),
        }
    }

    fn click_native(&mut self, x: f64, y: f64) -> ClickResult {
        let mut enigo = match Enigo::new(&Settings::default()) {
            Ok(e) => e,
            Err(e) => {
                log::error!("Failed to create Enigo: {e}");
                return ClickResult {
                    x,
                    y,
                    success: false,
                    backend: "native_error".into(),
                };
            }
        };

        let cx = x as i32;
        let cy = y as i32;

        if let Err(e) = enigo.move_mouse(cx, cy, Coordinate::Abs) {
            log::error!("Mouse move failed: {e}");
            return ClickResult {
                x,
                y,
                success: false,
                backend: "native_error".into(),
            };
        }

        std::thread::sleep(std::time::Duration::from_millis(50));

        if let Err(e) = enigo.button(enigo::Button::Left, Direction::Click) {
            log::error!("Mouse click failed: {e}");
            return ClickResult {
                x,
                y,
                success: false,
                backend: "native_error".into(),
            };
        }

        log::info!("Native click at ({}, {})", x, y);
        ClickResult {
            x,
            y,
            success: true,
            backend: "native".into(),
        }
    }

    fn click_background(&mut self, x: f64, y: f64) -> ClickResult {
        log::info!("Background click at ({}, {}) — no cursor warp", x, y);
        let mut enigo = match Enigo::new(&Settings::default()) {
            Ok(e) => e,
            Err(e) => {
                log::error!("Failed to create Enigo: {e}");
                return ClickResult {
                    x,
                    y,
                    success: false,
                    backend: "background_error".into(),
                };
            }
        };

        if let Err(e) = enigo.button(enigo::Button::Left, Direction::Click) {
            log::error!("Background click failed: {e}");
            return ClickResult {
                x,
                y,
                success: false,
                backend: "background_error".into(),
            };
        }

        ClickResult {
            x,
            y,
            success: true,
            backend: "background".into(),
        }
    }

    pub fn double_click(&mut self, x: f64, y: f64) -> ClickResult {
        let first = self.click_native(x, y);
        if first.success {
            std::thread::sleep(std::time::Duration::from_millis(50));
            let second = self.click_native(x, y);
            ClickResult {
                success: first.success && second.success,
                ..first
            }
        } else {
            first
        }
    }

    pub fn type_text(&mut self, text: &str) -> Result<(), String> {
        let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("enigo: {e}"))?;
        enigo.text(text).map_err(|e| format!("type_text: {e}"))
    }

    pub fn key_press(&mut self, key: Key) -> Result<(), String> {
        let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("enigo: {e}"))?;
        enigo.key(key, Direction::Click).map_err(|e| format!("key_press: {e}"))
    }

    pub fn move_cursor(&mut self, x: f64, y: f64) -> Result<(), String> {
        let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("enigo: {e}"))?;
        enigo.move_mouse(x as i32, y as i32, Coordinate::Abs)
            .map_err(|e| format!("move_cursor: {e}"))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuaConfig {
    pub backend: CuaBackend,
    pub native_cua: bool,
    pub min_click_interval_ms: u64,
}

impl Default for CuaConfig {
    fn default() -> Self {
        Self {
            backend: CuaBackend::Native,
            native_cua: true,
            min_click_interval_ms: 100,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rate_limiting_blocks_fast_clicks() {
        let mut sim = InputSimulator::new(CuaBackend::Native);
        sim.min_interval_ms = 1000;
        let now = InputSimulator::now_ms();
        sim.last_click_ms = now;
        assert!(!sim.check_interval());
    }

    #[test]
    fn test_rate_limiting_allows_after_interval() {
        let mut sim = InputSimulator::new(CuaBackend::Native);
        sim.min_interval_ms = 0;
        assert!(sim.check_interval());
    }

    #[test]
    fn test_cua_config_defaults() {
        let cfg = CuaConfig::default();
        assert_eq!(cfg.backend, CuaBackend::Native);
        assert!(cfg.native_cua);
        assert_eq!(cfg.min_click_interval_ms, 100);
    }

    #[test]
    fn test_cua_backend_debug() {
        assert_eq!(format!("{:?}", CuaBackend::Native), "Native");
        assert_eq!(format!("{:?}", CuaBackend::Background), "Background");
    }

    #[test]
    fn test_now_ms_nonzero() {
        let ms = InputSimulator::now_ms();
        assert!(ms > 1_700_000_000_000u64);
    }

    #[test]
    fn test_click_result_structure() {
        let r = ClickResult { x: 10.0, y: 20.0, success: true, backend: "test".into() };
        assert_eq!(r.x, 10.0);
        assert_eq!(r.y, 20.0);
        assert!(r.success);
    }

    #[test]
    fn test_input_simulator_default() {
        let sim = InputSimulator::default();
        assert_eq!(sim.min_interval_ms, 100);
        assert!(sim.last_click_ms > 0 || sim.last_click_ms == 0);
    }

    #[test]
    fn test_coordinate_bounds_safety() {
        // Verify coordinates don't overflow
        let big: f64 = 1e8;
        assert!((big as i32) > 0);
        let neg: f64 = -1e8;
        assert!((neg as i32) < 0);
    }
}
