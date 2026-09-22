//! audio_cmds: Tauri command handlers (split from commands.rs in P3).
//!
//! Re-exported through `crate::commands`; `commands::foo` paths keep working.

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

use crate::agent::session::{AgentStore, SessionState};
use crate::audio::VoicePipeline;
use crate::config::{self};

use super::types::*;

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
pub fn get_audio_status(
    state: State<'_, Mutex<AppState>>,
    pipeline: State<'_, Mutex<VoicePipeline>>,
) -> Result<AudioStatusResponse, String> {
    let s = state.lock().map_err(|e| format!("lock error: {e}"))?;
    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    let is_running = pipe.is_always_on_running()
        || matches!(
            pipe.get_state().ok(),
            Some(crate::audio::PipelineState::Listening)
        );
    Ok(AudioStatusResponse {
        listening: is_running,
        mode: s.app_mode.clone(),
    })
}

#[tauri::command]
pub fn get_today_stats(store: State<'_, Mutex<AgentStore>>) -> Result<TodayStatsResponse, String> {
    let store = store.lock().map_err(|e| format!("lock error: {e}"))?;
    // #16: only count sessions active today, not the entire history.
    let today = crate::automation::now_date_parts();
    let mut agents_run = 0;
    let mut voice_commands = 0;
    let mut items_for_review = 0;
    for session in store.sessions.values() {
        let created = crate::agent::session::parse_ts_secs(&session.created_at);
        let parts = crate::automation::date_parts_from_unix_secs(created);
        let is_today = parts == today;
        if !is_today {
            continue;
        }
        if matches!(session.state, SessionState::Completed { .. }) {
            agents_run += 1;
        }
        for msg in &session.transcript {
            if msg.role == "user" {
                voice_commands += 1;
            }
        }
        if matches!(session.state, SessionState::Failed { .. }) {
            items_for_review += 1;
        }
    }
    Ok(TodayStatsResponse {
        agents_run,
        voice_commands,
        items_for_review,
    })
}

#[tauri::command]
pub async fn transcribe_audio(
    audio_data: Vec<f32>,
    _provider: Option<String>,
    pipeline: State<'_, Mutex<VoicePipeline>>,
) -> Result<String, String> {
    // #17: async command — runs directly on the Tauri async runtime, no
    // hand-rolled Runtime::new()/block_on on the main thread.
    // The MutexGuard must be dropped before the await point (it is not Send).
    let stt_cfg = {
        let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
        pipe.stt_config()?
    };
    let sample_rate = 16000;
    crate::audio::transcribe(&audio_data, &stt_cfg, sample_rate).await
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
    if let Some(t) = threshold {
        cfg.vad_threshold = t;
    }
    if let Some(s) = silence_timeout_ms {
        cfg.silence_timeout_ms = s;
    }
    if let Some(m) = min_speech_ms {
        cfg.min_speech_ms = m;
    }
    if let Some(a) = auto_submit {
        cfg.auto_submit = a;
    }
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
pub fn get_agent_triggers(state: State<'_, Mutex<AppState>>) -> Result<Vec<String>, String> {
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
    pipe.update_config(&config.audio, &config.api_keys)?;

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
pub fn stop_wake_word_detection(pipeline: State<'_, Mutex<VoicePipeline>>) -> Result<bool, String> {
    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    pipe.stop_wake_word()?;
    Ok(true)
}

#[tauri::command]
pub fn check_wake_word_detected(pipeline: State<'_, Mutex<VoicePipeline>>) -> Result<bool, String> {
    let pipe = pipeline.lock().map_err(|e| format!("lock error: {e}"))?;
    Ok(pipe.consume_wake_word_detected())
}

#[tauri::command]
pub fn toggle_tutor_mode(app: AppHandle) -> Result<bool, String> {
    let mut config = config::load_config(&app)?;
    config.overlay.tutor_mode = !config.overlay.tutor_mode;
    let new_state = config.overlay.tutor_mode;
    config::save_config(&app, &config)?;
    Ok(new_state)
}

#[tauri::command]
pub fn set_cursor_accent(app: AppHandle, color: String) -> Result<(), String> {
    let mut config = config::load_config(&app)?;
    config.overlay.cursor_accent = color;
    config::save_config(&app, &config)?;
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
    if let Some(voice_info) = crate::audio::get_voice_by_id(&voice_id) {
        config.audio.tts_provider = voice_info.provider;
    }
    if let Some(ac) = accent_color.clone() {
        config.overlay.cursor_accent = ac;
    }
    config::save_config(&app, &config)?;
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
        serde_json::json!({ "id": "system", "name": "System (Offline)", "tier": "free", "requires_key": false }),
    ]
}

// --- Accent Color Commands ---

#[tauri::command]
pub fn set_accent_preset(app: AppHandle, color: String) -> Result<String, String> {
    let mut config = config::load_config(&app)?;
    config.overlay.cursor_accent = color.clone();
    config::save_config(&app, &config)?;
    let _ = app.emit("accent-changed", color.clone());
    Ok(color)
}

#[tauri::command]
pub fn get_accent_presets(app: AppHandle) -> Result<Vec<String>, String> {
    let config = config::load_config(&app)?;
    Ok(config.overlay.accent_presets)
}

#[tauri::command]
pub fn push_accent_preset(app: AppHandle, color: String) -> Result<Vec<String>, String> {
    let mut config = config::load_config(&app)?;
    if !config.overlay.accent_presets.contains(&color) {
        config.overlay.accent_presets.push(color.clone());
    }
    config.overlay.cursor_accent = color;
    config::save_config(&app, &config)?;
    let _ = app.emit("accent-changed", config.overlay.cursor_accent.clone());
    Ok(config.overlay.accent_presets)
}
