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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_annotation_new() {
        let ann = Annotation::new("test-1".into(), AnnotationKind::Cursor, 5000, "data");
        assert_eq!(ann.id, "test-1");
        assert_eq!(ann.kind, AnnotationKind::Cursor);
        assert_eq!(ann.state, AnnotationState::Armed);
        assert_eq!(ann.timeout_ms, 5000);
        assert!(ann.created_at > 0);
    }

    #[test]
    fn test_annotation_is_expired() {
        let ann = Annotation::new("test-2".into(), AnnotationKind::Rect, 100, "data");
        assert!(!ann.is_expired(ann.created_at));
        assert!(ann.is_expired(ann.created_at + 200));
    }

    #[test]
    fn test_annotation_completed_not_expired() {
        let mut ann = Annotation::new("test-3".into(), AnnotationKind::Scribble, 100, "data");
        ann.state = AnnotationState::Completed;
        assert!(!ann.is_expired(ann.created_at + 9999));
    }

    #[test]
    fn test_annotation_missed_not_expired() {
        let mut ann = Annotation::new("test-4".into(), AnnotationKind::Caption, 100, "data");
        ann.state = AnnotationState::Missed;
        assert!(!ann.is_expired(ann.created_at + 9999));
    }

    #[test]
    fn test_now_ms_monotonic() {
        let a = now_ms();
        let b = now_ms();
        assert!(b >= a);
    }

    #[test]
    fn test_annotation_state_transitions() {
        let mut ann = Annotation::new("test-5".into(), AnnotationKind::Cursor, 5000, ());
        assert_eq!(ann.state, AnnotationState::Armed);
        ann.state = AnnotationState::Completed;
        assert_eq!(ann.state, AnnotationState::Completed);
        ann.state = AnnotationState::Missed;
        assert_eq!(ann.state, AnnotationState::Missed);
    }
}
