// macOS accessibility stub — functions are intentionally not all called yet;
// they form the complete osascript-based API surface for future use.
#![allow(dead_code)]

use super::{AccessibilityElement, AccessibilityTree, AccessibilityApi};
use std::process::Command;

pub struct MacAccessibility;

impl MacAccessibility {
    pub fn new() -> Self {
        Self
    }
}

/// Run an AppleScript one-liner via `osascript -e` and return trimmed stdout.
fn osascript(script: &str) -> Option<String> {
    let out = Command::new("osascript")
        .args(["-e", script])
        .output()
        .ok()?;
    if out.status.success() {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if s.is_empty() { None } else { Some(s) }
    } else {
        None
    }
}

/// Get the name of the frontmost application.
fn frontmost_app_name() -> Option<String> {
    osascript(
        "tell application \"System Events\" to return name of first application process whose frontmost is true",
    )
}

/// Get the title of the frontmost window.
fn frontmost_window_title() -> Option<String> {
    osascript(
        "tell application \"System Events\" to tell (first application process whose frontmost is true) to return name of front window",
    )
    .or_else(|| {
        // Fallback: use the app name as the title
        frontmost_app_name()
    })
}

/// Get the position and size of the frontmost window via AppleScript.
/// Returns (x, y, w, h) — uses System Events to query bounds.
fn frontmost_window_bounds() -> (i32, i32, u32, u32) {
    let script =
        "tell application \"System Events\" to tell (first application process whose frontmost is true) \
         to return position of front window";
    let pos = osascript(script)
        .unwrap_or_else(|| "0, 0".into());

    let script2 =
        "tell application \"System Events\" to tell (first application process whose frontmost is true) \
         to return size of front window";
    let sz = osascript(script2)
        .unwrap_or_else(|| "800, 600".into());

    let mut coords = pos.split(',').chain(sz.split(','));
    let x = coords.next().and_then(|s| s.trim().parse().ok()).unwrap_or(0);
    let y = coords.next().and_then(|s| s.trim().parse().ok()).unwrap_or(0);
    let w = coords.next().and_then(|s| s.trim().parse().ok()).unwrap_or(800u32);
    let h = coords.next().and_then(|s| s.trim().parse().ok()).unwrap_or(600u32);
    (x, y, w, h)
}

/// List all visible application names via System Events.
fn list_visible_apps() -> Vec<String> {
    let out = osascript(
        "tell application \"System Events\" to return name of every application process whose visible is true",
    );
    match out {
        Some(s) => s
            .split(',')
            .map(|a| a.trim().to_string())
            .filter(|a| !a.is_empty())
            .collect(),
        None => Vec::new(),
    }
}

/// Get mouse location via `cliclick` if available, otherwise return (0,0).
fn mouse_location() -> (i32, i32) {
    // Try cliclick -c first
    if let Ok(out) = Command::new("cliclick").arg("p:.").output() {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout);
            // cliclick outputs something like "100,200"
            let parts: Vec<&str> = s.trim().split(',').collect();
            if parts.len() == 2 {
                let x = parts[0].trim().parse().unwrap_or(0);
                let y = parts[1].trim().parse().unwrap_or(0);
                return (x, y);
            }
        }
    }
    (0, 0)
}

fn build_element_for_app(app_name: &str, focused: bool) -> AccessibilityElement {
    let (x, y, w, h) = if focused {
        frontmost_window_bounds()
    } else {
        (0, 0, 0u32, 0u32)
    };
    AccessibilityElement {
        role: "AXWindow".into(),
        name: app_name.to_string(),
        x,
        y,
        width: w,
        height: h,
        enabled: true,
        focused,
        visible: true,
        children: Vec::new(),
        pid: None,
        description: Some(format!("macOS application: {}", app_name)),
        value: None,
        help_text: None,
    }
}

impl AccessibilityApi for MacAccessibility {
    fn get_element_at_point(&self, x: i32, y: i32) -> Result<AccessibilityElement, String> {
        // Use System Events to find the window at the given coordinates.
        // We check each visible app's front window bounds.
        let apps = list_visible_apps();
        for app in &apps {
            let script = format!(
                "tell application \"System Events\" to tell application process \"{}\" \
                 to return {{name of front window, position of front window, size of front window}}",
                app
            );
            if let Some(info) = osascript(&script) {
                // Parse the tuple: "Window Title, x, y, w, h"
                let parts: Vec<&str> = info.split(',').collect();
                if parts.len() >= 5 {
                    let wx: i32 = parts[1].trim().parse().unwrap_or(0);
                    let wy: i32 = parts[2].trim().parse().unwrap_or(0);
                    let ww: u32 = parts[3].trim().parse().unwrap_or(0);
                    let wh: u32 = parts[4].trim().parse().unwrap_or(0);
                    if x >= wx && x < wx + ww as i32 && y >= wy && y < wy + wh as i32 {
                        return Ok(AccessibilityElement {
                            role: "AXWindow".into(),
                            name: parts[0].trim().to_string(),
                            x: wx,
                            y: wy,
                            width: ww,
                            height: wh,
                            enabled: true,
                            focused: false,
                            visible: true,
                            children: Vec::new(),
                            pid: None,
                            description: Some(app.clone()),
                            value: None,
                            help_text: None,
                        });
                    }
                }
            }
        }

        // Fallback: return the frontmost window element.
        let title = frontmost_window_title().unwrap_or_else(|| "Unknown".into());
        let (wx, wy, ww, wh) = frontmost_window_bounds();
        Ok(AccessibilityElement {
            role: "AXWindow".into(),
            name: title,
            x: wx,
            y: wy,
            width: ww,
            height: wh,
            enabled: true,
            focused: false,
            visible: true,
            children: Vec::new(),
            pid: None,
            description: Some(format!("element near ({}, {})", x, y)),
            value: None,
            help_text: None,
        })
    }

