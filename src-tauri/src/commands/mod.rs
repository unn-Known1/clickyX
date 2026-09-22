//! Tauri command handlers, split by domain (P3).
//! `commands::foo` paths are preserved via re-exports.

pub mod agent_cmds;
pub mod ai_cmds;
pub mod audio_cmds;
pub mod automation_cmds;
pub mod chat_cmds;
pub mod config_cmds;
pub mod cua_cmds;
pub mod mcp_cmds;
pub mod overlay_cmds;
pub mod panel_cmds;
pub mod screen_cmds;
pub mod system_cmds;
pub mod types;

pub use agent_cmds::*;
pub use ai_cmds::*;
pub use audio_cmds::*;
pub use automation_cmds::*;
pub use chat_cmds::*;
pub use config_cmds::*;
pub use cua_cmds::*;
pub use mcp_cmds::*;
pub use overlay_cmds::*;
pub use panel_cmds::*;
pub use screen_cmds::*;
pub use system_cmds::*;
pub use types::*;
