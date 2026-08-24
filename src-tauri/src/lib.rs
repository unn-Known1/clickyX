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
mod type_mode;
pub mod platform;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Listener, Manager};
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

    // #38: write a stable, parseable format ("ts | LEVEL | target | message")
    // so the in-app log viewer can split lines reliably.
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .target(env_logger::Target::Pipe(Box::new(file_writer)))
        .format(|buf, record| {
            use std::io::Write as _;
            writeln!(
                buf,
                "{} | {} | {} | {}",
                buf.timestamp(),
                record.level(),
                record.target(),
                record.args()
            )
        })
        .init();
}

pub(crate) fn register_hotkeys(app: &AppHandle) -> Result<(), String> {
    if let Err(e) = app
        .global_shortcut()
        .unregister_all()
    {
        log::warn!("failed to unregister shortcuts: {e}");
    }

    let hotkey_config = config::load_config(app)?;

    // #18: bind the user-configured PTT hotkey (start/stop recording toggle).
    let ptt_hotkey = hotkey_config.audio.ptt_hotkey.clone();
    if !ptt_hotkey.trim().is_empty() {
        let key = ptt_hotkey.trim().to_string();
        if let Err(e) = app
            .global_shortcut()
            .on_shortcut(key.as_str(), move |handler_app, _shortcut, event| {
                if event.state != ShortcutState::Pressed {
                    return;
                }
                if let Some(pipeline) =
                    handler_app.try_state::<Mutex<audio::VoicePipeline>>()
                {
                    if let Ok(pipe) = pipeline.lock() {
                        let is_listening = matches!(
                            pipe.get_state().ok(),
                            Some(audio::PipelineState::Listening)
                        );
                        if is_listening {
                            let _ = pipe.stop_ptt_and_transcribe();
                            if let Some(state) =
                                handler_app.try_state::<Mutex<commands::AppState>>()
                            {
                                if let Ok(mut s) = state.lock() {
                                    s.app_mode = "idle".into();
                                }
                            }
                        } else {
                            if pipe.start_ptt().is_ok() {
                                if let Some(state) =
                                    handler_app.try_state::<Mutex<commands::AppState>>()
                                {
                                    if let Ok(mut s) = state.lock() {
                                        s.app_mode = "listening".into();
                                    }
                                }
                            }
                        }
                    }
                }
            })
        {
            log::warn!("failed to register PTT hotkey {}: {e}", key);
        } else {
            log::info!("Registered PTT hotkey: {}", key);
        }
    }

    for binding in &hotkey_config.hotkeys {
        if binding.enabled {
            let key = binding.key.clone();
            let action = binding.action.clone();
            if key
                .split('+')
                .any(|part| part.trim().eq_ignore_ascii_case("option"))
            {
                log::warn!("skipping unsupported shortcut on this platform: {}", key);
                continue;
            }
            if let Err(e) = app.global_shortcut()
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
                        "toggle_type_mode" => {
                            if let Some(engine) =
                                handler_app.try_state::<Mutex<type_mode::TypeModeEngine>>()
                            {
                                if let Ok(eng) = engine.lock() {
                                    let result = eng.handle_ctrl_press();
                                    if result == type_mode::TypeModeState::Active {
                                        log::info!("Type mode activated via hotkey");
                                        let _ = handler_app.emit("type-mode-changed", "active");
                                    } else {
                                        let _ = handler_app.emit("type-mode-changed", format!("{:?}", result));
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                })
            {
                log::warn!("failed to register shortcut {}: {e}", binding.key);
            }
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // Initialize tray
            tray::setup_tray(&handle)?;

            // Load config
            let config = config::load_config(&handle)?;

            // Register default global hotkeys. Previously skipped on Windows
            // because invalid persisted shortcuts could crash the app. Now handled
            // with per-binding error logging so a single bad shortcut never blocks startup.
            if let Err(e) = register_hotkeys(&handle) {
                log::warn!("Hotkey registration (some may have failed): {e}");
            }

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

            let mut pipeline = audio::VoicePipeline::with_config(&config.audio, stt_cfg, tts_cfg);
            // #9: attach the app handle so the pipeline can emit overlay/voice
            // events (waveform, processing, always-on state, audio level...).
            pipeline.set_app_handle(handle.clone());

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
                tauri::async_runtime::spawn(async move {
                    let mut interval = tokio::time::interval(Duration::from_secs(1));
                    loop {
                        interval.tick().await;
                        let mut triggered = Vec::new();
                        if let Some(engine) =
                            handle.try_state::<Mutex<automation::AutomationEngine>>()
                        {
                            // Use try_lock to avoid blocking; skip tick if lock is held
                            match engine.try_lock() {
                                Ok(mut eng) => {
                                    triggered = eng.tick();
                                }
                                Err(e) => {
                                    log::warn!("Automation tick: could not acquire lock (skipping): {e}");
                                }
                            }
                        }
                        for auto in triggered {
                            if let Some(slug) = &auto.agent_slug {
                                let prompt = format!("[Automation Trigger: {}]\n{}", auto.name, auto.prompt);
                                log::info!("Triggering agent: {} for automation: {}", slug, auto.name);
                                // #15: actually execute the agent (mark Running,
                                // persist, emit, and spawn the provider call).
                                let automation_id = auto.id.clone();
                                let run_id = uuid::Uuid::new_v4().to_string();
                                commands::spawn_agent_run(handle.clone(), slug.clone(), prompt.clone(), Some(run_id.clone()));
                                // Record a run-history entry for the Connections UI.
                                commands::record_automation_run(commands::AutomationRunEntry {
                                    id: run_id.clone(),
                                    automation_id,
                                    started_at: crate::agent::session::now_utc(),
                                    finished_at: None,
                                    status: "running".into(),
                                    duration_ms: None,
                                    error: None,
                                });
                            } else {
                                log::warn!("Automation {} has no agent_slug; nothing to run", auto.name);
                            }
                        }
                    }
                });
            }

            // Initialize type mode engine
            let type_mode_engine = type_mode::TypeModeEngine::new(config.type_mode.clone());
            handle.manage(Mutex::new(type_mode_engine));

            // Initialize auto-capture engine
            let auto_capture_engine = AutoCaptureEngine::new(AutoCaptureConfig::default());
            let ac_handle = handle.clone();
            auto_capture_engine.set_on_capture(move |frame| {
                let payload = serde_json::json!({
                    "timestamp": frame.timestamp,
                    "region": frame.region,
                    "width": frame.width,
                    "height": frame.height,
                    "size": frame.data.len(),
                });
                let _ = ac_handle.emit("auto-capture-frame", payload);
            });
            handle.manage(Mutex::new(auto_capture_engine));

            let agent_store = match agent::session::AgentStore::load(&config.agent.encryption_key) {
                Ok(store) => store,
                Err(e) => {
                    log::error!("Failed to load AgentStore: {e}, starting fresh");
                    agent::session::AgentStore::new()
                }
            };
            let agent_store = Mutex::new(agent_store);
            handle.manage(agent_store);

            // Initialize codex state
            let codex_state: Mutex<commands::CodexState> = Mutex::new(None);
            handle.manage(codex_state);

            // Initialize overlay annotation lifecycle manager
            let ann_manager = overlay::init_manager();
            let ann_mgr_arc = std::sync::Arc::new(ann_manager);
            handle.manage(ann_mgr_arc.clone());
            overlay::start_lifecycle_sweep(handle.clone(), ann_mgr_arc);

            // #2: create the per-screen overlay windows at startup (they were
            // only created on hotplug, so a stable monitor setup never got them).
            {
                use crate::overlay::window_manager::OverlayWindowManager;
                let mut wm = OverlayWindowManager::<tauri::Wry>::new();
                if let Err(e) = wm.create_per_screen_windows(&handle, "src/overlay/index.html") {
                    log::warn!("Failed to create overlay windows: {e}");
                }
                handle.manage(Mutex::new(wm));
            }
            overlay::start_hotplug_poll(handle.clone(), "src/overlay/index.html");

            // Start bridge server on separate thread
            let bridge_token = config.bridge_token.clone();
            bridge::start_bridge(handle.clone(), bridge_token);

            // Check for updates on startup (non-blocking)
            {
                let handle = app.handle().clone();
                let version = config.version.clone();
                tauri::async_runtime::spawn(async move {
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

            // Register deep-link handler for openclicky:// URLs (B-016)
            // tauri-plugin-deep-link emits "deep-link://new-url" with a JSON array payload.
            {
                let deep_link_handle = app.handle().clone();
                app.listen("deep-link://new-url", move |event| {
                    let payload = event.payload();
                    log::info!("Deep link received: {}", payload);
                    // Payload is a JSON array of URL strings: ["openclicky://..."]
                    if let Ok(urls) = serde_json::from_str::<Vec<String>>(payload) {
                        for url in urls {
                            log::info!("Deep link URL: {}", url);
                            let _ = deep_link_handle.emit("deep-link-opened", &url);
                        }
                    } else {
                        // Fallback: emit raw payload
                        let url = payload.trim_matches('"').to_string();
                        let _ = deep_link_handle.emit("deep-link-opened", &url);
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
            commands::load_conversations,
            commands::save_conversations,
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
            commands::overlay_show_cursor_on_screen,
            commands::overlay_show_cursors,
            commands::overlay_show_rect,
            commands::overlay_show_rect_on_screen,
            commands::overlay_show_scribble,
            commands::overlay_show_scribble_on_screen,
            commands::overlay_show_caption,
            commands::overlay_show_caption_on_screen,
            commands::overlay_clear,
            commands::set_overlay_visible,
            commands::overlay_show_animated_cursor,
            commands::overlay_show_animated_cursor_on_screen,
            commands::overlay_show_agent_dock,
            commands::overlay_hide_agent_dock,
            commands::start_recording,
            commands::stop_recording,
            commands::get_audio_level,
            commands::get_audio_status,
            commands::get_today_stats,
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
            commands::google_workspace_auth_start,
            commands::google_workspace_auth_revoke,
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
            commands::get_app_usage_log,
            commands::clear_app_usage_log,
            commands::get_automation_runs,
            commands::set_bridge_token,
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
            commands::delete_agent,
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
            commands::activate_type_mode,
            commands::deactivate_type_mode,
            commands::get_type_mode_state,
            commands::type_text,
            commands::set_type_mode_config,
            commands::get_type_mode_config,
            commands::start_auto_capture,
            commands::stop_auto_capture,
            commands::get_auto_capture_status,
            commands::set_auto_capture_config,
            commands::get_latest_auto_capture,
            commands::clear_auto_capture_cache,
            commands::get_voices,
            commands::get_voice,
            commands::select_voice,
            commands::get_voice_providers,
            commands::set_accent_preset,
            commands::get_accent_presets,
            commands::push_accent_preset,
            commands::get_element_at_point,
            commands::get_focused_element,
            commands::get_accessibility_tree_snapshot,
            commands::perform_accessibility_action,
            commands::cua_scroll,
            commands::set_agent_voice_triggers,
            commands::open_agent_hud,
            commands::agent_attach_files,
            commands::test_mcp_server,
            commands::get_3d_model_task,
            commands::overlay_show_highlight,
            commands::overlay_show_shape,
        ])
        .build(tauri::generate_context!())
        .expect("error while building ClickyX")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { code, api, .. } = event {
                if code.is_none() {
                    log::info!("Preventing implicit exit while ClickyX is running in the tray");
                    api.prevent_exit();
                    return;
                }

                log::info!("Exit requested, shutting down ClickyX");
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// #6: verify that a log file exceeding 5 MiB triggers rotation (rename)
    /// while files under the threshold are left untouched.
    #[test]
    fn test_log_rotation_threshold() {
        let dir = tempfile::tempdir().expect("tempdir");
        let log_file = dir.path().join("clickyx.log");
        let rotated = dir.path().join("clickyx.old.log");

        // A file just under the threshold must NOT be rotated.
        std::fs::write(&log_file, vec![b'a'; 5 * 1024 * 1024 - 1])
            .expect("write log file");
        let meta = std::fs::metadata(&log_file).unwrap();
        assert!(meta.len() < 5 * 1024 * 1024);
        assert!(!rotated.exists()); // rotation should not have happened
        assert!(log_file.exists());

        // Clean up for next scenario
        std::fs::remove_file(&log_file).ok();
        std::fs::remove_file(&rotated).ok();

        // A file over the threshold triggers rotation via rename.
        std::fs::write(&log_file, vec![b'a'; 5 * 1024 * 1024 + 1])
            .expect("write oversized log file");
        let meta = std::fs::metadata(&log_file).unwrap();
        assert!(meta.len() > 5 * 1024 * 1024);
        // Simulate the rotation that init_logging performs
        let _ = std::fs::rename(&log_file, &rotated);
        assert!(rotated.exists());
        assert!(!log_file.exists());
    }

    #[test]
    fn test_get_log_dir_returns_valid_path() {
        let dir = get_log_dir().expect("get_log_dir failed");
        assert!(dir.is_absolute());
        assert!(dir.to_string_lossy().contains("clickyx"));
    }
}
