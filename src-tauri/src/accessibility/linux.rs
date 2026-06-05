#![allow(dead_code)]

use super::{AccessibilityElement, AccessibilityTree, AccessibilityApi};
use std::process::Command;

pub struct LinuxAccessibility;

impl LinuxAccessibility {
    pub fn new() -> Self {
        Self
    }
}

fn display_server() -> &'static str {
    let sess = std::env::var("XDG_SESSION_TYPE").unwrap_or_default();
    if sess == "wayland" || std::env::var("WAYLAND_DISPLAY").is_ok() {
        "wayland"
    } else if sess == "x11" || std::env::var("DISPLAY").is_ok() {
        "x11"
    } else {
        "unknown"
    }
}

fn run_with_fallback(
    primary_cmd: &mut Command,
    fallback_cmd: &mut Command,
) -> Result<std::process::Output, std::io::Error> {
    let is_wayland = display_server() == "wayland";
    let (first, second) = if is_wayland {
        (fallback_cmd, primary_cmd)
    } else {
        (primary_cmd, fallback_cmd)
    };
    match first.output() {
        Ok(out) if out.status.success() => Ok(out),
        _ => second.output(),
    }
}

fn parse_mouse_location(output: &str) -> (i32, i32) {
    let mut x = 0i32;
    let mut y = 0i32;
    for line in output.lines() {
        if let Some(rest) = line.strip_prefix("X=") {
            x = rest.trim().parse().unwrap_or(0);
        }
        if let Some(rest) = line.strip_prefix("Y=") {
            y = rest.trim().parse().unwrap_or(0);
        }
    }
    (x, y)
}

fn get_focused_window_id() -> Option<String> {
    if display_server() == "wayland" {
        return None;
    }
    let out = Command::new("xdotool").arg("getfocus").output().ok()?;
    if !out.status.success() {
        return None;
    }
    let id = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if id.is_empty() { None } else { Some(id) }
}

fn get_window_name(win_id: &str) -> String {
    if display_server() == "wayland" {
        return "wayland-window".into();
    }
    Command::new("xdotool")
        .args(["getwindowname", win_id])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|_| "unknown".into())
}

fn get_window_geometry(win_id: &str) -> (i32, i32, u32, u32) {
    if display_server() == "wayland" {
        return (0, 0, 0, 0);
    }
    let out = Command::new("xdotool")
        .args(["getwindowgeometry", "--shell", win_id])
        .output();
    let (mut x, mut y, mut w, mut h) = (0i32, 0i32, 0u32, 0u32);
    if let Ok(o) = out {
        let s = String::from_utf8_lossy(&o.stdout);
        for line in s.lines() {
            if let Some(v) = line.strip_prefix("X=") { x = v.trim().parse().unwrap_or(0); }
            if let Some(v) = line.strip_prefix("Y=") { y = v.trim().parse().unwrap_or(0); }
            if let Some(v) = line.strip_prefix("WIDTH=") { w = v.trim().parse().unwrap_or(0); }
            if let Some(v) = line.strip_prefix("HEIGHT=") { h = v.trim().parse().unwrap_or(0); }
        }
    }
    (x, y, w, h)
}

fn get_window_class(win_id: &str) -> String {
    if display_server() == "wayland" {
        return "wayland".into();
    }
    let out = Command::new("xprop")
        .args(["-id", win_id, "WM_CLASS"])
        .output();
    if let Ok(o) = out {
        let s = String::from_utf8_lossy(&o.stdout);
        if let Some(eq_pos) = s.find('=') {
            let vals = s[eq_pos + 1..].trim();
            let parts: Vec<&str> = vals.split(',').collect();
            if parts.len() >= 2 {
                return parts[1].trim().trim_matches('"').to_string();
            }
            if !parts.is_empty() {
                return parts[0].trim().trim_matches('"').to_string();
            }
        }
    }
    "unknown".into()
}

