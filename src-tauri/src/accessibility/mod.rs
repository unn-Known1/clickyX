pub mod windows;
pub mod linux;
pub mod macos;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessibilityElement {
    pub role: String,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub enabled: bool,
    pub focused: bool,
    pub visible: bool,
    pub children: Vec<AccessibilityElement>,
    pub pid: Option<u32>,
    pub description: Option<String>,
    pub value: Option<String>,
    pub help_text: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AccessibilityTree {
    pub root: AccessibilityElement,
    pub focused_element: Option<AccessibilityElement>,
    pub timestamp: u64,
}

pub trait AccessibilityApi: Send {
    fn get_element_at_point(&self, x: i32, y: i32) -> Result<AccessibilityElement, String>;
    fn get_focused_element(&self) -> Result<Option<AccessibilityElement>, String>;
    fn get_root_element(&self) -> Result<AccessibilityElement, String>;
    fn get_children(&self, element: &AccessibilityElement) -> Result<Vec<AccessibilityElement>, String>;
    fn get_ancestors(&self, element: &AccessibilityElement) -> Result<Vec<AccessibilityElement>, String>;
    fn get_all_elements_matching(&self, role: &str, name: &str) -> Result<Vec<AccessibilityElement>, String>;
    fn snapshot(&self) -> Result<AccessibilityTree, String>;
    fn perform_action(&self, element: &AccessibilityElement, action: &str) -> Result<(), String>;
}

impl AccessibilityElement {
    pub fn stub(role: &str, name: &str) -> Self {
        Self {
            role: format!("stub_{}", role),
            name: name.to_string(),
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            enabled: true,
            focused: false,
            visible: true,
            children: Vec::new(),
            pid: None,
            description: None,
            value: None,
            help_text: None,
        }
    }
}

pub fn create_accessibility_api() -> Box<dyn AccessibilityApi> {
    #[cfg(target_os = "windows")]
    {
        Box::new(windows::WindowsAccessibility::new())
    }
    #[cfg(target_os = "linux")]
    {
        Box::new(linux::LinuxAccessibility::new())
    }
    #[cfg(target_os = "macos")]
    {
        Box::new(macos::MacAccessibility::new())
    }
}
