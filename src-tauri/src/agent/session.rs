use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SessionState {
    Created,
    Running,
    Paused,
    Completed { result: String },
    Failed { error: String },
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSession {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub state: SessionState,
    pub skills: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub transcript: Vec<ChatMessage>,
}

impl AgentSession {
    pub fn new(name: String, slug: String, skills: Vec<String>) -> Self {
        let now = now_utc();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            slug,
            state: SessionState::Created,
            skills,
            created_at: now.clone(),
            updated_at: now,
            transcript: vec![],
        }
    }

    pub fn state_label(&self) -> String {
        match &self.state {
            SessionState::Created => "created".into(),
            SessionState::Running => "running".into(),
            SessionState::Paused => "paused".into(),
            SessionState::Completed { .. } => "done".into(),
            SessionState::Failed { .. } => "error".into(),
            SessionState::Archived => "archived".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStore {
    pub sessions: HashMap<String, AgentSession>,
}

impl AgentStore {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    pub fn create(&mut self, name: String, slug: String, skills: Vec<String>) -> AgentSession {
        let session = AgentSession::new(name, slug, skills);
        let slug = session.slug.clone();
        self.sessions.insert(slug.clone(), session);
        self.sessions.get(&slug).cloned().unwrap()
    }

    pub fn get(&self, slug: &str) -> Option<&AgentSession> {
        self.sessions.get(slug)
    }

    pub fn get_mut(&mut self, slug: &str) -> Option<&mut AgentSession> {
        self.sessions.get_mut(slug)
    }

    pub fn list(&self) -> Vec<AgentSession> {
        let mut sessions: Vec<AgentSession> = self.sessions.values().cloned().collect();
        sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        sessions
    }

    pub fn remove(&mut self, slug: &str) -> bool {
        self.sessions.remove(slug).is_some()
    }
}

fn now_utc() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    format!("{}", secs)
}
