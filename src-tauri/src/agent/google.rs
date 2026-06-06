use serde::{Deserialize, Serialize};

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
    pub email: Option<String>,
    pub scopes: Option<Vec<String>>,
}

pub struct GoogleWorkspace;

impl GoogleWorkspace {
    /// Google Workspace integration requires a dedicated OAuth2 setup.
    /// The feature is not yet available in this build.
    pub fn check_auth() -> Result<WorkspaceStatus, String> {
        Ok(WorkspaceStatus {
            available: false,
            authenticated: false,
            email: None,
            scopes: None,
        })
    }

    pub fn start_auth() -> Result<(), String> {
        Err(
            "Google Workspace integration is not yet configured. \
             To enable Google Workspace, you need to set up OAuth2 credentials. \
             See the documentation for setup instructions."
                .into(),
        )
    }

    pub fn revoke_auth() -> Result<(), String> {
        Ok(())
    }

    pub fn list_emails(_max_results: u32) -> Result<Vec<Email>, String> {
        Err("Google Workspace not connected".into())
    }

    pub fn list_calendar_events(_max_results: u32) -> Result<Vec<CalendarEvent>, String> {
        Err("Google Workspace not connected".into())
    }

    pub fn list_drive_files(_query: &str) -> Result<Vec<DriveFile>, String> {
        Err("Google Workspace not connected".into())
    }

    pub fn send_email(_to: &str, _subject: &str, _body: &str) -> Result<(), String> {
        Err("Google Workspace not connected".into())
    }

    pub fn create_document(_title: &str) -> Result<String, String> {
        Err("Google Workspace not connected".into())
    }
}
