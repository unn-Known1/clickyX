// Windows accessibility stub — functions are intentionally not all called yet;
// they form the complete UIAutomation/PowerShell API surface for future use.
#![allow(dead_code)]

use super::{AccessibilityElement, AccessibilityTree, AccessibilityApi};
use std::process::Command;

pub struct WindowsAccessibility;

impl WindowsAccessibility {
    pub fn new() -> Self {
        Self
    }
}

/// Run a PowerShell command and return trimmed stdout on success.
fn powershell(script: &str) -> Option<String> {
    let out = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .ok()?;
    if out.status.success() {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if s.is_empty() { None } else { Some(s) }
    } else {
        None
    }
}

/// Get the title of the currently focused window using UIAutomation.
/// Falls back to getting the foreground window via Get-Process.
fn get_focused_window_title() -> Option<String> {
    // Try UIAutomation first
    if let Some(title) = powershell(
        "[System.Windows.Automation.AutomationElement]::FocusedElement.Current.Name",
    ) {
        if !title.is_empty() && title != "" {
            return Some(title);
        }
    }

    // Fallback: use GetForegroundWindow via Add-Type P/Invoke
    powershell(
        r#"
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$hwnd = [Win32]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder(512)
[Win32]::GetWindowText($hwnd, $sb, 512) | Out-Null
$sb.ToString()
"#,
    )
}

/// Get the foreground window's process name.
fn get_foreground_process_name() -> Option<String> {
    powershell(
        r#"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32FG {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
$hwnd = [Win32FG]::GetForegroundWindow()
$pid = 0
[Win32FG]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
(Get-Process -Id $pid -ErrorAction SilentlyContinue).Name
"#,
    )
}

/// Get geometry of the foreground window.
fn get_foreground_window_rect() -> (i32, i32, u32, u32) {
    let result = powershell(
        r#"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Rect {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$hwnd = [Win32Rect]::GetForegroundWindow()
$r = New-Object Win32Rect+RECT
[Win32Rect]::GetWindowRect($hwnd, [ref]$r) | Out-Null
"$($r.Left),$($r.Top),$($r.Right - $r.Left),$($r.Bottom - $r.Top)"
"#,
    );

    match result {
        Some(s) => {
            let parts: Vec<i64> = s.split(',').filter_map(|p| p.trim().parse().ok()).collect();
            if parts.len() == 4 {
                return (
                    parts[0] as i32,
                    parts[1] as i32,
                    parts[2].max(0) as u32,
                    parts[3].max(0) as u32,
                );
            }
            (0, 0, 800, 600)
        }
        None => (0, 0, 800, 600),
    }
}

/// Get foreground window PID.
fn get_foreground_pid() -> Option<u32> {
    powershell(
        r#"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Pid {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
$hwnd = [Win32Pid]::GetForegroundWindow()
$pid = [uint32]0
[Win32Pid]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
$pid
"#,
    )
    .and_then(|s| s.trim().parse().ok())
}

/// List all visible window titles via PowerShell.
fn list_visible_windows() -> Vec<(String, String, u32)> {
    // Returns Vec<(title, process_name, pid)>
    let result = powershell(
        r#"
Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne "" } |
Select-Object -First 16 |
ForEach-Object { "$($_.MainWindowTitle)|$($_.Name)|$($_.Id)" }
"#,
    );
    match result {
        Some(s) => s
            .lines()
            .filter_map(|line| {
                let parts: Vec<&str> = line.splitn(3, '|').collect();
                if parts.len() == 3 {
                    Some((
                        parts[0].trim().to_string(),
                        parts[1].trim().to_string(),
                        parts[2].trim().parse().unwrap_or(0),
                    ))
                } else {
                    None
                }
            })
            .collect(),
        None => Vec::new(),
    }
}

fn build_element(title: &str, process: &str, pid: u32, focused: bool) -> AccessibilityElement {
    let (x, y, w, h) = if focused {
        get_foreground_window_rect()
    } else {
        (0, 0, 0, 0)
    };
    AccessibilityElement {
        role: "window".into(),
        name: title.to_string(),
        x,
        y,
        width: w,
        height: h,
        enabled: true,
        focused,
        visible: true,
        children: Vec::new(),
        pid: Some(pid),
        description: Some(format!("process: {}", process)),
        value: None,
        help_text: None,
    }
}

