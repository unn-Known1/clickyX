use std::collections::HashMap;

use super::lifecycle::{now_ms, Annotation, AnnotationKind, AnnotationState};

pub struct AnnotationManager {
    cursors: HashMap<String, Annotation<super::CursorData>>,
    rectangles: HashMap<String, Annotation<super::RectPayload>>,
    scribbles: HashMap<String, Annotation<super::ScribblePayload>>,
    captions: HashMap<String, Annotation<super::CaptionPayload>>,
    kind_order: Vec<String>,
    timeouts: TimeoutConfig,
}

#[derive(Clone)]
pub struct TimeoutConfig {
    pub cursor_ms: u64,
    pub rect_ms: u64,
    pub scribble_ms: u64,
    pub caption_ms: u64,
}

impl Default for TimeoutConfig {
    fn default() -> Self {
        Self {
            cursor_ms: 5000,
            rect_ms: 8000,
            scribble_ms: 10000,
            caption_ms: 3000,
        }
    }
}

impl AnnotationManager {
    pub fn new() -> Self {
        Self {
            cursors: HashMap::new(),
            rectangles: HashMap::new(),
            scribbles: HashMap::new(),
            captions: HashMap::new(),
            kind_order: Vec::new(),
            timeouts: TimeoutConfig::default(),
        }
    }

    pub fn add_cursor(&mut self, id: String, data: super::CursorData) {
        self.force_complete_kind(&AnnotationKind::Cursor);
        let timeout = if data.duration_ms > 0 { data.duration_ms } else { self.timeouts.cursor_ms };
        let ann = Annotation::new(id.clone(), AnnotationKind::Cursor, timeout, data);
        self.cursors.insert(id.clone(), ann);
        self.kind_order.push(id);
    }

    pub fn add_rect(&mut self, id: String, data: super::RectPayload) {
        self.force_complete_kind(&AnnotationKind::Rect);
        let ann = Annotation::new(id.clone(), AnnotationKind::Rect, self.timeouts.rect_ms, data);
        self.rectangles.insert(id.clone(), ann);
        self.kind_order.push(id);
    }

    pub fn add_scribble(&mut self, id: String, data: super::ScribblePayload) {
        self.force_complete_kind(&AnnotationKind::Scribble);
        let ann = Annotation::new(id.clone(), AnnotationKind::Scribble, self.timeouts.scribble_ms, data);
        self.scribbles.insert(id.clone(), ann);
        self.kind_order.push(id);
    }

    pub fn add_caption(&mut self, id: String, data: super::CaptionPayload) {
        self.force_complete_kind(&AnnotationKind::Caption);
        let ann = Annotation::new(id.clone(), AnnotationKind::Caption, self.timeouts.caption_ms, data);
        self.captions.insert(id.clone(), ann);
        self.kind_order.push(id);
    }

    pub fn complete(&mut self, id: &str) {
        if let Some(ann) = self.cursors.get_mut(id) {
            ann.state = AnnotationState::Completed;
        } else if let Some(ann) = self.rectangles.get_mut(id) {
            ann.state = AnnotationState::Completed;
        } else if let Some(ann) = self.scribbles.get_mut(id) {
            ann.state = AnnotationState::Completed;
        } else if let Some(ann) = self.captions.get_mut(id) {
            ann.state = AnnotationState::Completed;
        }
    }

    pub fn miss(&mut self, id: &str) {
        if let Some(ann) = self.cursors.get_mut(id) {
            ann.state = AnnotationState::Missed;
        } else if let Some(ann) = self.rectangles.get_mut(id) {
            ann.state = AnnotationState::Missed;
        } else if let Some(ann) = self.scribbles.get_mut(id) {
            ann.state = AnnotationState::Missed;
        } else if let Some(ann) = self.captions.get_mut(id) {
            ann.state = AnnotationState::Missed;
        }
    }

    pub fn get_expired(&self) -> Vec<String> {
        let now = now_ms();
        let mut expired = Vec::new();
        for id in &self.kind_order {
            let is_expired = self.cursors.get(id).map_or(false, |a| a.is_expired(now))
                || self.rectangles.get(id).map_or(false, |a| a.is_expired(now))
                || self.scribbles.get(id).map_or(false, |a| a.is_expired(now))
                || self.captions.get(id).map_or(false, |a| a.is_expired(now));
            if is_expired {
                expired.push(id.clone());
            }
        }
        expired
    }

    pub fn clear_all(&mut self) {
        for id in self.kind_order.clone() {
            self.miss(&id);
        }
        self.cursors.clear();
        self.rectangles.clear();
        self.scribbles.clear();
        self.captions.clear();
        self.kind_order.clear();
    }