fn get_window_pid(win_id: &str) -> Option<u32> {
    if display_server() == "wayland" {
        return None;
    }
    let out = Command::new("xdotool")
        .args(["getwindowpid", win_id])
        .output()
        .ok()?;
    if out.status.success() {
        String::from_utf8_lossy(&out.stdout).trim().parse().ok()
    } else {
        None
    }
}

fn list_visible_windows() -> Vec<String> {
    if display_server() == "wayland" {
        return Vec::new();
    }
    let out = Command::new("xdotool")
        .args(["search", "--onlyvisible", "--class", ""])
        .output();
    match out {
        Ok(o) if o.status.success() => {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect()
        }
        _ => Vec::new(),
    }
}

fn build_element_from_window(win_id: &str) -> AccessibilityElement {
    let name = get_window_name(win_id);
    let (x, y, w, h) = get_window_geometry(win_id);
    let class = get_window_class(win_id);
    let pid = get_window_pid(win_id);
    AccessibilityElement {
        role: "window".into(),
        name,
        x,
        y,
        width: w,
        height: h,
        enabled: true,
        focused: false,
        visible: true,
        children: Vec::new(),
        pid,
        description: Some(class),
        value: None,
        help_text: None,
    }
}

fn mouse_location() -> Option<(i32, i32)> {
    if display_server() == "wayland" {
        return Command::new("ydotool")
            .args(["mousemove", "--shell"])
            .output()
            .ok()
            .and_then(|o| {
                let s = String::from_utf8_lossy(&o.stdout).to_string();
                let (x, y) = parse_mouse_location(&s);
                if x == 0 && y == 0 { None } else { Some((x, y)) }
            });
    }
    Command::new("xdotool")
        .args(["getmouselocation", "--shell"])
        .output()
        .ok()
        .and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).to_string();
            let (x, y) = parse_mouse_location(&s);
            Some((x, y))
        })
}

impl AccessibilityApi for LinuxAccessibility {
    fn get_element_at_point(&self, x: i32, y: i32) -> Result<AccessibilityElement, String> {
        if display_server() == "wayland" {
            return Err("Wayland does not support xdotool window queries. Install ydotool or use X11.".into());
        }

        let out = Command::new("xdotool")
            .args(["search", "--onlyvisible", "--class", ""])
            .output();

        if let Ok(o) = out {
            let ids: Vec<&str> = std::str::from_utf8(&o.stdout)
                .unwrap_or("")
                .lines()
                .collect();

            for win_id in ids.iter().rev() {
                let win_id = win_id.trim();
                if win_id.is_empty() {
                    continue;
                }
                let (wx, wy, ww, wh) = get_window_geometry(win_id);
                if x >= wx && x < wx + ww as i32 && y >= wy && y < wy + wh as i32 {
                    let mut elem = build_element_from_window(win_id);
                    elem.x = x;
                    elem.y = y;
                    elem.width = 1;
                    elem.height = 1;
                    return Ok(elem);
                }
            }
        }

        if let Some(win_id) = get_focused_window_id() {
            return Ok(build_element_from_window(&win_id));
        }

        Ok(AccessibilityElement {
            role: "unknown".into(),
            name: format!("element at ({}, {})", x, y),
            x,
            y,
            width: 1,
            height: 1,
            enabled: true,
            focused: false,
            visible: true,
            children: Vec::new(),
            pid: None,
            description: None,
            value: None,
            help_text: None,
        })
    }