    fn get_focused_element(&self) -> Result<Option<AccessibilityElement>, String> {
        let app_name = match frontmost_app_name() {
            Some(name) => name,
            None => return Ok(None),
        };
        let title = frontmost_window_title().unwrap_or_else(|| app_name.clone());
        let (x, y, w, h) = frontmost_window_bounds();
        let (mx, my) = mouse_location();

        Ok(Some(AccessibilityElement {
            role: "AXWindow".into(),
            name: title,
            x,
            y,
            width: w,
            height: h,
            enabled: true,
            focused: true,
            visible: true,
            children: Vec::new(),
            pid: None,
            description: Some(format!("app: {} | mouse:({},{})", app_name, mx, my)),
            value: None,
            help_text: None,
        }))
    }

    fn get_root_element(&self) -> Result<AccessibilityElement, String> {
        let apps = list_visible_apps();
        let focused_app = frontmost_app_name().unwrap_or_default();

        let children: Vec<AccessibilityElement> = apps
            .iter()
            .take(16)
            .map(|app| build_element_for_app(app, app == &focused_app))
            .collect();

        Ok(AccessibilityElement {
            role: "AXApplication".into(),
            name: "SystemWide".into(),
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            enabled: true,
            focused: false,
            visible: true,
            children,
            pid: None,
            description: Some("macOS accessibility root (via osascript)".into()),
            value: None,
            help_text: None,
        })
    }

    fn get_children(&self, element: &AccessibilityElement) -> Result<Vec<AccessibilityElement>, String> {
        if !element.children.is_empty() {
            return Ok(element.children.clone());
        }

        if element.role == "AXApplication" || element.name == "SystemWide" {
            let apps = list_visible_apps();
            let focused_app = frontmost_app_name().unwrap_or_default();
            return Ok(apps
                .iter()
                .take(8)
                .map(|a| build_element_for_app(a, a == &focused_app))
                .collect());
        }

        // Try to get menu items for the current app
        let script = format!(
            "tell application \"System Events\" to return name of every menu item of menu bar 1 of \
             application process \"{}\"",
            element.name
        );
        if let Some(items) = osascript(&script) {
            let children: Vec<AccessibilityElement> = items
                .split(',')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .map(|menu_item| AccessibilityElement {
                    role: "AXMenuItem".into(),
                    name: menu_item.to_string(),
                    x: element.x,
                    y: element.y,
                    width: element.width,
                    height: 22,
                    enabled: true,
                    focused: false,
                    visible: true,
                    children: Vec::new(),
                    pid: element.pid,
                    description: None,
                    value: None,
                    help_text: None,
                })
                .collect();
            return Ok(children);
        }

        Ok(Vec::new())
    }

    fn get_ancestors(&self, element: &AccessibilityElement) -> Result<Vec<AccessibilityElement>, String> {
        let app_name = element
            .description
            .as_deref()
            .and_then(|d| d.strip_prefix("macOS application: "))
            .or(element.description.as_deref())
            .unwrap_or(&element.name);

        Ok(vec![
            AccessibilityElement {
                role: "AXApplication".into(),
                name: app_name.to_string(),
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                enabled: true,
                focused: false,
                visible: true,
                children: Vec::new(),
                pid: element.pid,
                description: None,
                value: None,
                help_text: None,
            },
        ])
    }

    fn get_all_elements_matching(&self, role: &str, name: &str) -> Result<Vec<AccessibilityElement>, String> {
        let apps = list_visible_apps();
        let focused_app = frontmost_app_name().unwrap_or_default();
        let elements: Vec<AccessibilityElement> = apps
            .iter()
            .map(|a| build_element_for_app(a, a == &focused_app))
            .filter(|elem| {
                (role.is_empty() || elem.role.to_lowercase().contains(&role.to_lowercase()))
                    && (name.is_empty()
                        || elem.name.to_lowercase().contains(&name.to_lowercase()))
            })
            .collect();
        Ok(elements)
    }

    fn snapshot(&self) -> Result<AccessibilityTree, String> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let root = self.get_root_element()?;
        let focused = self.get_focused_element()?;

        Ok(AccessibilityTree {
            root,
            focused_element: focused,
            timestamp: now,
        })
    }

    fn perform_action(&self, element: &AccessibilityElement, action: &str) -> Result<(), String> {
        match action {
            "focus" | "raise" => {
                // Bring the application to front
                let app_name = element
                    .description
                    .as_deref()
                    .and_then(|d| {
                        if d.starts_with("macOS application: ") {
                            d.strip_prefix("macOS application: ")
                        } else {
                            None
                        }
                    })
                    .unwrap_or(&element.name);
                let script = format!("tell application \"{}\" to activate", app_name);
                let _ = osascript(&script);
                Ok(())
            }
            "click" => {
                let cx = element.x + element.width as i32 / 2;
                let cy = element.y + element.height as i32 / 2;
                // Use cliclick if available
                if Command::new("cliclick")
                    .args([&format!("c:{},{}", cx, cy)])
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
                {
                    return Ok(());
                }
                // Fallback: AppleScript click at coords
                let script = format!(
                    "tell application \"System Events\" to click at {{{}, {}}}",
                    cx, cy
                );
                let _ = osascript(&script);
                Ok(())
            }
            _ => {
                log::warn!("MacAccessibility::perform_action: unsupported action '{}'", action);
                Ok(())
            }
        }
    }
}
