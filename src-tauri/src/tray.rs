use tauri::{
    AppHandle, Runtime,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    menu::{MenuBuilder, MenuItemBuilder},
    Manager,
};

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    log::info!("Setting up system tray");
    let quick_ask = MenuItemBuilder::with_id("quick_ask", "Quick Ask").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&quick_ask)
        .item(&settings)
        .separator()
        .item(&quit)
        .build()?;

    let tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().ok_or("no default window icon")?.clone())
        .tooltip("ClickyX")
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "quick_ask" => {
                log::info!("Tray menu: Quick Ask selected");
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "settings" => {
                log::info!("Tray menu: Settings selected");
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.eval("window.__setActiveTab && window.__setActiveTab('settings')");
                }
            }
            "quit" => {
                log::info!("Tray menu: Quit selected");
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        log::info!("Tray icon: hiding panel");
                        let _ = window.hide();
                    } else {
                        log::info!("Tray icon: showing panel");
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;
    app.manage(tray);

    log::info!("System tray initialized successfully");
    Ok(())
}
