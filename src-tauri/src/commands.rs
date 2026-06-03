use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::ai;
use crate::ai::catalog::ModelCatalog;
use crate::ai::streaming::StreamEvent;
use crate::audio::VoicePipeline;
use crate::config::{self, AppConfig};
use crate::screen::capture;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub panel_visible: bool,
    pub panel_pinned: bool,
    pub active_tab: String,
    pub app_mode: String,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            panel_visible: false,
            panel_pinned: false,
            active_tab: "home".into(),
            app_mode: "idle".into(),
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
pub fn get_models(provider: Option<String>) -> Result<Vec<ai::catalog::ModelInfo>, String> {
    let catalog = ModelCatalog::new();
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

#[tauri::command]
pub fn overlay_show_cursor(app: AppHandle, x: f64, y: f64, label: Option<String>) -> Result<(), String> {
    crate::overlay::show_cursor(&app, x, y, label)
}

#[tauri::command]
pub fn overlay_show_cursors(app: AppHandle, cursors: Vec<CursorCommand>) -> Result<(), String> {
    for c in cursors {
        crate::overlay::show_cursor(&app, c.x, c.y, c.label)?;
    }
    Ok(())
}

#[tauri::command]
pub fn overlay_show_rect(app: AppHandle, x: f64, y: f64, w: f64, h: f64, label: Option<String>) -> Result<(), String> {
    crate::overlay::show_rect(&app, x, y, w, h, label)
}

#[tauri::command]
pub fn overlay_show_scribble(app: AppHandle, points: Vec<[f64; 2]>, label: Option<String>) -> Result<(), String> {
    crate::overlay::show_scribble(&app, points, label)
}

#[tauri::command]
pub fn overlay_show_caption(app: AppHandle, text: String, x: f64, y: f64) -> Result<(), String> {
    crate::overlay::show_caption(&app, &text, x, y)
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
    provider: Option<String>,
    pipeline: State<'_, Mutex<VoicePipeline>>,
) -> Result<String, String> {
    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    let stt_cfg = pipe.stt_config();
    let sample_rate = 16000;

    let rt = tokio::runtime::Handle::try_current()
        .map_err(|e| format!("No tokio runtime: {e}"))?;

    rt.block_on(async { crate::audio::transcribe(&audio_data, &stt_cfg, sample_rate).await })
}

#[tauri::command]
pub fn speak_text(
    text: String,
    provider: Option<String>,
    pipeline: State<'_, Mutex<VoicePipeline>>,
) -> Result<Vec<u8>, String> {
    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    pipe.speak_response(&text)
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
            config.audio.activation_mode = mode.to_string();
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
    }
    config::save_config(&app, &config)?;

    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    pipe.update_config(&config.audio)?;

    Ok(config.audio)
}
