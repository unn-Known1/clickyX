#![allow(dead_code)]

mod agent;
mod audio;
mod config;
mod tray;
mod bridge;
mod bridge_auth;
mod overlay;
mod commands;
mod ai;
mod screen;
mod automation;
mod gen3d;
mod updater;
mod permissions;
mod cua;
mod accessibility;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::screen::auto_capture::{AutoCaptureConfig, AutoCaptureEngine};

pub fn get_log_dir() -> Result<PathBuf, String> {
    let base = dirs::config_dir().ok_or("could not find config directory")?;
    let dir = base.join("clickyx").join("logs");
    std::fs::create_dir_all(&dir).map_err(|e| format!("failed to create log dir: {e}"))?;
    Ok(dir)
}

fn init_logging() {
    let log_dir = match get_log_dir() {
        Ok(d) => d,
        Err(_) => {
            env_logger::init();
            return;
        }
    };

    let log_file = log_dir.join("clickyx.log");
    let rotated = log_dir.join("clickyx.old.log");
    if log_file.exists() {
        let metadata = std::fs::metadata(&log_file).ok();
        if metadata.map(|m| m.len() > 5 * 1024 * 1024).unwrap_or(false) {
            let _ = std::fs::rename(&log_file, &rotated);
        }
    }

    let file_writer = match std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
    {
        Ok(f) => f,
        Err(e) => {
            eprintln!("Warning: could not open log file: {e}");
            env_logger::init();
            return;
        }
    };

    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .target(env_logger::Target::Pipe(Box::new(file_writer)))
        .format_timestamp_secs()
        .init();
}

