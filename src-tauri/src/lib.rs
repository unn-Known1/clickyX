mod config;
mod tray;
mod bridge;
mod overlay;
mod commands;

use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

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
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // Initialize tray
            tray::setup_tray(&handle)?;

            // Load config
            let config = config::load_config(&handle)?;
            handle.manage(config);

            // Register default global hotkeys
            register_hotkeys(&handle)?;

            // Initialize app state
            let state = Mutex::new(commands::AppState::default());
            handle.manage(state);

            // Start bridge server on separate thread
            bridge::start_bridge(handle.clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::update_config,
            commands::toggle_panel,
            commands::get_panel_state,
            commands::get_app_state,
            commands::show_overlay,
            commands::hide_overlay,
        ])
        .build(tauri::generate_context!())
        .expect("error while building ClickyX")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                log::info!("Exit requested, shutting down ClickyX");
                // Save config before exit
                if let Some(config) = app_handle.try_state::<config::AppConfig>() {
                    let _ = config::save_config(app_handle, &config);
                }
                // Global shortcuts are cleaned up automatically by the plugin
            }
        });
}
