use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::ai::AiConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioConfig {
    pub ptt_hotkey: String,
    pub stt_provider: String,
    pub tts_provider: String,
    pub activation_mode: String,
    pub auto_submit: bool,
    pub sample_rate: u32,
    pub buffer_size: u32,
    pub volume: f32,
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            ptt_hotkey: "Ctrl+Shift+V".into(),
            stt_provider: "deepgram".into(),
            tts_provider: "elevenlabs".into(),
            activation_mode: "ptt".into(),
            auto_submit: true,
            sample_rate: 16000,
            buffer_size: 1024,
            volume: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyBinding {
    pub key: String,
    pub enabled: bool,
    pub action: String,
}

impl Default for HotkeyBinding {
    fn default() -> Self {
        Self {
            key: "Ctrl+Option".into(),
            enabled: true,
            action: "toggle_panel".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKey {
    pub provider: String,
    pub key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowPrefs {
    pub pin: bool,
    pub width: u32,
    pub height: u32,
}

impl Default for WindowPrefs {
    fn default() -> Self {
        Self {
            pin: false,
            width: 356,
            height: 500,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenConfig {
    pub max_dimension: u32,
    pub jpeg_quality: u8,
    pub cache_ttl_secs: u64,
}

impl Default for ScreenConfig {
    fn default() -> Self {
        Self {
            max_dimension: 1280,
            jpeg_quality: 80,
            cache_ttl_secs: 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayPrefs {
    pub cursor_accent: String,
    pub cursor_size: u32,
    pub show_cursor: bool,
    pub tutor_mode: bool,
    pub agent_dock_position: String,
}

impl Default for OverlayPrefs {
    fn default() -> Self {
        Self {
            cursor_accent: "#4fc3f7".into(),
            cursor_size: 32,
            show_cursor: true,
            tutor_mode: false,
            agent_dock_position: "bottom".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub hotkeys: Vec<HotkeyBinding>,
    pub theme: String,
    pub api_keys: Vec<ApiKey>,
    pub window: WindowPrefs,
    pub version: String,
    pub ai: AiConfig,
    pub screen: ScreenConfig,
    pub overlay: OverlayPrefs,
    pub audio: AudioConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            hotkeys: vec![HotkeyBinding::default()],
            theme: "system".into(),
            api_keys: vec![],
            window: WindowPrefs::default(),
            version: "1.0".into(),
            ai: AiConfig::default(),
            screen: ScreenConfig::default(),
            overlay: OverlayPrefs::default(),
            audio: AudioConfig::default(),
        }
    }
}

fn config_dir() -> PathBuf {
    let base = dirs::config_dir().expect("could not find config directory");
    base.join("clickyx")
}

fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

pub fn load_config(_app: &AppHandle) -> Result<AppConfig, String> {
    let path = config_path();
    if !path.exists() {
        log::info!("No config file found at {:?}, creating defaults", path);
        let config = AppConfig::default();
        save_config_inner(&config)?;
        return Ok(config);
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("failed to read config: {e}"))?;
    match serde_json::from_str::<AppConfig>(&content) {
        Ok(config) => {
            log::info!("Config loaded successfully from {:?}", path);
            Ok(config)
        }
        Err(e) => {
            log::warn!("Invalid config file at {:?}, using defaults: {e}", path);
            Ok(AppConfig::default())
        }
    }
}

fn save_config_inner(config: &AppConfig) -> Result<(), String> {
    let dir = config_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create config dir: {e}"))?;
    let content =
        serde_json::to_string_pretty(config).map_err(|e| format!("failed to serialize config: {e}"))?;
    fs::write(config_path(), content).map_err(|e| format!("failed to write config: {e}"))
}

pub fn validate_hotkeys(hotkeys: &[HotkeyBinding]) -> Result<(), String> {
    let mut seen = std::collections::HashSet::new();
    for binding in hotkeys {
        if binding.enabled && !seen.insert(binding.key.as_str()) {
            return Err(format!("duplicate hotkey binding: {}", binding.key));
        }
    }
    Ok(())
}

pub fn save_config(_app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    validate_hotkeys(&config.hotkeys)?;
    save_config_inner(config)
}
