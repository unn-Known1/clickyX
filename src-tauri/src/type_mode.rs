use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use serde::{Deserialize, Serialize};

use crate::config::TypeModeConfig;
#[cfg(target_os = "windows")]
use crate::cua::ensure_com;

#[cfg(target_os = "linux")]
fn is_wayland() -> bool {
    crate::platform::display_server() == "wayland"
}
#[cfg(target_os = "linux")]
use crate::platform::display_server;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum TypeModeState {
    Idle,
    CtrlTapped,
    Active,
}

impl Default for TypeModeState {
    fn default() -> Self {
        Self::Idle
    }
}

pub struct TypeModeEngine {
    state: Mutex<TypeModeState>,
    last_ctrl_time: AtomicU64,
    active: AtomicBool,
    config: Mutex<TypeModeConfig>,
}

impl Default for TypeModeEngine {
    fn default() -> Self {
        Self {
            state: Mutex::new(TypeModeState::Idle),
            last_ctrl_time: AtomicU64::new(0),
            active: AtomicBool::new(false),
            config: Mutex::new(TypeModeConfig::default()),
        }
    }
}

impl TypeModeEngine {
    pub fn new(config: TypeModeConfig) -> Self {
        Self {
            state: Mutex::new(TypeModeState::Idle),
            last_ctrl_time: AtomicU64::new(0),
            active: AtomicBool::new(false),
            config: Mutex::new(config),
        }
    }

    fn now_ms() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }

    pub fn handle_ctrl_press(&self) -> TypeModeState {
        let cfg = self.config.lock().unwrap();
        if !cfg.enabled {
            return TypeModeState::Idle;
        }
        let timeout = cfg.double_tap_timeout_ms;
        drop(cfg);

        let now = Self::now_ms();
        let last = self.last_ctrl_time.load(Ordering::SeqCst);

        if now.saturating_sub(last) <= timeout {
            self.last_ctrl_time.store(0, Ordering::SeqCst);
            self.active.store(true, Ordering::SeqCst);
            let mut state = self.state.lock().unwrap();
            *state = TypeModeState::Active;
            log::info!("Type mode: activated (double-tap Ctrl)");
            TypeModeState::Active
        } else {
            self.last_ctrl_time.store(now, Ordering::SeqCst);
            let mut state = self.state.lock().unwrap();
            *state = TypeModeState::CtrlTapped;
            log::info!("Type mode: Ctrl tapped once");
            TypeModeState::CtrlTapped
        }
    }

    pub fn deactivate(&self) -> TypeModeState {
        self.active.store(false, Ordering::SeqCst);
        let mut state = self.state.lock().unwrap();
        *state = TypeModeState::Idle;
        self.last_ctrl_time.store(0, Ordering::SeqCst);
        TypeModeState::Idle
    }

    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::SeqCst)
    }

    pub fn get_state(&self) -> TypeModeState {
        *self.state.lock().unwrap()
    }

    pub fn get_config(&self) -> TypeModeConfig {
        self.config.lock().unwrap().clone()
    }

    pub fn set_config(&self, config: TypeModeConfig) {
        *self.config.lock().unwrap() = config;
    }

    pub fn type_text(&self, text: &str) -> Result<(), String> {
        if !self.is_active() {
            return Err("Type mode not active".into());
        }
        #[cfg(target_os = "windows")]
        ensure_com();
        #[cfg(target_os = "linux")]
        if is_wayland() {
            let escaped = text.replace('\\', "\\\\").replace('"', "\\\"");
            return std::process::Command::new("wtype")
                .args(["-k", "--", &escaped])
                .output()
                .map(|_| ())
                .map_err(|e| format!("type_text via wtype failed: {e}"));
        }
        let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("enigo: {e}"))?;
        enigo.text(text).map_err(|e| format!("type_text: {e}"))
    }

    pub fn key_press(&self, key: Key) -> Result<(), String> {
        if !self.is_active() {
            return Err("Type mode not active".into());
        }
        #[cfg(target_os = "windows")]
        ensure_com();
        #[cfg(target_os = "linux")]
        if is_wayland() {
            return Err(format!(
                "key_press not supported on Wayland. Install wtype and use type_text instead."
            ));
        }
        let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("enigo: {e}"))?;
        enigo.key(key, Direction::Click).map_err(|e| format!("key_press: {e}"))
    }

    fn reset_timeout_if_idle(&self) {
        let state = *self.state.lock().unwrap();
        if state == TypeModeState::CtrlTapped {
            let cfg = self.config.lock().unwrap();
            let timeout = cfg.double_tap_timeout_ms;
            drop(cfg);
            let now = Self::now_ms();
            let last = self.last_ctrl_time.load(Ordering::SeqCst);
            if last > 0 && now.saturating_sub(last) > timeout {
                self.last_ctrl_time.store(0, Ordering::SeqCst);
                let mut s = self.state.lock().unwrap();
                *s = TypeModeState::Idle;
                log::info!("Type mode: single-tap timeout expired");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_type_mode_state_default() {
        assert_eq!(TypeModeState::default(), TypeModeState::Idle);
    }

    #[test]
    fn test_type_mode_engine_default() {
        let engine = TypeModeEngine::default();
        assert!(!engine.is_active());
        assert_eq!(engine.get_state(), TypeModeState::Idle);
    }

    #[test]
    fn test_single_ctrl_tap() {
        let engine = TypeModeEngine::new(TypeModeConfig {
            enabled: true,
            double_tap_timeout_ms: 400,
            indicator_color: "#4fc3f7".into(),
        });
        let state = engine.handle_ctrl_press();
        assert_eq!(state, TypeModeState::CtrlTapped);
        assert!(!engine.is_active());
    }

    #[test]
    fn test_deactivate() {
        let engine = TypeModeEngine::default();
        engine.active.store(true, Ordering::SeqCst);
        engine.deactivate();
        assert!(!engine.is_active());
    }

    #[test]
    fn test_type_text_fails_when_inactive() {
        let engine = TypeModeEngine::default();
        let result = engine.type_text("hello");
        assert!(result.is_err());
    }

    #[test]
    fn test_config_roundtrip() {
        let engine = TypeModeEngine::default();
        let cfg = TypeModeConfig {
            enabled: false,
            double_tap_timeout_ms: 200,
            indicator_color: "#ff0000".into(),
        };
        engine.set_config(cfg.clone());
        let retrieved = engine.get_config();
        assert_eq!(retrieved.enabled, cfg.enabled);
        assert_eq!(retrieved.double_tap_timeout_ms, cfg.double_tap_timeout_ms);
        assert_eq!(retrieved.indicator_color, cfg.indicator_color);
    }
}
