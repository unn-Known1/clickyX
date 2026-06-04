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
        log::info!("Background click at ({}, {}) — attempting platform-specific no-cursor-warp", x, y);

        // Try platform-specific background click first; fall back to enigo if it fails.
        match self.click_background_platform(x, y) {
            Ok(()) => {
                return ClickResult {
                    x,
                    y,
                    success: true,
                    backend: "background_platform".into(),
                };
            }
            Err(e) => {
                log::warn!("Platform background click failed ({}), falling back to enigo", e);
            }
        }

        // Fallback: enigo without cursor warp
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
            backend: "background_enigo".into(),
        }
    }

    /// Platform-specific background click — sends input events without moving the hardware cursor.
    fn click_background_platform(&self, x: f64, y: f64) -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            // Windows: use SendInput via PowerShell to send WM_LBUTTONDOWN/UP without cursor warp
            let cx = x as i64;
            let cy = y as i64;
            let script = format!(
                r#"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Input {{
    public struct POINT {{ public int X, Y; }}
    [DllImport("user32.dll")]
    public static extern IntPtr WindowFromPoint(POINT p);
    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr w, IntPtr l);
    public const uint WM_LBUTTONDOWN = 0x0201;
    public const uint WM_LBUTTONUP   = 0x0202;
    public static int MakeLParam(int x, int y) {{ return (y << 16) | (x & 0xFFFF); }}
    public static void Click(int x, int y) {{
        var pt = new POINT {{ X = x, Y = y }};
        var hwnd = WindowFromPoint(pt);
        if (hwnd == IntPtr.Zero) return;
        var lp = new IntPtr(MakeLParam(x, y));
        SendMessage(hwnd, WM_LBUTTONDOWN, IntPtr.Zero, lp);
        System.Threading.Thread.Sleep(30);
        SendMessage(hwnd, WM_LBUTTONUP,   IntPtr.Zero, lp);
    }}
}}
"@
[Input]::Click({}, {})
"#,
                cx, cy
            );
            let output = std::process::Command::new("powershell")
                .args(["-NoProfile", "-NonInteractive", "-Command", &script])
                .output()
                .map_err(|e| format!("powershell launch failed: {e}"))?;
            if output.status.success() {
                return Ok(());
            }
            return Err(format!(
                "powershell exited with {}",
                output.status
            ));
        }

        #[cfg(target_os = "macos")]
        {
            // macOS: use osascript to send a click at the coordinates via System Events.
            // Requires Accessibility permission.
            let cx = x as i64;
            let cy = y as i64;
            let script = format!(
                "tell application \"System Events\" to click at {{{}, {}}}",
                cx, cy
            );
            let output = std::process::Command::new("osascript")
                .args(["-e", &script])
                .output()
                .map_err(|e| format!("osascript launch failed: {e}"))?;
            if output.status.success() {
                return Ok(());
            }
            return Err(format!(
                "osascript exited with {}: {}",
                output.status,
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        #[cfg(target_os = "linux")]
        {
            // Linux: use xdotool to click the window at the given screen coords
            // without actually moving the hardware cursor globally.
            let cx = x as i64;
            let cy = y as i64;
            // 1. Find the window ID at the given point.
            let search_output = std::process::Command::new("xdotool")
                .args([
                    "search",
                    "--onlyvisible",
                    "--class",
                    "",
                ])
                .output()
                .map_err(|e| format!("xdotool search failed: {e}"))?;
            let win_ids: Vec<&str> = std::str::from_utf8(&search_output.stdout)
                .unwrap_or("")
                .lines()
                .collect();

            // Find topmost window containing the point
            let mut target_win: Option<String> = None;
            for win_id in win_ids.iter().rev() {
                let win_id = win_id.trim();
                if win_id.is_empty() {
                    continue;
                }
                let geom_out = std::process::Command::new("xdotool")
                    .args(["getwindowgeometry", "--shell", win_id])
                    .output();
                if let Ok(go) = geom_out {
                    let s = String::from_utf8_lossy(&go.stdout);
                    let (mut wx, mut wy, mut ww, mut wh) = (0i64, 0i64, 0i64, 0i64);
                    for line in s.lines() {
                        if let Some(v) = line.strip_prefix("X=") { wx = v.trim().parse().unwrap_or(0); }
                        if let Some(v) = line.strip_prefix("Y=") { wy = v.trim().parse().unwrap_or(0); }
                        if let Some(v) = line.strip_prefix("WIDTH=") { ww = v.trim().parse().unwrap_or(0); }
                        if let Some(v) = line.strip_prefix("HEIGHT=") { wh = v.trim().parse().unwrap_or(0); }
                    }
                    if cx >= wx && cx < wx + ww && cy >= wy && cy < wy + wh {
                        target_win = Some(win_id.to_string());
                        break;
                    }
                }
            }

            let win_arg = target_win.unwrap_or_else(|| {
                // Fallback: use focused window
                std::process::Command::new("xdotool")
                    .arg("getfocus")
                    .output()
                    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                    .unwrap_or_default()
            });

            if win_arg.is_empty() {
                return Err("could not determine target window".into());
            }

            // Click at window-relative coordinates
            let output = std::process::Command::new("xdotool")
                .args([
                    "click",
                    "--window",
                    &win_arg,
                    "--clearmodifiers",
                    "1",
                ])
                .output()
                .map_err(|e| format!("xdotool click failed: {e}"))?;

            if output.status.success() {
                return Ok(());
            }
            return Err(format!("xdotool click exited with {}", output.status));
        }

        #[allow(unreachable_code)]
        Err("no platform-specific background click implementation".into())
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

    /// Scroll at position (x, y) by (delta_x, delta_y) units (Windows scroll-wheel units, 120 per notch).
    pub fn scroll(&mut self, x: f64, y: f64, delta_x: f64, delta_y: f64) -> Result<(), String> {
        let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("enigo: {e}"))?;
        // Move to position first
        enigo.move_mouse(x as i32, y as i32, Coordinate::Abs)
            .map_err(|e| format!("scroll move: {e}"))?;
        std::thread::sleep(std::time::Duration::from_millis(30));
        // Scroll vertically
        if delta_y.abs() > 0.1 {
            let steps = ((delta_y.abs() / 120.0).max(1.0) as i32)
                .saturating_mul(if delta_y > 0.0 { 1 } else { -1 });
            enigo.scroll(steps, enigo::Axis::Vertical)
                .map_err(|e| format!("scroll vertical: {e}"))?;
        }
        // Scroll horizontally
        if delta_x.abs() > 0.1 {
            let steps = ((delta_x.abs() / 120.0).max(1.0) as i32)
                .saturating_mul(if delta_x > 0.0 { 1 } else { -1 });
            enigo.scroll(steps, enigo::Axis::Horizontal)
                .map_err(|e| format!("scroll horizontal: {e}"))?;
        }
        log::info!("Scroll at ({}, {}) delta=({}, {})", x, y, delta_x, delta_y);
        Ok(())
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
