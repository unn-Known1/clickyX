use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::agent::codex::CodexProcess;
use crate::agent::session::{AgentSession, AgentStore, ChatMessage, SessionState};
use crate::agent::skills::{self, Skill};
use crate::ai;
use crate::ai::catalog::ModelCatalog;
use crate::ai::streaming::StreamEvent;
use crate::audio::VoicePipeline;
use crate::config::{self, AgentConfig, AppConfig};
use crate::accessibility::{AccessibilityElement, AccessibilityTree};
use crate::permissions::{self, Permission, PermissionStatus};
use crate::screen::auto_capture::{AutoCaptureConfig, AutoCaptureEngine, CapturedFrame};
use crate::screen::capture;
use crate::type_mode::TypeModeEngine;
use crate::updater::{self, UpdateInfo};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub panel_visible: bool,
    pub panel_pinned: bool,
    pub active_tab: String,
    pub app_mode: String,
    pub agent_triggers: Vec<String>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            panel_visible: false,
            panel_pinned: false,
            active_tab: "home".into(),
            app_mode: "idle".into(),
            agent_triggers: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanelState {
    pub panel_visible: bool,
    pub panel_pinned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorCommand {
    pub x: f64,
    pub y: f64,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RectCommand {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScribbleCommand {
    pub points: Vec<[f64; 2]>,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptionCommand {
    pub text: String,
    pub x: f64,
    pub y: f64,
}

#[tauri::command]
pub fn get_config(app: AppHandle) -> Result<AppConfig, String> {
    config::load_config(&app)
}

#[tauri::command]
pub fn update_config(app: AppHandle, partial: serde_json::Value) -> Result<AppConfig, String> {
    let mut config = config::load_config(&app)?;
    if let Some(obj) = partial.as_object() {
        if let Some(theme) = obj.get("theme").and_then(|v| v.as_str()) {
            config.theme = theme.to_string();
        }
        if let Some(window) = obj.get("window") {
            if let Ok(w) = serde_json::from_value(window.clone()) {
                config.window = w;
            }
        }
        if let Some(screen) = obj.get("screen") {
            if let Ok(s) = serde_json::from_value(screen.clone()) {
                config.screen = s;
            }
        }
        if let Some(overlay) = obj.get("overlay") {
            if let Ok(o) = serde_json::from_value(overlay.clone()) {
                config.overlay = o;
            }
        }
        if let Some(hotkeys) = obj.get("hotkeys") {
            if let Ok(h) = serde_json::from_value::<Vec<config::HotkeyBinding>>(hotkeys.clone()) {
                config::validate_hotkeys(&h)?;
                config.hotkeys = h;
            }
        }
        if let Some(api_keys) = obj.get("api_keys") {
            if let Ok(k) = serde_json::from_value(api_keys.clone()) {
                config.api_keys = k;
            }
        }
        if let Some(computer_use) = obj.get("computer_use") {
            if let Ok(c) = serde_json::from_value(computer_use.clone()) {
                config.computer_use = c;
            }
        }
        if let Some(type_mode) = obj.get("type_mode") {
            if let Ok(t) = serde_json::from_value(type_mode.clone()) {
                config.type_mode = t;
            }
        }
    }
    config::save_config(&app, &config)?;
    crate::register_hotkeys(&app)?;
    Ok(config)
}

#[tauri::command]
pub fn toggle_panel(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<PanelState, String> {
    let mut state = state.lock().map_err(|e| format!("lock error: {e}"))?;
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            window.hide().map_err(|e| format!("hide error: {e}"))?;
            state.panel_visible = false;
        } else {
            window.show().map_err(|e| format!("show error: {e}"))?;
            window.set_focus().ok();
            state.panel_visible = true;
        }
        Ok(PanelState {
            panel_visible: state.panel_visible,
            panel_pinned: state.panel_pinned,
        })
    } else {
        Err("main window not found".into())
    }
}

#[tauri::command]
pub fn get_panel_state(state: State<'_, Mutex<AppState>>) -> Result<PanelState, String> {
    let state = state.lock().map_err(|e| format!("lock error: {e}"))?;
    Ok(PanelState {
        panel_visible: state.panel_visible,
        panel_pinned: state.panel_pinned,
    })
}

#[tauri::command]
pub fn toggle_panel_pin(
    state: State<'_, Mutex<AppState>>,
) -> Result<PanelState, String> {
    let mut state = state.lock().map_err(|e| format!("lock error: {e}"))?;
    state.panel_pinned = !state.panel_pinned;
    Ok(PanelState {
        panel_visible: state.panel_visible,
        panel_pinned: state.panel_pinned,
    })
}

#[tauri::command]
pub fn get_app_state(state: State<'_, Mutex<AppState>>) -> Result<AppState, String> {
    let locked = state.lock().map_err(|e| format!("lock error: {e}"))?;
    Ok(locked.clone())
}

#[tauri::command]
pub fn show_overlay(app: AppHandle) -> Result<(), String> {
    crate::overlay::show_overlay(&app)
}

#[tauri::command]
pub fn hide_overlay(app: AppHandle) -> Result<(), String> {
    crate::overlay::hide_overlay(&app)
}

#[tauri::command]
pub async fn send_chat_message(
    app: AppHandle,
    message: String,
    model: Option<String>,
) -> Result<String, String> {
    let config = app.state::<AppConfig>();
    let msg = ai::ChatMessage {
        role: "user".into(),
        content: message,
    };
    let model = model.unwrap_or_else(|| {
        ai::get_default_model(&config.ai, &config.ai.default_provider)
    });
    let provider = ai::create_provider_for_model(&config.ai, &model)
        .map_err(|e| format!("{e}"))?;
    let response = provider
        .chat(&[msg], &model)
        .await
        .map_err(|e| format!("{e}"))?;
    Ok(response)
}

#[tauri::command]
pub async fn send_chat_message_stream(
    app: AppHandle,
    message: String,
    model: Option<String>,
) -> Result<(), String> {
    let config = app.state::<AppConfig>().inner().clone();
    let msg = ai::ChatMessage {
        role: "user".into(),
        content: message,
    };
    let model = model.unwrap_or_else(|| {
        ai::get_default_model(&config.ai, &config.ai.default_provider)
    });

    let app_clone = app.clone();
    tokio::spawn(async move {
        let provider = match ai::create_provider_for_model(&config.ai, &model) {
            Ok(p) => p,
            Err(e) => {
                let _ = app_clone.emit("stream-event", StreamEvent::Error(e.to_string()));
                return;
            }
        };

        let mut receiver = match provider.chat_stream(&[msg], &model).await {
            Ok(r) => r,
            Err(e) => {
                let _ = app_clone.emit("stream-event", StreamEvent::Error(e.to_string()));
                return;
            }
        };

        while let Some(event) = receiver.recv().await {
            let _ = app_clone.emit("stream-event", &event);
            if matches!(event, StreamEvent::Done | StreamEvent::Error(_)) {
                break;
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn get_models(app: AppHandle, provider: Option<String>) -> Result<Vec<ai::catalog::ModelInfo>, String> {
    let mut catalog = ModelCatalog::new();
    let config = app.state::<AppConfig>().inner().clone();
    let ai_cfg = &config.ai;
    if ai_cfg.openai_api_key.as_ref().map_or(false, |k| !k.is_empty()) {
        let remote = ModelCatalog::fetch_openai_compatible(&ai_cfg.openai_base_url, ai_cfg.openai_api_key.as_deref().unwrap_or("")).await;
        catalog.merge_remote(remote);
    }
    match provider {
        Some(p) => Ok(catalog
            .get_provider_models(&p)
            .into_iter()
            .cloned()
            .collect()),
        None => Ok(catalog.models),
    }
}

#[tauri::command]
pub fn get_ai_config(app: AppHandle) -> Result<ai::AiConfig, String> {
    let config = app.state::<AppConfig>();
    Ok(config.ai.clone())
}

#[tauri::command]
pub fn update_ai_config(
    app: AppHandle,
    partial: serde_json::Value,
) -> Result<ai::AiConfig, String> {
    let mut config = app.state::<AppConfig>().inner().clone();
    config.ai = ai::merge_ai_config(&config.ai, &partial);
    config::save_config(&app, &config)?;
    app.manage(config);
    let updated = app.state::<AppConfig>();
    Ok(updated.ai.clone())
}

#[tauri::command]
pub async fn chat_with_vision(
    app: AppHandle,
    message: String,
    images: Vec<String>,
    model: Option<String>,
) -> Result<String, String> {
    let config = app.state::<AppConfig>().inner().clone();
    let msg = ai::ChatMessage {
        role: "user".into(),
        content: message,
    };
    let model = model.unwrap_or_else(|| {
        ai::get_default_model(&config.ai, &config.ai.default_provider)
    });

    let image_inputs: Vec<ai::ImageInput> = images
        .iter()
        .filter_map(|data_url| {
            if let Some(rest) = data_url.strip_prefix("data:") {
                let parts: Vec<&str> = rest.splitn(2, ';').collect();
                if parts.len() == 2 {
                    let media_type = parts[0].to_string();
                    let b64 = parts[1].strip_prefix("base64,").unwrap_or(parts[1]);
                    Some(ai::ImageInput {
                        media_type,
                        data: b64.to_string(),
                    })
                } else {
                    None
                }
            } else {
                Some(ai::ImageInput {
                    media_type: "image/png".into(),
                    data: data_url.clone(),
                })
            }
        })
        .collect();

    let provider = ai::create_provider_for_model(&config.ai, &model)
        .map_err(|e| format!("{e}"))?;
    let response = provider
        .chat_with_vision(&[msg], &model, &image_inputs)
        .await
        .map_err(|e| format!("{e}"))?;
    Ok(response)
}

#[tauri::command]
pub fn capture_screens() -> Result<Vec<capture::ScreenImage>, String> {
    capture::capture_all_screens()
}

#[tauri::command]
pub fn capture_cursor_screen() -> Result<capture::ScreenImage, String> {
    capture::capture_cursor_screen()
}

#[tauri::command]
pub fn capture_focused_window() -> Result<Option<capture::ScreenImage>, String> {
    capture::capture_focused_window()
}

// --- Auto-Capture Commands ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoCaptureStatus {
    pub running: bool,
    pub last_capture: Option<CapturedFrame>,
    pub config: AutoCaptureConfig,
}

#[tauri::command]
pub fn start_auto_capture(
    engine: State<'_, Mutex<AutoCaptureEngine>>,
    interval_ms: Option<u64>,
    capture_mode: Option<String>,
) -> Result<(), String> {
    let engine = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    if let Some(ms) = interval_ms {
        let mut cfg = engine.get_config();
        cfg.interval_ms = ms;
        engine.set_config(cfg);
    }
    if let Some(mode) = capture_mode {
        let mut cfg = engine.get_config();
        cfg.capture_mode = mode;
        engine.set_config(cfg);
    }
    engine.start()
}

#[tauri::command]
pub fn stop_auto_capture(
    engine: State<'_, Mutex<AutoCaptureEngine>>,
) -> Result<(), String> {
    let engine = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    engine.stop()
}

#[tauri::command]
pub fn get_auto_capture_status(
    engine: State<'_, Mutex<AutoCaptureEngine>>,
) -> Result<AutoCaptureStatus, String> {
    let engine = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    Ok(AutoCaptureStatus {
        running: engine.is_running(),
        last_capture: engine.get_latest(),
        config: engine.get_config(),
    })
}

#[tauri::command]
pub fn set_auto_capture_config(
    engine: State<'_, Mutex<AutoCaptureEngine>>,
    config: AutoCaptureConfig,
) -> Result<(), String> {
    let engine = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    engine.set_config(config);
    Ok(())
}

#[tauri::command]
pub fn get_latest_auto_capture(
    engine: State<'_, Mutex<AutoCaptureEngine>>,
) -> Result<Option<String>, String> {
    let engine = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    Ok(engine.get_latest_data_url())
}

#[tauri::command]
pub fn clear_auto_capture_cache(
    engine: State<'_, Mutex<AutoCaptureEngine>>,
) -> Result<(), String> {
    let engine = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    engine.clear_cache();
    Ok(())
}

#[tauri::command]
pub fn overlay_show_cursor(app: AppHandle, x: f64, y: f64, label: Option<String>) -> Result<(), String> {
    crate::overlay::show_cursor(&app, x, y, label)
}

#[tauri::command]
pub fn overlay_show_cursor_on_screen(app: AppHandle, x: f64, y: f64, label: Option<String>, screen_idx: usize) -> Result<(), String> {
    crate::overlay::show_cursor_on_screen(&app, x, y, label, screen_idx)
}

#[tauri::command]
pub fn overlay_show_cursors(app: AppHandle, cursors: Vec<CursorCommand>) -> Result<(), String> {
    for c in cursors {
        crate::overlay::show_cursor(&app, c.x, c.y, c.label)?;
    }
    Ok(())
}

#[tauri::command]
pub fn overlay_show_animated_cursor(
    app: AppHandle,
    x: f64,
    y: f64,
    from_x: f64,
    from_y: f64,
    animation: String,
    label: Option<String>,
    accent: Option<String>,
) -> Result<(), String> {
    crate::overlay::show_animated_cursor(&app, x, y, from_x, from_y, &animation, label, accent)
}

#[tauri::command]
pub fn overlay_show_animated_cursor_on_screen(
    app: AppHandle,
    x: f64,
    y: f64,
    from_x: f64,
    from_y: f64,
    animation: String,
    label: Option<String>,
    accent: Option<String>,
    screen_idx: usize,
) -> Result<(), String> {
    crate::overlay::show_animated_cursor_on_screen(&app, x, y, from_x, from_y, &animation, label, accent, screen_idx)
}

#[tauri::command]
pub fn overlay_show_agent_dock(
    app: AppHandle,
    state: crate::agent::dock::AgentDockState,
) -> Result<(), String> {
    crate::overlay::show_agent_dock(&app, &state)
}

#[tauri::command]
pub fn overlay_hide_agent_dock(app: AppHandle) -> Result<(), String> {
    crate::overlay::hide_agent_dock(&app)
}

#[tauri::command]
pub fn overlay_show_rect(app: AppHandle, x: f64, y: f64, w: f64, h: f64, label: Option<String>) -> Result<(), String> {
    crate::overlay::show_rect(&app, x, y, w, h, label)
}

#[tauri::command]
pub fn overlay_show_rect_on_screen(app: AppHandle, x: f64, y: f64, w: f64, h: f64, label: Option<String>, screen_idx: usize) -> Result<(), String> {
    crate::overlay::show_rect_on_screen(&app, x, y, w, h, label, screen_idx)
}

#[tauri::command]
pub fn overlay_show_scribble(app: AppHandle, points: Vec<[f64; 2]>, label: Option<String>) -> Result<(), String> {
    crate::overlay::show_scribble(&app, points, label)
}

#[tauri::command]
pub fn overlay_show_scribble_on_screen(app: AppHandle, points: Vec<[f64; 2]>, label: Option<String>, screen_idx: usize) -> Result<(), String> {
    crate::overlay::show_scribble_on_screen(&app, points, label, screen_idx)
}

#[tauri::command]
pub fn overlay_show_caption(app: AppHandle, text: String, x: f64, y: f64) -> Result<(), String> {
    crate::overlay::show_caption(&app, &text, x, y)
}

#[tauri::command]
pub fn overlay_show_caption_on_screen(app: AppHandle, text: String, x: f64, y: f64, screen_idx: usize) -> Result<(), String> {
    crate::overlay::show_caption_on_screen(&app, &text, x, y, screen_idx)
}

#[tauri::command]
pub fn overlay_clear(app: AppHandle) -> Result<(), String> {
    crate::overlay::clear_overlays(&app)
}

#[tauri::command]
pub fn set_overlay_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    if visible {
        crate::overlay::show_overlay(&app)
    } else {
        crate::overlay::hide_overlay(&app)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioLevelResponse {
    pub rms: f32,
    pub peak: f32,
    pub clipping: bool,
}

#[tauri::command]
pub fn start_recording(
    state: State<'_, Mutex<AppState>>,
    pipeline: State<'_, Mutex<VoicePipeline>>,
) -> Result<(), String> {
    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    pipe.start_ptt()?;
    let mut s = state.lock().map_err(|e| format!("lock error: {e}"))?;
    s.app_mode = "listening".into();
    Ok(())
}

#[tauri::command]
pub fn stop_recording(
    state: State<'_, Mutex<AppState>>,
    pipeline: State<'_, Mutex<VoicePipeline>>,
) -> Result<String, String> {
    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    let transcript = pipe.stop_ptt_and_transcribe()?;
    let mut s = state.lock().map_err(|e| format!("lock error: {e}"))?;
    s.app_mode = "idle".into();
    Ok(transcript)
}

#[tauri::command]
pub fn get_audio_level(
    pipeline: State<'_, Mutex<VoicePipeline>>,
) -> Result<AudioLevelResponse, String> {
    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    let level = pipe.get_audio_level();
    Ok(AudioLevelResponse {
        rms: level.rms,
        peak: level.peak,
        clipping: level.clipping,
    })
}

#[tauri::command]
pub fn transcribe_audio(
    audio_data: Vec<f32>,
    _provider: Option<String>,
    pipeline: State<'_, Mutex<VoicePipeline>>,
) -> Result<String, String> {
    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    let stt_cfg = pipe.stt_config()?;
    let sample_rate = 16000;

    let rt = tokio::runtime::Handle::try_current()
        .map_err(|e| format!("No tokio runtime: {e}"))?;

    rt.block_on(async { crate::audio::transcribe(&audio_data, &stt_cfg, sample_rate).await })
}

#[tauri::command]
pub fn speak_text(
    text: String,
    _provider: Option<String>,
    pipeline: State<'_, Mutex<VoicePipeline>>,
) -> Result<Vec<u8>, String> {
    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    pipe.speak_response(&text)
}

#[tauri::command]
pub fn start_always_on(
    state: State<'_, Mutex<AppState>>,
    pipeline: State<'_, Mutex<VoicePipeline>>,
    app: AppHandle,
) -> Result<(), String> {
    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    pipe.start_always_on()?;
    let handle = app.clone();
    let _ = pipe.run_always_on_vad_loop(Box::new(move |text| {
        let payload = serde_json::json!({
            "type": "auto_transcript",
            "text": text
        });
        let _ = handle.emit("voice-transcript", payload);
    }));
    let mut s = state.lock().map_err(|e| format!("lock error: {e}"))?;
    s.app_mode = "always_on".into();
    Ok(())
}

#[tauri::command]
pub fn stop_always_on(
    state: State<'_, Mutex<AppState>>,
    pipeline: State<'_, Mutex<VoicePipeline>>,
) -> Result<(), String> {
    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    pipe.stop_always_on()?;
    let mut s = state.lock().map_err(|e| format!("lock error: {e}"))?;
    s.app_mode = "idle".into();
    Ok(())
}

#[tauri::command]
pub fn set_always_on_config(
    threshold: Option<f32>,
    silence_timeout_ms: Option<u64>,
    min_speech_ms: Option<u64>,
    auto_submit: Option<bool>,
    pipeline: State<'_, Mutex<VoicePipeline>>,
) -> Result<(), String> {
    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    let mut cfg = pipe.get_always_on_config()?;
    if let Some(t) = threshold { cfg.vad_threshold = t; }
    if let Some(s) = silence_timeout_ms { cfg.silence_timeout_ms = s; }
    if let Some(m) = min_speech_ms { cfg.min_speech_ms = m; }
    if let Some(a) = auto_submit { cfg.auto_submit = a; }
    pipe.set_always_on_config(cfg)
}

#[tauri::command]
pub fn get_always_on_config(
    pipeline: State<'_, Mutex<VoicePipeline>>,
) -> Result<crate::audio::AlwaysOnConfig, String> {
    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    pipe.get_always_on_config()
}

#[tauri::command]
pub fn set_agent_triggers(
    state: State<'_, Mutex<AppState>>,
    triggers: Vec<String>,
) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| format!("lock error: {e}"))?;
    s.agent_triggers = triggers;
    Ok(())
}

#[tauri::command]
pub fn get_agent_triggers(
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<String>, String> {
    let s = state.lock().map_err(|e| format!("lock error: {e}"))?;
    Ok(s.agent_triggers.clone())
}

#[tauri::command]
pub fn set_ptt_hotkey(
    hotkey: String,
    _state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<(), String> {
    let mut config = config::load_config(&app)?;
    config.audio.ptt_hotkey = hotkey;
    config::save_config(&app, &config)?;
    Ok(())
}

#[tauri::command]
pub fn get_audio_config(app: AppHandle) -> Result<config::AudioConfig, String> {
    let config = config::load_config(&app)?;
    Ok(config.audio)
}

#[tauri::command]
pub fn update_audio_config(
    partial: serde_json::Value,
    pipeline: State<'_, Mutex<VoicePipeline>>,
    app: AppHandle,
) -> Result<config::AudioConfig, String> {
    let mut config = config::load_config(&app)?;
    if let Some(obj) = partial.as_object() {
        if let Some(ptt) = obj.get("ptt_hotkey").and_then(|v| v.as_str()) {
            config.audio.ptt_hotkey = ptt.to_string();
        }
        if let Some(stt) = obj.get("stt_provider").and_then(|v| v.as_str()) {
            config.audio.stt_provider = stt.to_string();
        }
        if let Some(tts) = obj.get("tts_provider").and_then(|v| v.as_str()) {
            config.audio.tts_provider = tts.to_string();
        }
        if let Some(mode) = obj.get("activation_mode").and_then(|v| v.as_str()) {
            let prev_mode = config.audio.activation_mode.clone();
            config.audio.activation_mode = mode.to_string();

            // Start or stop always-on mode when activation_mode changes
            let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
            if mode == "always_on" && prev_mode != "always_on" {
                if pipe.is_always_on_running() {
                    log::info!("Always-on already running");
                } else if let Err(e) = pipe.start_always_on() {
                    log::error!("Failed to start always-on: {e}");
                } else {
                    let handle = app.clone();
                    let _ = pipe.run_always_on_vad_loop(Box::new(move |text| {
                        let payload = serde_json::json!({
                            "type": "auto_transcript",
                            "text": text
                        });
                        let _ = handle.emit("voice-transcript", payload);
                    }));
                    log::info!("Always-on mode started from settings change");
                }
            } else if prev_mode == "always_on" && mode != "always_on" {
                if let Err(e) = pipe.stop_always_on() {
                    log::error!("Failed to stop always-on: {e}");
                } else {
                    log::info!("Always-on mode stopped from settings change");
                }
            }
            drop(pipe);
        }
        if let Some(auto) = obj.get("auto_submit").and_then(|v| v.as_bool()) {
            config.audio.auto_submit = auto;
        }
        if let Some(sr) = obj.get("sample_rate").and_then(|v| v.as_u64()) {
            config.audio.sample_rate = sr as u32;
        }
        if let Some(bs) = obj.get("buffer_size").and_then(|v| v.as_u64()) {
            config.audio.buffer_size = bs as u32;
        }
        if let Some(vol) = obj.get("volume").and_then(|v| v.as_f64()) {
            config.audio.volume = vol as f32;
        }
        if let Some(vid) = obj.get("selected_voice_id").and_then(|v| v.as_str()) {
            config.audio.selected_voice_id = vid.to_string();
        }
    }
    config::save_config(&app, &config)?;

    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    pipe.update_config(&config.audio)?;

    Ok(config.audio)
}

// --- Wake Word Commands ---

#[tauri::command]
pub fn set_wake_word_config(
    app: AppHandle,
    config: serde_json::Value,
) -> Result<crate::config::WakeWordConfig, String> {
    let mut app_config = crate::config::load_config(&app)?;
    if let Ok(wc) = serde_json::from_value::<crate::config::WakeWordConfig>(config) {
        app_config.wake_word = wc.clone();
        crate::config::save_config(&app, &app_config)?;
        Ok(wc)
    } else {
        Err("invalid wake word config".into())
    }
}

#[tauri::command]
pub fn get_wake_word_config(app: AppHandle) -> Result<crate::config::WakeWordConfig, String> {
    let config = crate::config::load_config(&app)?;
    Ok(config.wake_word)
}

#[tauri::command]
pub fn start_wake_word_detection(
    pipeline: State<'_, Mutex<VoicePipeline>>,
) -> Result<bool, String> {
    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    pipe.start_wake_word()?;
    Ok(true)
}

#[tauri::command]
pub fn stop_wake_word_detection(
    pipeline: State<'_, Mutex<VoicePipeline>>,
) -> Result<bool, String> {
    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    pipe.stop_wake_word()?;
    Ok(true)
}

#[tauri::command]
pub fn check_wake_word_detected(
    pipeline: State<'_, Mutex<VoicePipeline>>,
) -> Result<bool, String> {
    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    Ok(pipe.consume_wake_word_detected())
}

// --- Google Workspace Commands ---

#[tauri::command]
pub fn check_google_workspace() -> Result<crate::agent::google::WorkspaceStatus, String> {
    crate::agent::google::GoogleWorkspace::check_auth()
}

#[tauri::command]
pub fn list_emails(count: Option<u32>) -> Result<Vec<crate::agent::google::Email>, String> {
    crate::agent::google::GoogleWorkspace::list_emails(count.unwrap_or(10))
}

#[tauri::command]
pub fn list_calendar_events(count: Option<u32>) -> Result<Vec<crate::agent::google::CalendarEvent>, String> {
    crate::agent::google::GoogleWorkspace::list_calendar_events(count.unwrap_or(10))
}

// --- Automation Commands ---

#[tauri::command]
pub fn list_automations(
    state: State<'_, Mutex<crate::automation::AutomationEngine>>,
) -> Result<Vec<crate::automation::Automation>, String> {
    let engine = state.lock().map_err(|e| format!("lock error: {e}"))?;
    Ok(engine.automations.clone())
}

#[tauri::command]
pub fn create_automation(
    state: State<'_, Mutex<crate::automation::AutomationEngine>>,
    automation: crate::automation::Automation,
) -> Result<crate::automation::Automation, String> {
    let mut engine = state.lock().map_err(|e| format!("lock error: {e}"))?;
    let mut a = automation;
    if a.id.is_empty() {
        a.id = uuid::Uuid::new_v4().to_string();
    }
    engine.add(a.clone());
    Ok(a)
}

#[tauri::command]
pub fn update_automation(
    state: State<'_, Mutex<crate::automation::AutomationEngine>>,
    automation: crate::automation::Automation,
) -> Result<crate::automation::Automation, String> {
    let mut engine = state.lock().map_err(|e| format!("lock error: {e}"))?;
    engine.update(automation.clone());
    Ok(automation)
}

#[tauri::command]
pub fn delete_automation(
    state: State<'_, Mutex<crate::automation::AutomationEngine>>,
    id: String,
) -> Result<bool, String> {
    let mut engine = state.lock().map_err(|e| format!("lock error: {e}"))?;
    engine.remove(&id);
    Ok(true)
}

#[tauri::command]
pub fn toggle_automation(
    state: State<'_, Mutex<crate::automation::AutomationEngine>>,
    id: String,
    enabled: bool,
) -> Result<crate::automation::Automation, String> {
    let mut engine = state.lock().map_err(|e| format!("lock error: {e}"))?;
    if let Some(automation) = engine.automations.iter_mut().find(|a| a.id == id) {
        automation.enabled = enabled;
        let a = automation.clone();
        let _ = engine.save();
        return Ok(a);
    }
    Err("automation not found".into())
}

// --- MCP Commands ---

#[tauri::command]
pub fn get_mcp_servers(app: AppHandle) -> Result<Vec<crate::config::McpServerConfig>, String> {
    let config = crate::config::load_config(&app)?;
    Ok(config.mcp_servers)
}

#[tauri::command]
pub fn add_mcp_server(
    app: AppHandle,
    config: crate::config::McpServerConfig,
) -> Result<Vec<crate::config::McpServerConfig>, String> {
    let mut app_config = crate::config::load_config(&app)?;
    if app_config.mcp_servers.iter().any(|s| s.name == config.name) {
        return Err("MCP server with this name already exists".into());
    }
    app_config.mcp_servers.push(config);
    crate::config::save_config(&app, &app_config)?;
    Ok(app_config.mcp_servers)
}

#[tauri::command]
pub fn update_mcp_server(
    app: AppHandle,
    name: String,
    config: crate::config::McpServerConfig,
) -> Result<Vec<crate::config::McpServerConfig>, String> {
    let mut app_config = crate::config::load_config(&app)?;
    if let Some(server) = app_config.mcp_servers.iter_mut().find(|s| s.name == name) {
        *server = config;
        crate::config::save_config(&app, &app_config)?;
        Ok(app_config.mcp_servers)
    } else {
        Err("MCP server not found".into())
    }
}

#[tauri::command]
pub fn remove_mcp_server(
    app: AppHandle,
    name: String,
) -> Result<Vec<crate::config::McpServerConfig>, String> {
    let mut app_config = crate::config::load_config(&app)?;
    app_config.mcp_servers.retain(|s| s.name != name);
    crate::config::save_config(&app, &app_config)?;
    Ok(app_config.mcp_servers)
}

// --- Type Mode Commands ---

#[tauri::command]
pub fn activate_type_mode(
    engine: State<'_, Mutex<TypeModeEngine>>,
    state: State<'_, Mutex<AppState>>,
) -> Result<String, String> {
    let eng = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    let result = eng.handle_ctrl_press();
    if result == crate::type_mode::TypeModeState::Active {
        let mut s = state.lock().map_err(|e| format!("lock error: {e}"))?;
        s.app_mode = "typing".into();
    }
    Ok(format!("{:?}", result))
}

#[tauri::command]
pub fn deactivate_type_mode(
    engine: State<'_, Mutex<TypeModeEngine>>,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let eng = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    eng.deactivate();
    let mut s = state.lock().map_err(|e| format!("lock error: {e}"))?;
    s.app_mode = "idle".into();
    Ok(())
}

#[tauri::command]
pub fn get_type_mode_state(
    engine: State<'_, Mutex<TypeModeEngine>>,
) -> Result<String, String> {
    let eng = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    Ok(format!("{:?}", eng.get_state()))
}

#[tauri::command]
pub fn type_text(
    text: String,
    engine: State<'_, Mutex<TypeModeEngine>>,
) -> Result<(), String> {
    let eng = engine.lock().map_err(|e| format!("lock error: {e}"))?;
    eng.type_text(&text)
}

#[tauri::command]
pub fn set_type_mode_config(
    config: crate::config::TypeModeConfig,
    app: AppHandle,
) -> Result<(), String> {
    let mut app_config = config::load_config(&app)?;
    app_config.type_mode = config;
    config::save_config(&app, &app_config)?;
    if let Some(engine) = app.try_state::<Mutex<TypeModeEngine>>() {
        if let Ok(eng) = engine.lock() {
            eng.set_config(app_config.type_mode);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_type_mode_config(app: AppHandle) -> Result<crate::config::TypeModeConfig, String> {
    let config = config::load_config(&app)?;
    Ok(config.type_mode)
}

// --- 3D Generation Command ---

#[tauri::command]
pub async fn generate_3d_model(
    prompt: String,
    style: Option<String>,
    app: AppHandle,
) -> Result<String, String> {
    let config = crate::config::load_config(&app)?;
    let api_key = config
        .api_keys
        .iter()
        .find(|k| k.provider.to_lowercase() == "tripo3d")
        .map(|k| k.key.clone())
        .ok_or_else(|| "Tripo3D API key not configured. Add it in Settings > API Keys.".to_string())?;
    let style = style.unwrap_or_else(|| "realistic".into());
    crate::gen3d::generate_3d(&prompt, &style, &api_key).await
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
    pub target: String,
}

#[tauri::command]
pub fn check_permission(permission: String) -> Result<PermissionStatus, String> {
    let perm = Permission::from_name(&permission)
        .ok_or_else(|| format!("unknown permission: {}", permission))?;
    Ok(permissions::check_permission(&perm))
}

#[tauri::command]
pub fn request_permission(permission: String) -> Result<bool, String> {
    let perm = Permission::from_name(&permission)
        .ok_or_else(|| format!("unknown permission: {}", permission))?;
    permissions::request_permission(&perm)
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<UpdateInfo, String> {
    let config = app.state::<AppConfig>();
    updater::check_for_updates(&config.version).await
}

#[tauri::command]
pub async fn install_update(url: String) -> Result<(), String> {
    let data = updater::download_update(&url).await?;
    updater::install_update(&data)
}

#[tauri::command]
pub fn get_logs(count: Option<u32>) -> Result<Vec<LogEntry>, String> {
    let count = count.unwrap_or(100) as usize;
    let log_dir = crate::get_log_dir()?;
    let mut entries = Vec::new();

    if !log_dir.exists() {
        return Ok(entries);
    }

    let mut files: Vec<_> = std::fs::read_dir(&log_dir)
        .map_err(|e| format!("failed to read log dir: {e}"))?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map(|ext| ext == "log").unwrap_or(false))
        .collect();

    files.sort_by_key(|e| e.path().metadata().and_then(|m| m.modified()).ok());

    for file in files.iter().rev() {
        let content = std::fs::read_to_string(file.path())
            .map_err(|e| format!("failed to read log file: {e}"))?;
        for line in content.lines().rev() {
            if entries.len() >= count {
                break;
            }
            let parts: Vec<&str> = line.splitn(4, " | ").collect();
            if parts.len() == 4 {
                entries.push(LogEntry {
                    timestamp: parts[0].into(),
                    level: parts[1].into(),
                    target: parts[2].into(),
                    message: parts[3].into(),
                });
            } else {
                entries.push(LogEntry {
                    timestamp: String::new(),
                    level: String::new(),
                    target: String::new(),
                    message: line.into(),
                });
            }
        }
        if entries.len() >= count {
            break;
        }
    }

    entries.reverse();
    Ok(entries)
}

#[tauri::command]
pub fn clear_logs() -> Result<(), String> {
    let log_dir = crate::get_log_dir()?;
    if !log_dir.exists() {
        return Ok(());
    }
    for entry in std::fs::read_dir(&log_dir)
        .map_err(|e| format!("failed to read log dir: {e}"))?
    {
        let entry = entry.map_err(|e| format!("failed to read entry: {e}"))?;
        if entry.path().extension().map(|ext| ext == "log").unwrap_or(false) {
            std::fs::remove_file(entry.path())
                .map_err(|e| format!("failed to remove log: {e}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn export_config(app: AppHandle) -> Result<String, String> {
    let config = config::load_config(&app)?;
    serde_json::to_string_pretty(&config)
        .map_err(|e| format!("failed to serialize config: {e}"))
}

#[tauri::command]
pub fn import_config(app: AppHandle, json: String) -> Result<AppConfig, String> {
    let config: AppConfig = serde_json::from_str(&json)
        .map_err(|e| format!("invalid config JSON: {e}"))?;
    config::save_config(&app, &config)?;
    app.manage(config.clone());
    Ok(config)
}

#[tauri::command]
pub fn reset_config(app: AppHandle) -> Result<AppConfig, String> {
    let config = AppConfig::default();
    config::save_config(&app, &config)?;
    app.manage(config.clone());
    Ok(config)
}

#[tauri::command]
pub fn get_app_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

#[tauri::command]
pub fn toggle_tutor_mode(app: AppHandle) -> Result<bool, String> {
    let mut config = config::load_config(&app)?;
    config.overlay.tutor_mode = !config.overlay.tutor_mode;
    let new_state = config.overlay.tutor_mode;
    config::save_config(&app, &config)?;
    app.manage(config);
    Ok(new_state)
}

#[tauri::command]
pub fn set_cursor_accent(app: AppHandle, color: String) -> Result<(), String> {
    let mut config = config::load_config(&app)?;
    config.overlay.cursor_accent = color;
    config::save_config(&app, &config)?;
    app.manage(config);
    Ok(())
}

// --- Voice Discovery Commands ---

#[tauri::command]
pub fn get_voices(provider: String) -> Vec<crate::audio::VoiceInfo> {
    crate::audio::get_voices_for_provider(&provider)
}

#[tauri::command]
pub fn get_voice(voice_id: String) -> Option<crate::audio::VoiceInfo> {
    crate::audio::get_voice_by_id(&voice_id)
}

#[tauri::command]
pub fn select_voice(
    app: AppHandle,
    voice_id: String,
    accent_color: Option<String>,
) -> Result<(), String> {
    let mut config = config::load_config(&app)?;
    config.audio.selected_voice_id = voice_id.clone();
    if let Some(ac) = accent_color.clone() {
        config.overlay.cursor_accent = ac;
    }
    config::save_config(&app, &config)?;
    app.manage(config);
    if let Some(ac) = accent_color {
        let _ = app.emit("accent-changed", ac);
    }
    let _ = app.emit("voice-selected", voice_id);
    Ok(())
}

#[tauri::command]
pub fn get_voice_providers() -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({ "id": "elevenlabs", "name": "ElevenLabs", "tier": "premium", "requires_key": true }),
        serde_json::json!({ "id": "cartesia", "name": "Cartesia", "tier": "premium", "requires_key": true }),
        serde_json::json!({ "id": "aura", "name": "Deepgram Aura", "tier": "premium", "requires_key": true }),
        serde_json::json!({ "id": "openai_realtime", "name": "OpenAI Realtime", "tier": "premium", "requires_key": true }),
        serde_json::json!({ "id": "edge", "name": "Microsoft Edge", "tier": "free", "requires_key": false }),
    ]
}

// --- Accent Color Commands ---

#[tauri::command]
pub fn set_accent_preset(
    app: AppHandle,
    color: String,
) -> Result<String, String> {
    let mut config = config::load_config(&app)?;
    config.overlay.cursor_accent = color.clone();
    config::save_config(&app, &config)?;
    app.manage(config);
    let _ = app.emit("accent-changed", color.clone());
    Ok(color)
}

#[tauri::command]
pub fn get_accent_presets(app: AppHandle) -> Result<Vec<String>, String> {
    let config = config::load_config(&app)?;
    Ok(config.overlay.accent_presets)
}

#[tauri::command]
pub fn push_accent_preset(
    app: AppHandle,
    color: String,
) -> Result<Vec<String>, String> {
    let mut config = config::load_config(&app)?;
    if !config.overlay.accent_presets.contains(&color) {
        config.overlay.accent_presets.push(color.clone());
    }
    config.overlay.cursor_accent = color;
    config::save_config(&app, &config)?;
    app.manage(config.clone());
    let _ = app.emit("accent-changed", config.overlay.cursor_accent.clone());
    Ok(config.overlay.accent_presets)
}

pub type AgentState = AgentStore;
pub type CodexState = Option<CodexProcess>;

#[tauri::command]
pub fn list_agents(state: tauri::State<'_, Mutex<AgentStore>>) -> Result<Vec<AgentSession>, String> {
    let store = state.lock().map_err(|e| format!("lock error: {e}"))?;
    Ok(store.list())
}

#[tauri::command]
pub fn create_agent(
    name: String,
    slug: String,
    skills: Vec<String>,
    state: tauri::State<'_, Mutex<AgentStore>>,
) -> Result<AgentSession, String> {
    let mut store = state.lock().map_err(|e| format!("lock error: {e}"))?;
    let session = store.create(name, slug, skills);
    Ok(session)
}

#[tauri::command]
pub async fn run_agent(
    slug: String,
    prompt: String,
    state: tauri::State<'_, Mutex<AgentStore>>,
) -> Result<(), String> {
    let mut store = state.lock().map_err(|e| format!("lock error: {e}"))?;
    let session = store
        .get_mut(&slug)
        .ok_or_else(|| format!("agent '{slug}' not found"))?;
    session.state = SessionState::Running;
    session.transcript.push(ChatMessage {
        role: "user".into(),
        content: prompt,
    });
    let now =
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            .to_string();
    session.updated_at = now;
    Ok(())
}

#[tauri::command]
pub fn stop_agent(
    slug: String,
    state: tauri::State<'_, Mutex<AgentStore>>,
) -> Result<(), String> {
    let mut store = state.lock().map_err(|e| format!("lock error: {e}"))?;
    let session = store
        .get_mut(&slug)
        .ok_or_else(|| format!("agent '{slug}' not found"))?;
    match &session.state {
        SessionState::Running => {
            session.state = SessionState::Paused;
        }
        _ => {} // already stopped, no-op
    }
    let now =
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            .to_string();
    session.updated_at = now;
    Ok(())
}

#[tauri::command]
pub fn archive_agent(
    slug: String,
    state: tauri::State<'_, Mutex<AgentStore>>,
) -> Result<(), String> {
    let mut store = state.lock().map_err(|e| format!("lock error: {e}"))?;
    let session = store
        .get_mut(&slug)
        .ok_or_else(|| format!("agent '{slug}' not found"))?;
    session.state = SessionState::Archived;
    let now =
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            .to_string();
    session.updated_at = now;
    Ok(())
}

#[tauri::command]
pub fn get_agent_status(
    slug: String,
    state: tauri::State<'_, Mutex<AgentStore>>,
) -> Result<AgentSession, String> {
    let store = state.lock().map_err(|e| format!("lock error: {e}"))?;
    store
        .get(&slug)
        .cloned()
        .ok_or_else(|| format!("agent '{slug}' not found"))
}

#[tauri::command]
pub fn get_agent_transcript(
    slug: String,
    state: tauri::State<'_, Mutex<AgentStore>>,
) -> Result<Vec<ChatMessage>, String> {
    let store = state.lock().map_err(|e| format!("lock error: {e}"))?;
    let session = store
        .get(&slug)
        .ok_or_else(|| format!("agent '{slug}' not found"))?;
    Ok(session.transcript.clone())
}

#[tauri::command]
pub fn list_skills() -> Result<Vec<Skill>, String> {
    Ok(skills::load_skills())
}

#[tauri::command]
pub fn enable_skill(
    slug: String,
    skill_name: String,
    state: tauri::State<'_, Mutex<AgentStore>>,
) -> Result<(), String> {
    let mut store = state.lock().map_err(|e| format!("lock error: {e}"))?;
    let session = store
        .get_mut(&slug)
        .ok_or_else(|| format!("agent '{slug}' not found"))?;
    if !session.skills.contains(&skill_name) {
        session.skills.push(skill_name);
    }
    Ok(())
}

#[tauri::command]
pub fn disable_skill(
    slug: String,
    skill_name: String,
    state: tauri::State<'_, Mutex<AgentStore>>,
) -> Result<(), String> {
    let mut store = state.lock().map_err(|e| format!("lock error: {e}"))?;
    let session = store
        .get_mut(&slug)
        .ok_or_else(|| format!("agent '{slug}' not found"))?;
    session.skills.retain(|s| s != &skill_name);
    Ok(())
}

#[tauri::command]
pub fn start_codex(
    app: tauri::AppHandle,
    codex_state: tauri::State<'_, Mutex<CodexState>>,
) -> Result<(), String> {
    let mut state = codex_state.lock().map_err(|e| format!("lock error: {e}"))?;
    if state.is_some() {
        return Err("Codex already running".into());
    }
    let config = app.state::<AppConfig>();
    let mut process = CodexProcess::new(&config.agent);
    process.start(&config.agent)?;
    *state = Some(process);
    Ok(())
}

#[tauri::command]
pub fn stop_codex(
    codex_state: tauri::State<'_, Mutex<CodexState>>,
) -> Result<(), String> {
    let mut state = codex_state.lock().map_err(|e| format!("lock error: {e}"))?;
    if let Some(process) = state.as_mut() {
        process.stop()?;
    }
    *state = None;
    Ok(())
}

#[tauri::command]
pub fn get_codex_status(
    codex_state: tauri::State<'_, Mutex<CodexState>>,
) -> Result<bool, String> {
    let state = codex_state.lock().map_err(|e| format!("lock error: {e}"))?;
    Ok(state.is_some())
}

#[tauri::command]
pub fn get_agent_config(app: tauri::AppHandle) -> Result<AgentConfig, String> {
    let config = app.state::<AppConfig>();
    Ok(config.agent.clone())
}

#[tauri::command]
pub fn update_agent_config(
    app: tauri::AppHandle,
    partial: serde_json::Value,
) -> Result<AgentConfig, String> {
    let mut config = app.state::<AppConfig>().inner().clone();
    if let Some(obj) = partial.as_object() {
        if let Some(path) = obj.get("codex_path").and_then(|v| v.as_str()) {
            config.agent.codex_path = Some(path.to_string());
        }
        if let Some(home) = obj.get("codex_home").and_then(|v| v.as_str()) {
            config.agent.codex_home = home.to_string();
        }
        if let Some(workers) = obj.get("max_workers").and_then(|v| v.as_u64()) {
            config.agent.max_workers = workers as u32;
        }
        if let Some(pos) = obj.get("agent_dock_position").and_then(|v| v.as_str()) {
            config.agent.agent_dock_position = pos.to_string();
        }
        if let Some(skills) = obj.get("enabled_skills").and_then(|v| v.as_array()) {
            config.agent.enabled_skills = skills
                .iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect();
        }
    }
    config::save_config(&app, &config)?;
    app.manage(config);
    let updated = app.state::<AppConfig>();
    Ok(updated.agent.clone())
}

// --- CUA Scroll Command (B-008) ---

#[tauri::command]
pub async fn cua_scroll(
    x: f64,
    y: f64,
    delta_x: f64,
    delta_y: f64,
) -> Result<(), String> {
    let mut sim = crate::cua::InputSimulator::new(crate::cua::CuaBackend::Native);
    sim.scroll(x, y, delta_x, delta_y)
}

// --- Voice-Agent Triggers Command (B-006) ---

#[tauri::command]
pub fn set_agent_voice_triggers(
    triggers: std::collections::HashMap<String, Vec<String>>,
    pipeline: State<'_, Mutex<VoicePipeline>>,
) -> Result<(), String> {
    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    pipe.set_agent_triggers(triggers);
    Ok(())
}

#[tauri::command]
pub fn get_element_at_point(x: i32, y: i32) -> Result<AccessibilityElement, String> {
    let api = crate::accessibility::create_accessibility_api();
    api.get_element_at_point(x, y)
}

#[tauri::command]
pub fn get_focused_element() -> Result<Option<AccessibilityElement>, String> {
    let api = crate::accessibility::create_accessibility_api();
    api.get_focused_element()
}

#[tauri::command]
pub fn get_accessibility_tree_snapshot() -> Result<AccessibilityTree, String> {
    let api = crate::accessibility::create_accessibility_api();
    api.snapshot()
}

#[tauri::command]
pub fn perform_accessibility_action(
    element: AccessibilityElement,
    action: String,
) -> Result<(), String> {
    let api = crate::accessibility::create_accessibility_api();
    api.perform_action(&element, &action)
}

// ── B-010: Agent HUD floating window ─────────────────────────────────────────

#[tauri::command]
pub fn open_agent_hud(app: AppHandle, slug: String) -> Result<(), String> {
    use tauri::WebviewUrl;
    use tauri::webview::WebviewWindowBuilder;

    let label = format!("agent-hud-{}", slug.replace(['.', '/', ' '], "-"));
    let url = format!("agent-hud.html?agent={}", urlencoding_simple(&slug));

    // If the window already exists, focus it
    if let Some(existing) = app.get_webview_window(&label) {
        existing.set_focus().ok();
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title(format!("Agent HUD — {}", slug))
        .inner_size(640.0, 520.0)
        .min_inner_size(480.0, 380.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(false)
        .resizable(true)
        .build()
        .map(|_| ())
        .map_err(|e| format!("Failed to open Agent HUD: {e}"))
}

fn urlencoding_simple(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            ' ' => "%20".to_string(),
            _ => format!("%{:02X}", c as u32),
        })
        .collect()
}

// ── B-011: Agent file attachment ──────────────────────────────────────────────

#[tauri::command]
pub fn agent_attach_files(
    slug: String,
    paths: Vec<String>,
    store: State<'_, Mutex<AgentStore>>,
) -> Result<(), String> {
    let mut store = store.lock().map_err(|e| format!("lock: {e}"))?;
    if let Some(session) = store.sessions.get_mut(&slug) {
        // Store attached file paths in the session context
        for path in &paths {
            session.transcript.push(ChatMessage {
                role: "system".to_string(),
                content: format!("[File attached: {}]", path),
            });
        }
        log::info!("[agent-attach] {} files attached to agent '{}'", paths.len(), slug);
    }
    Ok(())
}