    fn get_focused_element(&self) -> Result<Option<AccessibilityElement>, String> {
        let win_id = match get_focused_window_id() {
            Some(id) => id,
            None => {
                if display_server() == "wayland" {
                    let mut elem = AccessibilityElement {
                        role: "window".into(),
                        name: "Focused Wayland Window".into(),
                        x: 0, y: 0, width: 0, height: 0,
                        enabled: true, focused: true, visible: true,
                        children: Vec::new(),
                        pid: None,
                        description: Some("wayland-focus (limited)".to_string()),
                        value: None, help_text: None,
                    };
                    if let Some((mx, my)) = mouse_location() {
                        elem.description = Some(format!("wayland-focus (limited) | mouse:({},{})", mx, my));
                    }
                    return Ok(Some(elem));
                }
                return Ok(None);
            }
        };

        let mut elem = build_element_from_window(&win_id);
        elem.focused = true;

        if let Some((mx, my)) = mouse_location() {
            elem.description = Some(format!(
                "{} | mouse:({},{})",
                elem.description.unwrap_or_default(),
                mx,
                my
            ));
        }

        Ok(Some(elem))
    }

    fn get_root_element(&self) -> Result<AccessibilityElement, String> {
        let windows = list_visible_windows();
        let children: Vec<AccessibilityElement> = windows
            .iter()
            .take(16)
            .map(|id| build_element_from_window(id))
            .collect();

        Ok(AccessibilityElement {
            role: "desktop".into(),
            name: "Linux Desktop".into(),
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            enabled: true,
            focused: false,
            visible: true,
            children,
            pid: None,
            description: Some(if display_server() == "wayland" {
                "Wayland desktop (limited window enumeration)".to_string()
            } else {
                "AT-SPI2 root (via xdotool)".to_string()
            }),
            value: None,
            help_text: None,
        })
    }

    fn get_children(&self, element: &AccessibilityElement) -> Result<Vec<AccessibilityElement>, String> {
        if !element.children.is_empty() {
            return Ok(element.children.clone());
        }
        if element.role == "window" || element.role == "desktop" {
            return Ok(list_visible_windows()
                .iter()
                .take(8)
                .map(|id| build_element_from_window(id))
                .collect());
        }
        Ok(Vec::new())
    }

    fn get_ancestors(&self, _element: &AccessibilityElement) -> Result<Vec<AccessibilityElement>, String> {
        Ok(vec![
            AccessibilityElement {
                role: "desktop".into(),
                name: "Linux Desktop".into(),
                x: 0, y: 0, width: 0, height: 0,
                enabled: true, focused: false, visible: true,
                children: Vec::new(),
                pid: None,
                description: None,
                value: None, help_text: None,
            },
        ])
    }

    fn get_all_elements_matching(&self, role: &str, name: &str) -> Result<Vec<AccessibilityElement>, String> {
        let windows = list_visible_windows();
        let matches: Vec<AccessibilityElement> = windows
            .iter()
            .map(|id| build_element_from_window(id))
            .filter(|elem| {
                (role.is_empty() || elem.role.contains(role))
                    && (name.is_empty() || elem.name.to_lowercase().contains(&name.to_lowercase()))
            })
            .collect();
        Ok(matches)
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
        let is_wayland = display_server() == "wayland";
        match action {
            "focus" => {
                if is_wayland {
                    return Err("window focus not supported on Wayland".into());
                }
                if let Some(pid) = element.pid {
                    let _ = Command::new("xdotool")
                        .args(["search", "--pid", &pid.to_string(), "windowfocus", "--sync"])
                        .output();
                }
                Ok(())
            }
            "click" => {
                let x = element.x + element.width as i32 / 2;
                let y = element.y + element.height as i32 / 2;
                if is_wayland {
                    return Command::new("ydotool")
                        .args(["mousemove", "--", &x.to_string(), &y.to_string(), "click", "0xC0"])
                        .output()
                        .map(|_| ())
                        .map_err(|e| format!("click via ydotool failed: {e}"));
                }
                let _ = Command::new("xdotool")
                    .args(["mousemove", "--sync", &x.to_string(), &y.to_string(), "click", "1"])
                    .output();
                Ok(())
            }
            _ => {
                log::warn!("LinuxAccessibility::perform_action: unsupported action '{}'", action);
                Ok(())
            }
        }
    }
}
