use super::{AccessibilityElement, AccessibilityTree, AccessibilityApi};

pub struct LinuxAccessibility;

impl LinuxAccessibility {
    pub fn new() -> Self {
        log::info!("LinuxAccessibility: using stub (no atspi/zbus/accesskit crate in dependency tree)");
        Self
    }
}

impl AccessibilityApi for LinuxAccessibility {
    fn get_element_at_point(&self, x: i32, y: i32) -> Result<AccessibilityElement, String> {
        log::info!("LinuxAccessibility::get_element_at_point({}, {}) — stub", x, y);
        Ok(AccessibilityElement::stub("panel", "desktop"))
    }

    fn get_focused_element(&self) -> Result<Option<AccessibilityElement>, String> {
        log::info!("LinuxAccessibility::get_focused_element — stub");
        Ok(Some(AccessibilityElement::stub("window", "focused_window")))
    }

    fn get_root_element(&self) -> Result<AccessibilityElement, String> {
        log::info!("LinuxAccessibility::get_root_element — stub");
        let mut root = AccessibilityElement::stub("application", "org.a11y.atspi.Registry");
        root.children.push(AccessibilityElement::stub("desktop", "desktop"));
        Ok(root)
    }

    fn get_children(&self, element: &AccessibilityElement) -> Result<Vec<AccessibilityElement>, String> {
        log::info!("LinuxAccessibility::get_children — stub for {:?}", element.role);
        Ok(vec![AccessibilityElement::stub("panel", "child")])
    }

    fn get_ancestors(&self, element: &AccessibilityElement) -> Result<Vec<AccessibilityElement>, String> {
        log::info!("LinuxAccessibility::get_ancestors — stub for {:?}", element.role);
        Ok(vec![AccessibilityElement::stub("application", "root")])
    }

    fn get_all_elements_matching(&self, role: &str, name: &str) -> Result<Vec<AccessibilityElement>, String> {
        log::info!("LinuxAccessibility::get_all_elements_matching(role={}, name={}) — stub", role, name);
        Ok(Vec::new())
    }

    fn snapshot(&self) -> Result<AccessibilityTree, String> {
        log::info!("LinuxAccessibility::snapshot — stub");
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        Ok(AccessibilityTree {
            root: AccessibilityElement::stub("application", "root"),
            focused_element: Some(AccessibilityElement::stub("window", "focused_window")),
            timestamp: now,
        })
    }

    fn perform_action(&self, element: &AccessibilityElement, action: &str) -> Result<(), String> {
        log::info!("LinuxAccessibility::perform_action(action={}) — stub on {:?}", action, element.role);
        Ok(())
    }
}
