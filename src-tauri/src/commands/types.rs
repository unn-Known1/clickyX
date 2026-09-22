//! types: Tauri command handlers (split from commands.rs in P3).
//!
//! Re-exported through `crate::commands`; `commands::foo` paths keep working.

use serde::{Deserialize, Serialize};

use crate::ai;
use crate::screen::auto_capture::{AutoCaptureConfig, CapturedFrame};

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
pub struct Conversation {
    pub id: String,
    pub title: String,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
    #[serde(rename = "updatedAt")]
    pub updated_at: u64,
    pub messages: Vec<ai::ChatMessage>,
}

// --- Auto-Capture Commands ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoCaptureStatus {
    pub running: bool,
    pub last_capture: Option<CapturedFrame>,
    pub config: AutoCaptureConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioLevelResponse {
    pub rms: f32,
    pub peak: f32,
    pub clipping: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioStatusResponse {
    pub listening: bool,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodayStatsResponse {
    pub agents_run: u32,
    pub voice_commands: u32,
    pub items_for_review: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
    pub target: String,
}

// ── App Usage Log + Automation Run History (#8) ──────────────────────────────
// These commands are invoked by the frontend but did not exist in Rust, so the
// App Usage Log and Automation run history always showed empty/error states.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUsageEntry {
    pub app: String,
    pub duration_secs: u64,
    pub last_seen: String,
    pub interaction_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationRunEntry {
    pub id: String,
    pub automation_id: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub status: String,
    pub duration_ms: Option<u64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeStatus {
    pub token_set: bool,
    pub auth_disabled: bool,
    pub dangerous_always_gated: bool,
}

/// Sentinel marking redacted secrets in an export. Importing a file that
/// still contains it is refused so a redacted export can never wipe keys.
pub const REDACTED_SENTINEL: &str = "__REDACTED__";