impl AccessibilityApi for WindowsAccessibility {
    fn get_element_at_point(&self, x: i32, y: i32) -> Result<AccessibilityElement, String> {
        // Use UIAutomation ElementFromPoint via PowerShell
        let script = format!(
            r#"
$p = New-Object System.Windows.Point({}, {})
$el = [System.Windows.Automation.AutomationElement]::FromPoint($p)
if ($el -ne $null) {{
    "$($el.Current.Name)|$($el.Current.ControlType.ProgrammaticName)|$($el.Current.BoundingRectangle.X),$($el.Current.BoundingRectangle.Y),$($el.Current.BoundingRectangle.Width),$($el.Current.BoundingRectangle.Height)"
}}
"#,
            x, y
        );

        if let Some(info) = powershell(&script) {
            let parts: Vec<&str> = info.splitn(3, '|').collect();
            if parts.len() >= 2 {
                let name = parts[0].trim().to_string();
                let role = parts[1]
                    .trim()
                    .trim_start_matches("ControlType.")
                    .to_string();
                let (ex, ey, ew, eh) = if parts.len() == 3 {
                    let coords: Vec<i64> = parts[2]
                        .split(',')
                        .filter_map(|s| s.trim().parse().ok())
                        .collect();
                    if coords.len() == 4 {
                        (
                            coords[0] as i32,
                            coords[1] as i32,
                            coords[2].max(0) as u32,
                            coords[3].max(0) as u32,
                        )
                    } else {
                        (x, y, 1, 1)
                    }
                } else {
                    (x, y, 1, 1)
                };
                return Ok(AccessibilityElement {
                    role,
                    name,
                    x: ex,
                    y: ey,
                    width: ew,
                    height: eh,
                    enabled: true,
                    focused: false,
                    visible: true,
                    children: Vec::new(),
                    pid: None,
                    description: None,
                    value: None,
                    help_text: None,
                });
            }
        }

        // Fallback: return focused window
        let title = get_focused_window_title().unwrap_or_else(|| "Unknown".into());
        let pid = get_foreground_pid().unwrap_or(0);
        let proc = get_foreground_process_name().unwrap_or_default();
        let (wx, wy, ww, wh) = get_foreground_window_rect();
        Ok(build_element(&title, &proc, pid, false))
            .map(|mut e| { e.x = wx; e.y = wy; e.width = ww; e.height = wh; e })
    }

    fn get_focused_element(&self) -> Result<Option<AccessibilityElement>, String> {
        let title = match get_focused_window_title() {
            Some(t) if !t.is_empty() => t,
            _ => return Ok(None),
        };
        let pid = get_foreground_pid().unwrap_or(0);
        let proc = get_foreground_process_name().unwrap_or_default();
        let (x, y, w, h) = get_foreground_window_rect();

        let mut elem = build_element(&title, &proc, pid, true);
        elem.x = x;
        elem.y = y;
        elem.width = w;
        elem.height = h;
        elem.focused = true;
        Ok(Some(elem))
    }

    fn get_root_element(&self) -> Result<AccessibilityElement, String> {
        let windows = list_visible_windows();
        let children: Vec<AccessibilityElement> = windows
            .into_iter()
            .map(|(title, proc, pid)| build_element(&title, &proc, pid, false))
            .collect();

        Ok(AccessibilityElement {
            role: "desktop".into(),
            name: "Windows Desktop".into(),
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            enabled: true,
            focused: false,
            visible: true,
            children,
            pid: None,
            description: Some("Windows UIAutomation root".into()),
            value: None,
            help_text: None,
        })
    }

    fn get_children(&self, element: &AccessibilityElement) -> Result<Vec<AccessibilityElement>, String> {
        if !element.children.is_empty() {
            return Ok(element.children.clone());
        }
        if element.role == "desktop" {
            let windows = list_visible_windows();
            return Ok(windows
                .into_iter()
                .map(|(title, proc, pid)| build_element(&title, &proc, pid, false))
                .collect());
        }
        Ok(Vec::new())
    }

    fn get_ancestors(&self, element: &AccessibilityElement) -> Result<Vec<AccessibilityElement>, String> {
        Ok(vec![
            AccessibilityElement {
                role: "desktop".into(),
                name: "Windows Desktop".into(),
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
        let windows = list_visible_windows();
        let matches: Vec<AccessibilityElement> = windows
            .into_iter()
            .map(|(title, proc, pid)| build_element(&title, &proc, pid, false))
            .filter(|elem| {
                (role.is_empty() || elem.role.to_lowercase().contains(&role.to_lowercase()))
                    && (name.is_empty()
                        || elem.name.to_lowercase().contains(&name.to_lowercase()))
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
        match action {
            "focus" => {
                if let Some(pid) = element.pid {
                    let script = format!(
                        "(Get-Process -Id {} -ErrorAction SilentlyContinue).MainWindowHandle | \
                         ForEach-Object {{ [void][System.Windows.Forms.Form]::new().Invoke([Action]{{  }}) }}",
                        pid
                    );
                    let _ = powershell(&script);
                }
                Ok(())
            }
            "click" => {
                let cx = element.x + element.width as i32 / 2;
                let cy = element.y + element.height as i32 / 2;
                let script = format!(
                    r#"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Mouse {{
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);
    public const int MOUSEEVENTF_LEFTDOWN = 0x02;
    public const int MOUSEEVENTF_LEFTUP = 0x04;
}}
"@
[Mouse]::SetCursorPos({}, {})
Start-Sleep -Milliseconds 30
[Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
[Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
"#,
                    cx, cy
                );
                let _ = powershell(&script);
                Ok(())
            }
            _ => {
                log::warn!("WindowsAccessibility::perform_action: unsupported action '{}'", action);
                Ok(())
            }
        }
    }
}