    fn force_complete_kind(&mut self, kind: &AnnotationKind) {
        let to_complete: Vec<String> = match kind {
            AnnotationKind::Cursor => self.cursors.keys().cloned().collect(),
            AnnotationKind::Rect => self.rectangles.keys().cloned().collect(),
            AnnotationKind::Scribble => self.scribbles.keys().cloned().collect(),
            AnnotationKind::Caption => self.captions.keys().cloned().collect(),
        };
        for id in to_complete {
            self.complete(&id);
        }
    }

    pub fn has_active(&self) -> bool {
        !self.cursors.is_empty()
            || !self.rectangles.is_empty()
            || !self.scribbles.is_empty()
            || !self.captions.is_empty()
    }
}

pub fn format_lifecycle_event(action: &str, id: &str, state: &AnnotationState) -> String {
    serde_json::json!({
        "action": action,
        "id": id,
        "state": state,
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::overlay::{CursorData, RectPayload, ScribblePayload, CaptionPayload};

    #[test]
    fn test_manager_new_is_empty() {
        let mgr = AnnotationManager::new();
        assert!(!mgr.has_active());
        assert!(mgr.get_expired().is_empty());
    }

    #[test]
    fn test_add_and_complete_cursor() {
        let mut mgr = AnnotationManager::new();
        let data = CursorData { x: 100.0, y: 200.0, label: None, accent: None, duration_ms: 5000 };
        mgr.add_cursor("c1".into(), data);
        assert!(mgr.has_active());
        mgr.complete("c1");
        assert!(mgr.get_expired().is_empty());
    }

    #[test]
    fn test_add_and_miss() {
        let mut mgr = AnnotationManager::new();
        let data = CursorData { x: 10.0, y: 20.0, label: None, accent: None, duration_ms: 5000 };
        mgr.add_cursor("c2".into(), data);
        mgr.miss("c2");
    }

    #[test]
    fn test_sweep_expired() {
        let mut mgr = AnnotationManager::new();
        let data = CursorData { x: 0.0, y: 0.0, label: None, accent: None, duration_ms: 0 };
        mgr.add_cursor("c3".into(), data);
        let expired = mgr.get_expired();
        assert!(!expired.is_empty());
        assert_eq!(expired[0], "c3");
    }

    #[test]
    fn test_clear_all() {
        let mut mgr = AnnotationManager::new();
        let cd = CursorData { x: 1.0, y: 2.0, label: None, accent: None, duration_ms: 5000 };
        let rd = RectPayload { id: "r".into(), x: 0.0, y: 0.0, w: 10.0, h: 10.0, state: AnnotationState::Armed, label: None };
        mgr.add_cursor("c".into(), cd);
        mgr.add_rect("r".into(), rd);
        assert!(mgr.has_active());
        mgr.clear_all();
        assert!(!mgr.has_active());
    }

    #[test]
    fn test_add_all_kinds() {
        let mut mgr = AnnotationManager::new();
        let cd = CursorData { x: 0.0, y: 0.0, label: None, accent: None, duration_ms: 5000 };
        let rd = RectPayload { id: "r".into(), x: 0.0, y: 0.0, w: 10.0, h: 10.0, state: AnnotationState::Armed, label: None };
        let sd = ScribblePayload { points: vec![[0.0, 0.0]], state: AnnotationState::Armed, label: None };
        let capd = CaptionPayload { text: "hi".into(), x: 0.0, y: 0.0, state: AnnotationState::Armed };
        mgr.add_cursor("c".into(), cd);
        mgr.add_rect("r".into(), rd);
        mgr.add_scribble("s".into(), sd);
        mgr.add_caption("cap".into(), capd);
        assert!(mgr.has_active());
    }

    #[test]
    fn test_force_complete_kind() {
        let mut mgr = AnnotationManager::new();
        let cd1 = CursorData { x: 0.0, y: 0.0, label: None, accent: None, duration_ms: 5000 };
        let cd2 = CursorData { x: 1.0, y: 1.0, label: None, accent: None, duration_ms: 5000 };
        mgr.add_cursor("c1".into(), cd1);
        mgr.add_cursor("c2".into(), cd2);
        let rd = RectPayload { id: "r".into(), x: 0.0, y: 0.0, w: 10.0, h: 10.0, state: AnnotationState::Armed, label: None };
        mgr.add_rect("r".into(), rd);
        assert!(mgr.has_active());
    }

    #[test]
    fn test_format_lifecycle_event() {
        let s = format_lifecycle_event("test", "id-1", &AnnotationState::Completed);
        assert!(s.contains("completed") || s.contains("Completed"));
        assert!(s.contains("id-1"));
    }
}
