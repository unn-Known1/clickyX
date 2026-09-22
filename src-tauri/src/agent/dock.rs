use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentDockItem {
    pub slug: String,
    pub name: String,
    pub status: String,
    pub caption: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentDockState {
    pub items: Vec<AgentDockItem>,
    pub position: String,
}
