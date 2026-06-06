use serde::Serialize;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Runtime, WebviewWindow, WebviewWindowBuilder};

use super::screen_router::{CoordinateNormalizer, MonitorInfo, ScreenManager};

#[derive(Debug, Clone, Serialize)]
pub struct OverlayWindowInfo {
    pub screen_name: String,
    pub screen_idx: usize,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub url: String,
}

pub struct OverlayWindowManager<R: Runtime> {
    windows: HashMap<String, WebviewWindow<R>>,
    screen_mgr: ScreenManager,
    coord: CoordinateNormalizer,
}

impl<R: Runtime> OverlayWindowManager<R> {
    pub fn new() -> Self {
        let screen_mgr = ScreenManager::new();
        let coord = CoordinateNormalizer::new(screen_mgr.clone());
        Self {
            windows: HashMap::new(),
            screen_mgr,
            coord,
        }
    }

    pub fn screen_manager(&self) -> &ScreenManager {
        &self.screen_mgr
    }

    pub fn coord(&self) -> &CoordinateNormalizer {
        &self.coord
    }

    pub fn create_per_screen_windows(&mut self, app: &AppHandle<R>, url: &str) -> Result<(), String> {
        let monitors = self.screen_mgr.monitors().to_vec();
        for (idx, monitor) in monitors.iter().enumerate() {
            let label = format!("overlay-{}", idx);
            if self.windows.contains_key(&label) {
                continue;
            }
            let builder = WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App(url.into()))
                .position(monitor.x as f64, monitor.y as f64)
                .inner_size(monitor.width as f64, monitor.height as f64)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .fullscreen(false)
                .transparent(true)
                .visible(false); // B-012: start hidden; shown explicitly via show_overlay
            let window = builder.build()
                .map_err(|e| format!("create overlay window {label}: {e}"))?;
            let _ = window.set_ignore_cursor_events(true);
            self.windows.insert(label, window);
            log::info!("Created overlay window for screen {} ({})", idx, monitor.name);
        }
        Ok(())
    }

    pub fn get_window(&self, screen_idx: usize) -> Option<&WebviewWindow<R>> {
        self.windows.get(&format!("overlay-{}", screen_idx))
    }

    pub fn show_all(&self) {
        for (_label, window) in &self.windows {
            let _ = window.show();
        }
    }

    pub fn hide_all(&self) {
        for (_label, window) in &self.windows {
            let _ = window.hide();
        }
    }

    pub fn emit_on_screen(&self, screen_idx: usize, event: &str, payload: impl Serialize + Clone) -> Result<(), String> {
        if let Some(window) = self.get_window(screen_idx) {
            window.emit(event, payload).map_err(|e| format!("emit on screen {screen_idx}: {e}"))
        } else {
            Err(format!("no overlay window for screen {screen_idx}"))
        }
    }

    pub fn emit_all_screens(&self, event: &str, payload: impl Serialize + Clone) {
        for (label, window) in &self.windows {
            if let Err(e) = window.emit(event, payload.clone()) {
                log::warn!("emit on {label}: {e}");
            }
        }
    }

    pub fn refresh_windows(&mut self, app: &AppHandle<R>, url: &str) -> Result<(), String> {
        self.screen_mgr.refresh();
        self.coord = CoordinateNormalizer::new(self.screen_mgr.clone());

        let monitors = self.screen_mgr.monitors().to_vec();
        let mut kept = std::collections::HashSet::new();

        for (idx, monitor) in monitors.iter().enumerate() {
            let label = format!("overlay-{}", idx);
            kept.insert(label.clone());
            if let Some(window) = self.windows.get(&label) {
                let _ = window.set_position(tauri::PhysicalPosition::new(monitor.x, monitor.y));
                let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(monitor.width, monitor.height)));
            } else {
                let builder = WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App(url.into()))
                    .position(monitor.x as f64, monitor.y as f64)
                    .inner_size(monitor.width as f64, monitor.height as f64)
                    .decorations(false)
                    .always_on_top(true)
                    .skip_taskbar(true)
                    .resizable(false)
                    .transparent(true)
                    .visible(false); // B-012: start hidden
                let window = builder.build()
                    .map_err(|e| format!("refresh create {label}: {e}"))?;
                let _ = window.set_ignore_cursor_events(true);
                self.windows.insert(label, window);
            }
        }

        let to_remove: Vec<String> = self.windows.keys()
            .filter(|k| !kept.contains(k.as_str()))
            .cloned()
            .collect();
        for label in to_remove {
            if let Some(window) = self.windows.remove(&label) {
                let _ = window.close();
            }
        }

        Ok(())
    }

    pub fn window_count(&self) -> usize {
        self.windows.len()
    }

    pub fn is_multi_monitor(&self) -> bool {
        self.windows.len() > 1
    }
}

impl<R: Runtime> Default for OverlayWindowManager<R> {
    fn default() -> Self {
        Self::new()
    }
}

pub fn get_screen_tag(x: f64, y: f64, monitors: &[MonitorInfo]) -> String {
    let idx = monitors.iter().position(|m| {
        x >= m.x as f64
            && x < (m.x + m.width as i32) as f64
            && y >= m.y as f64
            && y < (m.y + m.height as i32) as f64
    });
    format!("screen{}", idx.unwrap_or(0) + 1)
}
