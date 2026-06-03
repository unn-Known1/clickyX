use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Email {
    pub id: String,
    pub from: String,
    pub subject: String,
    pub snippet: String,
    pub date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub id: String,
    pub summary: String,
    pub start: String,
    pub end: String,
    pub location: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveFile {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub modified_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceStatus {
    pub available: bool,
    pub authenticated: bool,
}

pub struct GoogleWorkspace {
    pub gogcli_path: String,
    pub credentials_path: PathBuf,
}

impl GoogleWorkspace {
    fn new(gogcli_path: String) -> Self {
        let credentials_path = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("clickyx")
            .join("google_credentials.json");
        Self {
            gogcli_path,
            credentials_path,
        }
    }

    pub fn check_available() -> bool {
        Command::new("gogcli")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    pub fn check_auth() -> Result<WorkspaceStatus, String> {
        let available = Self::check_available();
        if !available {
            return Ok(WorkspaceStatus {
                available: false,
                authenticated: false,
            });
        }
        let output = Command::new("gogcli")
            .arg("auth")
            .arg("check")
            .output()
            .map_err(|e| format!("gogcli auth check failed: {e}"))?;
        Ok(WorkspaceStatus {
            available: true,
            authenticated: output.status.success(),
        })
    }

    pub fn list_emails(max_results: u32) -> Result<Vec<Email>, String> {
        let output = Command::new("gogcli")
            .args(["gmail", "list", "--max-results", &max_results.to_string(), "--json"])
            .output()
            .map_err(|e| format!("gogcli gmail list failed: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("gogcli error: {stderr}"));
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        serde_json::from_str::<Vec<Email>>(&stdout)
            .map_err(|e| format!("failed to parse gogcli output: {e}"))
    }

    pub fn list_calendar_events(max_results: u32) -> Result<Vec<CalendarEvent>, String> {
        let output = Command::new("gogcli")
            .args([
                "calendar",
                "list",
                "--max-results",
                &max_results.to_string(),
                "--json",
            ])
            .output()
            .map_err(|e| format!("gogcli calendar list failed: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("gogcli error: {stderr}"));
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        serde_json::from_str::<Vec<CalendarEvent>>(&stdout)
            .map_err(|e| format!("failed to parse gogcli output: {e}"))
    }

    pub fn list_drive_files(query: &str) -> Result<Vec<DriveFile>, String> {
        let output = Command::new("gogcli")
            .args(["drive", "list", "--query", query, "--json"])
            .output()
            .map_err(|e| format!("gogcli drive list failed: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("gogcli error: {stderr}"));
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        serde_json::from_str::<Vec<DriveFile>>(&stdout)
            .map_err(|e| format!("failed to parse gogcli output: {e}"))
    }

    pub fn send_email(to: &str, subject: &str, body: &str) -> Result<(), String> {
        let output = Command::new("gogcli")
            .args(["gmail", "send", "--to", to, "--subject", subject, "--body", body])
            .output()
            .map_err(|e| format!("gogcli gmail send failed: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("gogcli error: {stderr}"));
        }
        Ok(())
    }

    pub fn create_document(title: &str) -> Result<String, String> {
        let output = Command::new("gogcli")
            .args(["docs", "create", "--title", title, "--json"])
            .output()
            .map_err(|e| format!("gogcli docs create failed: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("gogcli error: {stderr}"));
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let parsed: serde_json::Value = serde_json::from_str(&stdout)
            .map_err(|e| format!("failed to parse gogcli output: {e}"))?;
        parsed["id"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "no document id in response".into())
    }
}
