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

    pub fn create(&mut self, name: String, mut slug: String, skills: Vec<String>) -> AgentSession {
        let original_slug = slug.clone();
        let mut counter = 1;
        // Check all sessions (including archived) for slug uniqueness
        while self.sessions.contains_key(&slug) {
            slug = format!("{}-{}", original_slug, counter);
            counter += 1;
        }

        let session = AgentSession::new(name, slug.clone(), skills);
        self.sessions.insert(slug.clone(), session.clone());
        session
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

    pub fn load(encryption_key: &str) -> Result<Self, String> {
        let path = agents_file_path();
        if !path.exists() {
            return Ok(Self::new());
        }
        let data = std::fs::read(path).map_err(|e| format!("Failed to read agents file: {e}"))?;
        let decrypted = decrypt_data(&data, encryption_key)?;
        let store: Self = serde_json::from_str(&decrypted).map_err(|e| format!("Deserialization error: {e}"))?;
        Ok(store)
    }

    pub fn save(&self, encryption_key: &str) -> Result<(), String> {
        let json = serde_json::to_string(self).map_err(|e| format!("Serialization error: {e}"))?;
        let encrypted = encrypt_data(&json, encryption_key)?;
        let path = agents_file_path();
        let tmp_path = path.with_extension("enc.tmp");
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap_or_default();
        }
        // Write to temp file first, then atomically rename
        std::fs::write(&tmp_path, &encrypted).map_err(|e| format!("Failed to write temp agents file: {e}"))?;
        std::fs::rename(&tmp_path, &path).map_err(|e| format!("Failed to rename agents file: {e}"))?;
        Ok(())
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

fn agents_file_path() -> std::path::PathBuf {
    let base = dirs::config_dir().expect("could not find config directory");
    base.join("clickyx").join("agents.enc")
}

use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};

pub fn encrypt_data(data: &str, key_hex: &str) -> Result<Vec<u8>, String> {
    let key_bytes = hex::decode(key_hex).map_err(|e| format!("Invalid hex key: {e}"))?;
    if key_bytes.len() != 32 { return Err("Key must be 32 bytes".into()); }
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher.encrypt(&nonce, data.as_bytes()).map_err(|e| format!("Encryption error: {:?}", e))?;
    let mut result = nonce.to_vec();
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

pub fn decrypt_data(data: &[u8], key_hex: &str) -> Result<String, String> {
    if data.len() < 12 { return Err("Data too short".into()); }
    let key_bytes = hex::decode(key_hex).map_err(|e| format!("Invalid hex key: {e}"))?;
    if key_bytes.len() != 32 { return Err("Key must be 32 bytes".into()); }
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(&data[..12]);
    let plaintext = cipher.decrypt(nonce, &data[12..]).map_err(|e| format!("Decryption error: {:?}", e))?;
    String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8: {e}"))
}
