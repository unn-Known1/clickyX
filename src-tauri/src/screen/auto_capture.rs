use image::codecs::jpeg::JpegEncoder;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use xcap::Monitor;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoCaptureConfig {
    pub enabled: bool,
    pub interval_ms: u64,
    pub capture_mode: String,
    pub diff_threshold: f64,
    pub max_cache: usize,
    pub auto_attach: bool,
}

impl Default for AutoCaptureConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            interval_ms: 5000,
            capture_mode: "full".into(),
            diff_threshold: 0.05,
            max_cache: 10,
            auto_attach: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapturedFrame {
    pub data: Vec<u8>,
    pub timestamp: u64,
    pub region: String,
    pub width: u32,
    pub height: u32,
}

pub struct AutoCaptureEngine {
    captures: Arc<Mutex<Vec<CapturedFrame>>>,
    previous_frame: Arc<Mutex<Option<Vec<u8>>>>,
    last_capture: Arc<Mutex<Option<Instant>>>,
    running: Arc<AtomicBool>,
    config: Arc<Mutex<AutoCaptureConfig>>,
}

impl AutoCaptureEngine {
    pub fn new(config: AutoCaptureConfig) -> Self {
        let cap = config.max_cache;
        Self {
            captures: Arc::new(Mutex::new(Vec::with_capacity(cap))),
            previous_frame: Arc::new(Mutex::new(None)),
            last_capture: Arc::new(Mutex::new(None)),
            running: Arc::new(AtomicBool::new(false)),
            config: Arc::new(Mutex::new(config)),
        }
    }

    pub fn start(&self) -> Result<(), String> {
        if self.running.load(Ordering::SeqCst) {
            return Err("auto-capture already running".into());
        }
        self.running.store(true, Ordering::SeqCst);

        let running = self.running.clone();
        let config = self.config.clone();
        let captures = self.captures.clone();
        let prev_frame = self.previous_frame.clone();
        let last_time = self.last_capture.clone();

        std::thread::spawn(move || {
            while running.load(Ordering::SeqCst) {
                let (interval, mode, threshold, max_cache) = {
                    let cfg = config.lock().unwrap();
                    (
                        Duration::from_millis(cfg.interval_ms),
                        cfg.capture_mode.clone(),
                        cfg.diff_threshold,
                        cfg.max_cache,
                    )
                };

                {
                    let last = last_time.lock().unwrap();
                    if let Some(prev) = *last {
                        if prev.elapsed() < interval {
                            std::thread::sleep(Duration::from_millis(50));
                            continue;
                        }
                    }
                }

                let result = match mode.as_str() {
                    "cursor" => capture_cursor_jpeg(),
                    "focused" => capture_focused_window_jpeg(),
                    _ => capture_primary_jpeg(),
                };

                if let Ok((jpeg_bytes, width, height)) = result {
                    let now = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;

                    let diff = {
                        let prev = prev_frame.lock().unwrap();
                        match prev.as_ref() {
                            Some(p) => compute_diff(p, &jpeg_bytes),
                            None => 1.0,
                        }
                    };

                    if diff > threshold {
                        let mut caps = captures.lock().unwrap();
                        let frame = CapturedFrame {
                            data: jpeg_bytes.clone(),
                            timestamp: now,
                            region: mode.clone(),
                            width,
                            height,
                        };
                        caps.push(frame);
                        while caps.len() > max_cache {
                            caps.remove(0);
                        }
                        drop(caps);
                        *prev_frame.lock().unwrap() = Some(jpeg_bytes);
                        *last_time.lock().unwrap() = Some(Instant::now());
                    }
                }

                std::thread::sleep(Duration::from_millis(50));
            }
        });

        Ok(())
    }

    pub fn stop(&self) -> Result<(), String> {
        self.running.store(false, Ordering::SeqCst);
        Ok(())
    }

    pub fn get_latest(&self) -> Option<CapturedFrame> {
        let caps = self.captures.lock().ok()?;
        caps.last().cloned()
    }

    pub fn get_history(&self, n: usize) -> Vec<CapturedFrame> {
        let caps = self.captures.lock().ok();
        match caps {
            Some(c) => {
                let len = c.len();
                let start = if len > n { len - n } else { 0 };
                c[start..].to_vec()
            }
            None => Vec::new(),
        }
    }

