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

impl AgentDockState {
    pub fn new(position: String) -> Self {
        Self {
            items: vec![],
            position,
        }
    }

    pub fn add_item(&mut self, slug: String, name: String, status: String, caption: Option<String>) {
        if let Some(existing) = self.items.iter_mut().find(|i| i.slug == slug) {
            existing.status = status;
            existing.caption = caption;
        } else {
            self.items.push(AgentDockItem {
                slug,
                name,
                status,
                caption,
            });
        }
    }

    pub fn remove_item(&mut self, slug: &str) {
        self.items.retain(|i| i.slug != slug);
    }

    pub fn update_status(&mut self, slug: &str, status: String, caption: Option<String>) {
        if let Some(item) = self.items.iter_mut().find(|i| i.slug == slug) {
            item.status = status;
            if caption.is_some() {
                item.caption = caption;
            }
        }
    }
}
