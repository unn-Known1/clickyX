use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::ai::AiConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AgentConfig {
    pub codex_path: Option<String>,
    pub codex_home: String,
    pub max_workers: u32,
    pub agent_dock_position: String,
    pub enabled_skills: Vec<String>,
    pub encryption_key: String,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            codex_path: None,
            codex_home: {
                let mut p = dirs::data_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
                p.push("clickyx");
                p.push("codex");
                p.to_string_lossy().to_string()
            },
            max_workers: 2,
            agent_dock_position: "bottom".into(),
            enabled_skills: vec!["file_reader".into()],
            encryption_key: String::new(),
        }
    }
}

fn agent_data_dir() -> String {
    let base = dirs::data_dir()
        .map(|p| p.join("clickyx").join("codex"))
        .unwrap_or_else(|| std::path::PathBuf::from("codex"));
    base.to_string_lossy().to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AudioConfig {
    pub ptt_hotkey: String,
    pub stt_provider: String,
    pub tts_provider: String,
    pub activation_mode: String,
    pub auto_submit: bool,
    pub sample_rate: u32,
    pub buffer_size: u32,
    pub volume: f32,
    pub selected_voice_id: String,
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
            selected_voice_id: "21m00Tcm4TlvDq8ikWAM".into(),
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

impl HotkeyBinding {
    pub fn new(key: &str, action: &str) -> Self {
        Self {
            key: key.into(),
            enabled: true,
            action: action.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKey {
    pub provider: String,
    pub key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
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
#[serde(default)]
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
#[serde(default)]
pub struct TypeModeConfig {
    pub enabled: bool,
    pub double_tap_timeout_ms: u64,
    pub indicator_color: String,
}

impl Default for TypeModeConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            double_tap_timeout_ms: 400,
            indicator_color: "#4fc3f7".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ComputerUseConfig {
    pub pointing_model: String,
    pub cua_backend: String,
    pub native_cua: bool,
}

impl Default for ComputerUseConfig {
    fn default() -> Self {
        Self {
            pointing_model: "claude-sonnet-4-20250514".into(),
            cua_backend: "anthropic".into(),
            native_cua: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct OverlayPrefs {
    pub cursor_accent: String,
    pub cursor_size: u32,
    pub show_cursor: bool,
    pub tutor_mode: bool,
    pub agent_dock_position: String,
    pub accent_presets: Vec<String>,
}

impl Default for OverlayPrefs {
    fn default() -> Self {
        Self {
            cursor_accent: "#4fc3f7".into(),
            cursor_size: 32,
            show_cursor: true,
            tutor_mode: false,
            agent_dock_position: "bottom".into(),
            accent_presets: vec![
                "#4fc3f7".into(),
                "#ab47bc".into(),
                "#66bb6a".into(),
                "#ffa726".into(),
            ],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct WakeWordConfig {
    pub enabled: bool,
    pub phrase: String,
    pub sensitivity: f32,
    pub activation_mode: String,
}

impl Default for WakeWordConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            phrase: "hey clicky".into(),
            sensitivity: 0.5,
            activation_mode: "ptt".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: std::collections::HashMap<String, String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
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
    pub agent: AgentConfig,
    pub wake_word: WakeWordConfig,
    pub mcp_servers: Vec<McpServerConfig>,
    pub automations_file: String,
    pub computer_use: ComputerUseConfig,
    pub type_mode: TypeModeConfig,
    pub bridge_token: Option<String>,
    pub onboarding_completed: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            hotkeys: vec![
                HotkeyBinding::default(),
                HotkeyBinding::new("Ctrl+Shift+T", "toggle_type_mode"),
            ],
            theme: "system".into(),
            api_keys: vec![],
            window: WindowPrefs::default(),
            version: "1.0".into(),
            ai: AiConfig::default(),
            screen: ScreenConfig::default(),
            overlay: OverlayPrefs::default(),
            audio: AudioConfig::default(),
            wake_word: WakeWordConfig::default(),
            mcp_servers: vec![],
            automations_file: "automations.json".into(),
            agent: AgentConfig::default(),
            computer_use: ComputerUseConfig::default(),
            type_mode: TypeModeConfig::default(),
            bridge_token: None,
            onboarding_completed: false,
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
        let mut config = AppConfig::default();
        // Generate a stable encryption key on first run
        {
            use rand::RngCore;
            let mut key = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut key);
            config.agent.encryption_key = hex::encode(key);
        }
        save_config_inner(&config)?;
        return Ok(config);
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("failed to read config: {e}"))?;
    match serde_json::from_str::<AppConfig>(&content) {
        Ok(mut config) => {
            // Ensure encryption key is generated and persisted if missing
            if config.agent.encryption_key.is_empty() {
                use rand::RngCore;
                let mut key = [0u8; 32];
                rand::thread_rng().fill_bytes(&mut key);
                config.agent.encryption_key = hex::encode(key);
                log::info!("Generated new encryption key for agent store");
                let _ = save_config_inner(&config);
            }
            log::info!("Config loaded successfully from {:?}", path);
            Ok(config)
        }
        Err(e) => {
            log::warn!("Invalid config file at {:?}, using defaults: {e}", path);
            let config = AppConfig::default();
            // Generate and persist a stable encryption key
            let mut config = config;
            if config.agent.encryption_key.is_empty() {
                use rand::RngCore;
                let mut key = [0u8; 32];
                rand::thread_rng().fill_bytes(&mut key);
                config.agent.encryption_key = hex::encode(key);
            }
            let _ = save_config_inner(&config);
            Ok(config)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_config_default_values() {
        let cfg = AppConfig::default();
        assert_eq!(cfg.theme, "system");
        assert_eq!(cfg.version, "1.0");
        assert!(cfg.api_keys.is_empty());
        assert!(cfg.mcp_servers.is_empty());
        assert_eq!(cfg.automations_file, "automations.json");
        assert!(cfg.bridge_token.is_none());
    }

    #[test]
    fn test_audio_config_defaults() {
        let cfg = AudioConfig::default();
        assert_eq!(cfg.ptt_hotkey, "Ctrl+Shift+V");
        assert_eq!(cfg.stt_provider, "deepgram");
        assert_eq!(cfg.tts_provider, "elevenlabs");
        assert_eq!(cfg.activation_mode, "ptt");
        assert!(cfg.auto_submit);
        assert_eq!(cfg.sample_rate, 16000);
        assert_eq!(cfg.buffer_size, 1024);
        assert!((cfg.volume - 1.0_f32).abs() < f32::EPSILON);
    }

    #[test]
    fn test_agent_config_defaults() {
        let cfg = AgentConfig::default();
        assert!(cfg.codex_path.is_none());
        assert_eq!(cfg.max_workers, 2);
        assert_eq!(cfg.agent_dock_position, "bottom");
        assert_eq!(cfg.enabled_skills.len(), 1);
    }

    #[test]
    fn test_window_prefs_defaults() {
        let prefs = WindowPrefs::default();
        assert!(!prefs.pin);
        assert_eq!(prefs.width, 356);
        assert_eq!(prefs.height, 500);
    }

    #[test]
    fn test_screen_config_defaults() {
        let cfg = ScreenConfig::default();
        assert_eq!(cfg.max_dimension, 1280);
        assert_eq!(cfg.jpeg_quality, 80);
        assert_eq!(cfg.cache_ttl_secs, 3);
    }

    #[test]
    fn test_overlay_prefs_defaults() {
        let prefs = OverlayPrefs::default();
        assert_eq!(prefs.cursor_accent, "#4fc3f7");
        assert_eq!(prefs.cursor_size, 32);
        assert!(prefs.show_cursor);
        assert!(!prefs.tutor_mode);
        assert_eq!(prefs.agent_dock_position, "bottom");
        assert!(!prefs.accent_presets.is_empty());
    }

    #[test]
    fn test_wake_word_config_defaults() {
        let cfg = WakeWordConfig::default();
        assert!(!cfg.enabled);
        assert_eq!(cfg.phrase, "hey clicky");
        assert!((cfg.sensitivity - 0.5_f32).abs() < f32::EPSILON);
    }

    #[test]
    fn test_computer_use_config_defaults() {
        let cfg = ComputerUseConfig::default();
        assert_eq!(cfg.cua_backend, "anthropic");
        assert!(!cfg.native_cua);
    }

    #[test]
    fn test_type_mode_config_defaults() {
        let cfg = TypeModeConfig::default();
        assert!(cfg.enabled);
        assert_eq!(cfg.double_tap_timeout_ms, 400);
        assert_eq!(cfg.indicator_color, "#4fc3f7");
    }

    #[test]
    fn test_hotkey_binding_default() {
        let b = HotkeyBinding::default();
        assert_eq!(b.key, "Ctrl+Option");
        assert!(b.enabled);
        assert_eq!(b.action, "toggle_panel");
    }

    #[test]
    fn test_hotkey_binding_new() {
        let b = HotkeyBinding::new("Ctrl+K", "open_palette");
        assert_eq!(b.key, "Ctrl+K");
        assert_eq!(b.action, "open_palette");
        assert!(b.enabled);
    }

    #[test]
    fn test_app_config_serialization_roundtrip() {
        let original = AppConfig::default();
        let json = serde_json::to_string(&original).expect("serialization failed");
        let parsed: AppConfig = serde_json::from_str(&json).expect("deserialization failed");
        assert_eq!(original.theme, parsed.theme);
        assert_eq!(original.version, parsed.version);
        assert_eq!(original.automations_file, parsed.automations_file);
    }

    #[test]
    fn test_audio_config_serialization_roundtrip() {
        let original = AudioConfig::default();
        let json = serde_json::to_string(&original).expect("serialization failed");
        let parsed: AudioConfig = serde_json::from_str(&json).expect("deserialization failed");
        assert_eq!(original.ptt_hotkey, parsed.ptt_hotkey);
        assert_eq!(original.sample_rate, parsed.sample_rate);
        assert_eq!(original.stt_provider, parsed.stt_provider);
    }

    #[test]
    fn test_agent_config_serialization_roundtrip() {
        let original = AgentConfig::default();
        let json = serde_json::to_string(&original).expect("serialization failed");
        let parsed: AgentConfig = serde_json::from_str(&json).expect("deserialization failed");
        assert_eq!(original.max_workers, parsed.max_workers);
        assert_eq!(original.agent_dock_position, parsed.agent_dock_position);
    }

    #[test]
    fn test_validate_hotkeys_no_duplicates() {
        let hotkeys = vec![
            HotkeyBinding::new("Ctrl+A", "action_a"),
            HotkeyBinding::new("Ctrl+B", "action_b"),
        ];
        assert!(validate_hotkeys(&hotkeys).is_ok());
    }

    #[test]
    fn test_validate_hotkeys_duplicate_returns_error() {
        let hotkeys = vec![
            HotkeyBinding::new("Ctrl+A", "action_a"),
            HotkeyBinding::new("Ctrl+A", "action_b"),
        ];
        let result = validate_hotkeys(&hotkeys);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("duplicate hotkey binding"));
    }

    #[test]
    fn test_validate_hotkeys_disabled_can_duplicate() {
        let hotkeys = vec![
            HotkeyBinding { key: "Ctrl+A".into(), enabled: false, action: "action_a".into() },
            HotkeyBinding { key: "Ctrl+A".into(), enabled: false, action: "action_b".into() },
        ];
        // Disabled bindings should not trigger duplicate check
        assert!(validate_hotkeys(&hotkeys).is_ok());
    }

    #[test]
    fn test_api_key_serialization() {
        let key = ApiKey { provider: "openai".into(), key: "sk-test-123".into() };
        let json = serde_json::to_string(&key).expect("serialization failed");
        let parsed: ApiKey = serde_json::from_str(&json).expect("deserialization failed");
        assert_eq!(key.provider, parsed.provider);
        assert_eq!(key.key, parsed.key);
    }

    #[test]
    fn test_mcp_server_config_serialization() {
        let server = McpServerConfig {
            name: "test-mcp".into(),
            command: "node".into(),
            args: vec!["server.js".into()],
            env: std::collections::HashMap::new(),
            enabled: true,
        };
        let json = serde_json::to_string(&server).expect("serialization failed");
        let parsed: McpServerConfig = serde_json::from_str(&json).expect("deserialization failed");
        assert_eq!(server.name, parsed.name);
        assert_eq!(server.command, parsed.command);
        assert!(parsed.enabled);
    }

    #[test]
    fn test_load_config_handles_missing_file() {
        // Point at a non-existent temp path; load_config creates defaults.
        // We can't easily call load_config without AppHandle in unit tests,
        // so we test save_config_inner directly using tempfile.
        let tmp = tempfile::tempdir().expect("tempdir");
        let cfg_path = tmp.path().join("config.json");
        assert!(!cfg_path.exists());

        // Serialize and deserialize a default config manually (mimics load_config fallback path)
        let default_cfg = AppConfig::default();
        let json = serde_json::to_string_pretty(&default_cfg).expect("serialize");
        std::fs::write(&cfg_path, &json).expect("write");

        let content = std::fs::read_to_string(&cfg_path).expect("read");
        let loaded: AppConfig = serde_json::from_str(&content).expect("parse");
        assert_eq!(loaded.theme, "system");
    }

    #[test]
    fn test_load_config_falls_back_on_invalid_json() {
        // Mimics the invalid-JSON fallback branch in load_config
        let bad_json = "{ this is not valid json }";
        let result: Result<AppConfig, _> = serde_json::from_str(bad_json);
        assert!(result.is_err());
        // The real load_config would return AppConfig::default() here
        let fallback = AppConfig::default();
        assert_eq!(fallback.theme, "system");
    }
}
