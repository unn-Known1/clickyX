use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AnnotationState {
    Armed,
    Completed,
    Missed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AnnotationKind {
    Cursor,
    Rect,
    Scribble,
    Caption,
}

#[derive(Debug, Clone, Serialize)]
pub struct Annotation<T: Serialize + Clone> {
    pub id: String,
    pub kind: AnnotationKind,
    pub state: AnnotationState,
    pub created_at: u64,
    pub timeout_ms: u64,
    pub data: T,
}

impl<T: Serialize + Clone> Annotation<T> {
    pub fn new(id: String, kind: AnnotationKind, timeout_ms: u64, data: T) -> Self {
        let created_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        Self {
            id,
            kind,
            state: AnnotationState::Armed,
            created_at,
            timeout_ms,
            data,
        }
    }

    pub fn is_expired(&self, now_ms: u64) -> bool {
        self.state == AnnotationState::Armed
            && now_ms.saturating_sub(self.created_at) > self.timeout_ms
    }
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
