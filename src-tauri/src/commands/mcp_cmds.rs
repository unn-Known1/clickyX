//! mcp_cmds: Tauri command handlers (split from commands.rs in P3).
//!
//! Re-exported through `crate::commands`; `commands::foo` paths keep working.

use tauri::AppHandle;

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

#[tauri::command]
pub fn test_mcp_server(server_id: String, app: AppHandle) -> Result<bool, String> {
    let config = crate::config::load_config(&app)?;
    let server = config
        .mcp_servers
        .iter()
        .find(|s| s.name == server_id || s.command == server_id)
        .ok_or_else(|| format!("MCP server '{}' not found", server_id))?;
    if server.command.is_empty() {
        return Err("MCP server has no command configured".into());
    }
    // Quick validation: try spawning the command with --help or similar
    // to confirm it is executable. We don't need a full JSON-RPC handshake here.
    let output = std::process::Command::new(&server.command)
        .args(&server.args)
        .envs(&server.env)
        .arg("--help")
        .output();
    match output {
        Ok(out) => {
            // Exit code 0 or 1 (help printed) are acceptable
            if out.status.success() || out.status.code() == Some(1) {
                log::info!("MCP server '{}' validation passed", server.name);
                Ok(true)
            } else {
                let stderr = String::from_utf8_lossy(&out.stderr);
                log::warn!("MCP server '{}' validation failed: {}", server.name, stderr);
                Err(format!(
                    "Server exited with code {}: {}",
                    out.status,
                    stderr.trim()
                ))
            }
        }
        Err(e) => Err(format!("Failed to spawn '{}': {}", server.command, e)),
    }
}
