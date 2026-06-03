use super::{AccessibilityElement, AccessibilityTree, AccessibilityApi};

pub struct WindowsAccessibility;

impl WindowsAccessibility {
    pub fn new() -> Self {
        log::info!("WindowsAccessibility: using stub (no windows/UIA crate in dependency tree)");
        Self
    }
}

impl AccessibilityApi for WindowsAccessibility {
    fn get_element_at_point(&self, x: i32, y: i32) -> Result<AccessibilityElement, String> {
        log::info!("WindowsAccessibility::get_element_at_point({}, {}) — stub", x, y);
        Ok(AccessibilityElement::stub("pane", "desktop"))
    }

    fn get_focused_element(&self) -> Result<Option<AccessibilityElement>, String> {
        log::info!("WindowsAccessibility::get_focused_element — stub");
        Ok(Some(AccessibilityElement::stub("window", "focused_window")))
    }

    fn get_root_element(&self) -> Result<AccessibilityElement, String> {
        log::info!("WindowsAccessibility::get_root_element — stub");
        Ok(AccessibilityElement::stub("desktop", "root"))
    }

    fn get_children(&self, element: &AccessibilityElement) -> Result<Vec<AccessibilityElement>, String> {
        log::info!("WindowsAccessibility::get_children — stub for {:?}", element.role);
        Ok(Vec::new())
    }

    fn get_ancestors(&self, element: &AccessibilityElement) -> Result<Vec<AccessibilityElement>, String> {
        log::info!("WindowsAccessibility::get_ancestors — stub for {:?}", element.role);
        Ok(vec![AccessibilityElement::stub("window", "parent")])
    }

    fn get_all_elements_matching(&self, role: &str, name: &str) -> Result<Vec<AccessibilityElement>, String> {
        log::info!("WindowsAccessibility::get_all_elements_matching(role={}, name={}) — stub", role, name);
        Ok(Vec::new())
    }

    fn snapshot(&self) -> Result<AccessibilityTree, String> {
        log::info!("WindowsAccessibility::snapshot — stub");
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        Ok(AccessibilityTree {
            root: AccessibilityElement::stub("desktop", "root"),
            focused_element: Some(AccessibilityElement::stub("window", "focused_window")),
            timestamp: now,
        })
    }

    fn perform_action(&self, element: &AccessibilityElement, action: &str) -> Result<(), String> {
        log::info!("WindowsAccessibility::perform_action(action={}) — stub on {:?}", action, element.role);
        Ok(())
    }
}