    pub fn set_config(&self, config: AutoCaptureConfig) {
        if let Ok(mut c) = self.config.lock() {
            if config.max_cache != c.max_cache {
                let mut caps = self.captures.lock().unwrap();
                while caps.len() > config.max_cache {
                    caps.remove(0);
                }
                caps.shrink_to_fit();
            }
            *c = config;
        }
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn get_config(&self) -> AutoCaptureConfig {
        self.config.lock().unwrap().clone()
    }
}

fn capture_primary_jpeg() -> Result<(Vec<u8>, u32, u32), String> {
    let monitors = Monitor::all().map_err(|e| format!("enumerate monitors: {e}"))?;
    let monitor = monitors
        .iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .or_else(|| monitors.first())
        .ok_or_else(|| "no monitors found".to_string())?;
    let width = monitor.width().map_err(|e| format!("monitor width: {e}"))?;
    let height = monitor.height().map_err(|e| format!("monitor height: {e}"))?;
    let img = monitor
        .capture_image()
        .map_err(|e| format!("monitor capture: {e}"))?;
    let mut buf = Vec::new();
    JpegEncoder::new_with_quality(&mut buf, 85)
        .encode(img.as_raw(), width, height, image::ColorType::Rgba8.into())
        .map_err(|e| format!("jpeg encoding: {e}"))?;
    Ok((buf, width, height))
}

fn capture_cursor_jpeg() -> Result<(Vec<u8>, u32, u32), String> {
    if let Ok(windows) = xcap::Window::all() {
        for w in &windows {
            if w.is_focused().unwrap_or(false) {
                if let Ok(monitor) = w.current_monitor() {
                    let width = monitor.width().map_err(|e| format!("monitor width: {e}"))?;
                    let height = monitor.height().map_err(|e| format!("monitor height: {e}"))?;
                    let img = monitor
                        .capture_image()
                        .map_err(|e| format!("monitor capture: {e}"))?;
                    let mut buf = Vec::new();
                    JpegEncoder::new_with_quality(&mut buf, 85)
                        .encode(img.as_raw(), width, height, image::ColorType::Rgba8.into())
                        .map_err(|e| format!("jpeg encoding: {e}"))?;
                    return Ok((buf, width, height));
                }
            }
        }
    }
    capture_primary_jpeg()
}

fn capture_focused_window_jpeg() -> Result<(Vec<u8>, u32, u32), String> {
    if let Ok(windows) = xcap::Window::all() {
        for w in &windows {
            if w.is_focused().unwrap_or(false) {
                let img = w
                    .capture_image()
                    .map_err(|e| format!("window capture: {e}"))?;
                let width = img.width();
                let height = img.height();
                let mut buf = Vec::new();
                JpegEncoder::new_with_quality(&mut buf, 85)
                    .encode(img.as_raw(), width, height, image::ColorType::Rgba8.into())
                    .map_err(|e| format!("jpeg encoding: {e}"))?;
                return Ok((buf, width, height));
            }
        }
    }
    capture_primary_jpeg()
}

fn compute_diff(prev: &[u8], curr: &[u8]) -> f64 {
    let prev_img = match image::load_from_memory(prev) {
        Ok(img) => img,
        Err(_) => return 1.0,
    };
    let curr_img = match image::load_from_memory(curr) {
        Ok(img) => img,
        Err(_) => return 1.0,
    };

    let prev_thumb = prev_img.resize_exact(32, 32, image::imageops::FilterType::Nearest);
    let curr_thumb = curr_img.resize_exact(32, 32, image::imageops::FilterType::Nearest);

    let prev_gray = prev_thumb.grayscale().into_luma8();
    let curr_gray = curr_thumb.grayscale().into_luma8();

    let total = (32 * 32) as f64;
    let changed = prev_gray
        .pixels()
        .zip(curr_gray.pixels())
        .filter(|(a, b)| {
            let diff = if a.0[0] > b.0[0] {
                a.0[0] - b.0[0]
            } else {
                b.0[0] - a.0[0]
            };
            diff > 10
        })
        .count() as f64;

    changed / total
}
