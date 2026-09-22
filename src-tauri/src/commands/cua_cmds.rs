//! cua_cmds: Tauri command handlers (split from commands.rs in P3).
//!
//! Re-exported through `crate::commands`; `commands::foo` paths keep working.

// --- CUA Scroll Command (B-008) ---

#[tauri::command]
pub async fn cua_scroll(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
    delta_x: f64,
    delta_y: f64,
) -> Result<(), String> {
    let config = crate::config::load_config(&app).unwrap_or_default();
    let backend = if config.computer_use.native_cua {
        crate::cua::CuaBackend::Native
    } else {
        crate::cua::CuaBackend::Background
    };
    let mut sim = crate::cua::InputSimulator::new(backend);
    sim.scroll(x, y, delta_x, delta_y)
}