pub(crate) fn register_hotkeys(app: &AppHandle) -> Result<(), String> {
    let _ = app
        .global_shortcut()
        .unregister_all()
        .map_err(|e| format!("failed to unregister shortcuts: {e}"))?;

    let hotkey_config = config::load_config(app)?;

    for binding in &hotkey_config.hotkeys {
        if binding.enabled {
            let key = binding.key.clone();
            let action = binding.action.clone();
            app.global_shortcut()
                .on_shortcut(key.as_str(), move |handler_app, _shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    match action.as_str() {
                        "toggle_panel" => {
                            if let Some(window) = handler_app.get_webview_window("main") {
                                let visible = window.is_visible().unwrap_or(false);
                                if visible {
                                    window.hide().ok();
                                    if let Some(state) =
                                        handler_app.try_state::<Mutex<commands::AppState>>()
                                    {
                                        if let Ok(mut s) = state.lock() {
                                            s.panel_visible = false;
                                        }
                                    }
                                } else {
                                    window.show().ok();
                                    window.set_focus().ok();
                                    if let Some(state) =
                                        handler_app.try_state::<Mutex<commands::AppState>>()
                                    {
                                        if let Ok(mut s) = state.lock() {
                                            s.panel_visible = true;
                                        }
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                })
                .map_err(|e| format!("failed to register shortcut {}: {e}", binding.key))?;
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();

            // Initialize tray
            tray::setup_tray(&handle)?;

            // Load config
            let config = config::load_config(&handle)?;
            let managed_config = config.clone();
            handle.manage(managed_config);

            // Register default global hotkeys
            register_hotkeys(&handle)?;

            // Initialize app state
            let state = Mutex::new(commands::AppState::default());
            handle.manage(state);

            // Initialize voice pipeline
            let stt_provider = audio::SttProvider::from_name(&config.audio.stt_provider)
                .unwrap_or(audio::SttProvider::Deepgram);
            let tts_provider = audio::TtsProvider::from_name(&config.audio.tts_provider)
                .unwrap_or(audio::TtsProvider::ElevenLabs);

            let stt_api_key = config
                .api_keys
                .iter()
                .find(|k| k.provider == stt_provider.name())
                .map(|k| k.key.clone())
                .unwrap_or_default();

            let tts_api_key = config
                .api_keys
                .iter()
                .find(|k| k.provider == tts_provider.name())
                .map(|k| k.key.clone())
                .unwrap_or_default();

            let stt_cfg = audio::SttConfig {
                provider: stt_provider,
                api_key: stt_api_key,
                ..Default::default()
            };

            let tts_cfg = audio::TtsConfig {
                provider: tts_provider,
                api_key: tts_api_key,
                ..Default::default()
            };

            let pipeline = audio::VoicePipeline::with_config(&config.audio, stt_cfg, tts_cfg);

            // Start always-on voice mode if enabled
            if config.audio.activation_mode == "always_on" {
                let ao_handle = handle.clone();
                if pipeline.start_always_on().is_ok() {
                    let _ = pipeline.run_always_on_vad_loop(Box::new(move |text| {
                        let payload = serde_json::json!({
                            "type": "auto_transcript",
                            "text": text
                        });
                        let _ = ao_handle.emit("voice-transcript", payload);
                        log::info!("Always-on transcript: {}", text);
                    }));
                    log::info!("Voice pipeline: always-on mode started from setup");
                } else {
                    log::warn!("Voice pipeline: always-on mode failed to start");
                }
            }

            handle.manage(std::sync::Mutex::new(pipeline));

            // Initialize automation engine
            let automations_path = dirs::config_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("clickyx")
                .join(&config.automations_file);
            let automation_engine =
                automation::AutomationEngine::load(&automations_path).unwrap_or_default();
            handle.manage(Mutex::new(automation_engine));

            // Start automation background tick loop
            {
                let handle = app.handle().clone();
                tokio::spawn(async move {
                    let mut interval = tokio::time::interval(Duration::from_secs(1));
                    loop {
                        interval.tick().await;
                        if let Some(engine) =
                            handle.try_state::<Mutex<automation::AutomationEngine>>()
                        {
                            if let Ok(mut eng) = engine.lock() {
                                eng.tick();
                            }
                        }
                    }
                });
            }

            // Initialize auto-capture engine
            let auto_capture_engine = AutoCaptureEngine::new(AutoCaptureConfig::default());
            handle.manage(Mutex::new(auto_capture_engine));

            // Initialize agent state
            let agent_store = Mutex::new(agent::session::AgentStore::new());
            handle.manage(agent_store);

            // Initialize codex state
            let codex_state: Mutex<commands::CodexState> = Mutex::new(None);
            handle.manage(codex_state);

            // Initialize overlay annotation lifecycle manager
            let ann_manager = overlay::init_manager();
            let ann_mgr_arc = std::sync::Arc::new(ann_manager);
            handle.manage(ann_mgr_arc.clone());
            overlay::start_lifecycle_sweep(handle.clone(), ann_mgr_arc);
            overlay::start_hotplug_poll(handle.clone(), "overlay.html");

            // Start bridge server on separate thread
            let bridge_token = config.bridge_token.clone();
            bridge::start_bridge(handle.clone(), bridge_token);

            // Check for updates on startup (non-blocking)
            {
                let handle = app.handle().clone();
                let version = config.version.clone();
                tokio::spawn(async move {
                    match crate::updater::check_for_updates(&version).await {
                        Ok(info) if info.available => {
                            let ver = info.version.clone().unwrap_or_default();
                            log::info!("Update available: v{}", ver);
                            let _ = handle.emit("update-available", &info);
                        }
                        Ok(_) => log::info!("No updates available"),
                        Err(e) => log::warn!("Update check failed: {e}"),
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::update_config,
            commands::toggle_panel,
            commands::toggle_panel_pin,
            commands::get_panel_state,
            commands::get_app_state,
            commands::show_overlay,
            commands::hide_overlay,
            commands::send_chat_message,
            commands::send_chat_message_stream,
            commands::get_models,
            commands::get_ai_config,
            commands::update_ai_config,
            commands::chat_with_vision,
            commands::capture_screens,
            commands::capture_cursor_screen,
            commands::capture_focused_window,
            commands::overlay_show_cursor,
            commands::overlay_show_cursors,
            commands::overlay_show_rect,
            commands::overlay_show_scribble,
            commands::overlay_show_caption,
            commands::overlay_clear,
            commands::set_overlay_visible,
            commands::overlay_show_animated_cursor,
            commands::overlay_show_agent_dock,
            commands::overlay_hide_agent_dock,
            commands::start_recording,
            commands::stop_recording,
            commands::get_audio_level,
            commands::transcribe_audio,
            commands::speak_text,
            commands::set_ptt_hotkey,
            commands::get_audio_config,
            commands::update_audio_config,
            commands::set_wake_word_config,
            commands::get_wake_word_config,
            commands::start_wake_word_detection,
            commands::stop_wake_word_detection,
            commands::check_wake_word_detected,
            commands::check_google_workspace,
            commands::list_emails,
            commands::list_calendar_events,
            commands::list_automations,
            commands::create_automation,
            commands::update_automation,
            commands::delete_automation,
            commands::toggle_automation,
            commands::get_mcp_servers,
            commands::add_mcp_server,
            commands::update_mcp_server,
            commands::remove_mcp_server,
            commands::generate_3d_model,
            commands::check_permission,
            commands::request_permission,
            commands::check_for_updates,
            commands::install_update,
            commands::get_logs,
            commands::clear_logs,
            commands::export_config,
            commands::import_config,
            commands::reset_config,
            commands::get_app_version,
            commands::toggle_tutor_mode,
            commands::set_cursor_accent,
            commands::list_agents,
            commands::create_agent,
            commands::run_agent,
            commands::stop_agent,
            commands::archive_agent,
            commands::get_agent_status,
            commands::get_agent_transcript,
            commands::list_skills,
            commands::enable_skill,
            commands::disable_skill,
            commands::start_codex,
            commands::stop_codex,
            commands::get_codex_status,
            commands::get_agent_config,
            commands::update_agent_config,
            commands::start_always_on,
            commands::stop_always_on,
            commands::set_always_on_config,
            commands::get_always_on_config,
            commands::set_agent_triggers,
            commands::get_agent_triggers,
            commands::start_auto_capture,
            commands::stop_auto_capture,
            commands::get_auto_capture_status,
            commands::set_auto_capture_config,
            commands::get_element_at_point,
            commands::get_focused_element,
            commands::get_accessibility_tree_snapshot,
            commands::perform_accessibility_action,
        ])
        .build(tauri::generate_context!())
        .expect("error while building ClickyX")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                log::info!("Exit requested, shutting down ClickyX");
                if let Some(config) = app_handle.try_state::<config::AppConfig>() {
                    let _ = config::save_config(app_handle, &config);
                }
            }
        });
}
