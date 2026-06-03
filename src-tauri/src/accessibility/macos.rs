use super::{AccessibilityElement, AccessibilityTree, AccessibilityApi};

pub struct MacAccessibility;

impl MacAccessibility {
    pub fn new() -> Self {
        log::info!("MacAccessibility: using stub (no accesskit/objc2 crate in dependency tree)");
        Self
    }
}

impl AccessibilityApi for MacAccessibility {
    fn get_element_at_point(&self, x: i32, y: i32) -> Result<AccessibilityElement, String> {
        log::info!("MacAccessibility::get_element_at_point({}, {}) — stub", x, y);
        Ok(AccessibilityElement::stub("AXWindow", "desktop"))
    }

    fn get_focused_element(&self) -> Result<Option<AccessibilityElement>, String> {
        log::info!("MacAccessibility::get_focused_element — stub");
        Ok(Some(AccessibilityElement::stub("AXWindow", "focused_window")))
    }

    fn get_root_element(&self) -> Result<AccessibilityElement, String> {
        log::info!("MacAccessibility::get_root_element — stub");
        let mut root = AccessibilityElement::stub("AXApplication", "SystemWide");
        root.children.push(AccessibilityElement::stub("AXWindow", "desktop"));
        Ok(root)
    }

    fn get_children(&self, element: &AccessibilityElement) -> Result<Vec<AccessibilityElement>, String> {
        log::info!("MacAccessibility::get_children — stub for {:?}", element.role);
        Ok(vec![AccessibilityElement::stub("AXGroup", "child")])
    }

    fn get_ancestors(&self, element: &AccessibilityElement) -> Result<Vec<AccessibilityElement>, String> {
        log::info!("MacAccessibility::get_ancestors — stub for {:?}", element.role);
        Ok(vec![AccessibilityElement::stub("AXApplication", "root")])
    }

    fn get_all_elements_matching(&self, role: &str, name: &str) -> Result<Vec<AccessibilityElement>, String> {
        log::info!("MacAccessibility::get_all_elements_matching(role={}, name={}) — stub", role, name);
        Ok(Vec::new())
    }

    fn snapshot(&self) -> Result<AccessibilityTree, String> {
        log::info!("MacAccessibility::snapshot — stub");
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        Ok(AccessibilityTree {
            root: AccessibilityElement::stub("AXApplication", "root"),
            focused_element: Some(AccessibilityElement::stub("AXWindow", "focused_window")),
            timestamp: now,
        })
    }

    fn perform_action(&self, element: &AccessibilityElement, action: &str) -> Result<(), String> {
        log::info!("MacAccessibility::perform_action(action={}) — stub on {:?}", action, element.role);
        Ok(())
    }
}
