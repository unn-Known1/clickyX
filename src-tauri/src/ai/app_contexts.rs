/// Per-application CUA context — provides app-specific system prompt injections
/// and tool hints so the AI knows the keyboard shortcuts and idioms for common apps.
pub struct AppCuaContext {
    pub app_name: String,
    /// Bundle IDs or process names to match (case-insensitive substring match)
    pub app_patterns: Vec<String>,
    /// Extra text injected into the system prompt when this app is focused
    pub system_prompt_injection: String,
    pub tool_descriptions: Vec<ToolHint>,
}

pub struct ToolHint {
    pub name: String,
    pub description: String,
    pub shortcut: Option<String>,
}

pub fn get_app_contexts() -> Vec<AppCuaContext> {
    vec![
        AppCuaContext {
            app_name: "VS Code".into(),
            app_patterns: vec![
                "code".into(),
                "cursor".into(),
                "Code.exe".into(),
                "code-oss".into(),
            ],
            system_prompt_injection: "The user is working in VS Code. Use keyboard shortcuts like \
                Ctrl+P for file search, Ctrl+Shift+P for command palette, F5 to run/debug, \
                Ctrl+` to open terminal, Ctrl+B to toggle sidebar.".into(),
            tool_descriptions: vec![
                ToolHint {
                    name: "open_file".into(),
                    description: "Press Ctrl+P and type filename".into(),
                    shortcut: Some("Ctrl+P".into()),
                },
                ToolHint {
                    name: "command_palette".into(),
                    description: "Press Ctrl+Shift+P to open the command palette".into(),
                    shortcut: Some("Ctrl+Shift+P".into()),
                },
                ToolHint {
                    name: "terminal".into(),
                    description: "Press Ctrl+` to open the integrated terminal".into(),
                    shortcut: Some("Ctrl+`".into()),
                },
                ToolHint {
                    name: "find_in_files".into(),
                    description: "Press Ctrl+Shift+F to search across files".into(),
                    shortcut: Some("Ctrl+Shift+F".into()),
                },
            ],
        },
        AppCuaContext {
            app_name: "Figma".into(),
            app_patterns: vec!["figma".into(), "Figma".into()],
            system_prompt_injection: "The user is working in Figma. Use V for selector, F for \
                frame tool, R for rectangle, T for text, Space+drag to pan, Ctrl+G to group, \
                Ctrl+D to duplicate, Ctrl+Z to undo.".into(),
            tool_descriptions: vec![
                ToolHint {
                    name: "select".into(),
                    description: "Press V for the select/pointer tool".into(),
                    shortcut: Some("V".into()),
                },
                ToolHint {
                    name: "frame".into(),
                    description: "Press F for the frame tool".into(),
                    shortcut: Some("F".into()),
                },
                ToolHint {
                    name: "rectangle".into(),
                    description: "Press R for the rectangle tool".into(),
                    shortcut: Some("R".into()),
                },
                ToolHint {
                    name: "text".into(),
                    description: "Press T for the text tool".into(),
                    shortcut: Some("T".into()),
                },
            ],
        },
        AppCuaContext {
            app_name: "Terminal".into(),
            app_patterns: vec![
                "terminal".into(),
                "iterm".into(),
                "iterm2".into(),
                "cmd.exe".into(),
                "powershell".into(),
                "WindowsTerminal".into(),
                "bash".into(),
                "zsh".into(),
                "fish".into(),
                "alacritty".into(),
                "kitty".into(),
                "wezterm".into(),
            ],
            system_prompt_injection: "The user is working in a terminal. Type commands directly, \
                use Tab for autocomplete, Ctrl+C to cancel a running command, Ctrl+L to clear \
                the screen, up/down arrows to navigate history.".into(),
            tool_descriptions: vec![
                ToolHint {
                    name: "autocomplete".into(),
                    description: "Press Tab for shell autocomplete".into(),
                    shortcut: Some("Tab".into()),
                },
                ToolHint {
                    name: "cancel".into(),
                    description: "Press Ctrl+C to cancel the current running command".into(),
                    shortcut: Some("Ctrl+C".into()),
                },
                ToolHint {
                    name: "clear".into(),
                    description: "Press Ctrl+L to clear the terminal screen".into(),
                    shortcut: Some("Ctrl+L".into()),
                },
            ],
        },
        AppCuaContext {
            app_name: "Blender".into(),
            app_patterns: vec!["blender".into(), "Blender".into()],
            system_prompt_injection: "The user is working in Blender 3D. Use G to grab/move, \
                R to rotate, S to scale, X/Y/Z to constrain to an axis after G/R/S, Tab to \
                toggle edit mode, Numpad 0 for camera view, Numpad 5 to toggle orthographic, \
                A to select all, Alt+A to deselect all, Ctrl+Z to undo.".into(),
            tool_descriptions: vec![
                ToolHint {
                    name: "grab".into(),
                    description: "Press G to grab/move selected objects".into(),
                    shortcut: Some("G".into()),
                },
                ToolHint {
                    name: "rotate".into(),
                    description: "Press R to rotate selected objects".into(),
                    shortcut: Some("R".into()),
                },
                ToolHint {
                    name: "scale".into(),
                    description: "Press S to scale selected objects".into(),
                    shortcut: Some("S".into()),
                },
                ToolHint {
                    name: "edit_mode".into(),
                    description: "Press Tab to toggle between object and edit mode".into(),
                    shortcut: Some("Tab".into()),
                },
            ],
        },
        AppCuaContext {
            app_name: "Chrome".into(),
            app_patterns: vec![
                "chrome".into(),
                "Chrome".into(),
                "Chromium".into(),
                "chromium".into(),
                "google-chrome".into(),
            ],
            system_prompt_injection: "The user is working in Chrome browser. Use Ctrl+L to focus \
                the address bar, Ctrl+T for a new tab, Ctrl+W to close a tab, Ctrl+F to find on \
                the page, F12 for DevTools, Ctrl+Shift+J for the JS console.".into(),
            tool_descriptions: vec![
                ToolHint {
                    name: "address_bar".into(),
                    description: "Press Ctrl+L to focus the address bar".into(),
                    shortcut: Some("Ctrl+L".into()),
                },
                ToolHint {
                    name: "devtools".into(),
                    description: "Press F12 to open Chrome DevTools".into(),
                    shortcut: Some("F12".into()),
                },
                ToolHint {
                    name: "find_on_page".into(),
                    description: "Press Ctrl+F to find text on the current page".into(),
                    shortcut: Some("Ctrl+F".into()),
                },
            ],
        },
        AppCuaContext {
            app_name: "Premiere Pro".into(),
            app_patterns: vec!["premiere".into(), "Adobe Premiere".into()],
            system_prompt_injection: "The user is working in Adobe Premiere Pro. Use Space to \
                play/pause, J/K/L for rewind/pause/forward, I/O to set in/out points, \
                Ctrl+K to add a cut, Ctrl+Z to undo.".into(),
            tool_descriptions: vec![
                ToolHint {
                    name: "play_pause".into(),
                    description: "Press Space to play or pause the timeline".into(),
                    shortcut: Some("Space".into()),
                },
                ToolHint {
                    name: "cut".into(),
                    description: "Press Ctrl+K to cut the clip at the playhead".into(),
                    shortcut: Some("Ctrl+K".into()),
                },
            ],
        },
        AppCuaContext {
            app_name: "Excel".into(),
            app_patterns: vec![
                "excel".into(),
                "EXCEL.EXE".into(),
                "Microsoft Excel".into(),
            ],
            system_prompt_injection: "The user is working in Microsoft Excel. Use Ctrl+Enter to \
                confirm a cell, Tab to move right, Shift+Tab to move left, Ctrl+Shift+End to \
                select to the last used cell, F2 to edit a cell, Ctrl+Home to go to A1.".into(),
            tool_descriptions: vec![
                ToolHint {
                    name: "edit_cell".into(),
                    description: "Press F2 to enter cell edit mode".into(),
                    shortcut: Some("F2".into()),
                },
                ToolHint {
                    name: "confirm_cell".into(),
                    description: "Press Ctrl+Enter to confirm and stay in cell".into(),
                    shortcut: Some("Ctrl+Enter".into()),
                },
            ],
        },
        AppCuaContext {
            app_name: "Notion".into(),
            app_patterns: vec!["notion".into(), "Notion".into()],
            system_prompt_injection: "The user is working in Notion. Use / to open the block menu, \
                Ctrl+K for quick search, [ ] for checkboxes, ## for headings, Ctrl+B to bold, \
                Ctrl+I for italic.".into(),
            tool_descriptions: vec![
                ToolHint {
                    name: "block_menu".into(),
                    description: "Press / to open the block type menu".into(),
                    shortcut: Some("/".into()),
                },
                ToolHint {
                    name: "quick_search".into(),
                    description: "Press Ctrl+K to open the quick search/navigation".into(),
                    shortcut: Some("Ctrl+K".into()),
                },
            ],
        },
    ]
}

/// Find a CUA context whose `app_patterns` contains a case-insensitive substring match for `process_name`.
/// Returns the first match from the static contexts list.
pub fn find_context_for_process(process_name: &str) -> Option<AppCuaContext> {
    let lower = process_name.to_lowercase();
    get_app_contexts()
        .into_iter()
        .find(|ctx| {
            ctx.app_patterns
                .iter()
                .any(|pat| lower.contains(&pat.to_lowercase()))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_app_contexts_not_empty() {
        let contexts = get_app_contexts();
        assert!(!contexts.is_empty(), "should have at least one app context");
    }

    #[test]
    fn test_vscode_context_found() {
        let ctx = find_context_for_process("code");
        assert!(ctx.is_some());
        assert_eq!(ctx.unwrap().app_name, "VS Code");
    }

    #[test]
    fn test_chrome_context_found() {
        let ctx = find_context_for_process("Google Chrome");
        assert!(ctx.is_some());
        assert_eq!(ctx.unwrap().app_name, "Chrome");
    }

    #[test]
    fn test_blender_context_found() {
        let ctx = find_context_for_process("Blender");
        assert!(ctx.is_some());
        assert_eq!(ctx.unwrap().app_name, "Blender");
    }

    #[test]
    fn test_unknown_process_returns_none() {
        let ctx = find_context_for_process("xyzzy-app-that-doesnt-exist");
        assert!(ctx.is_none());
    }

    #[test]
    fn test_context_has_system_prompt_injection() {
        let ctx = find_context_for_process("terminal").unwrap();
        assert!(!ctx.system_prompt_injection.is_empty());
    }

    #[test]
    fn test_context_has_tool_hints() {
        let ctx = find_context_for_process("code").unwrap();
        assert!(!ctx.tool_descriptions.is_empty());
    }

    #[test]
    fn test_tool_hint_has_shortcut() {
        let ctx = find_context_for_process("figma").unwrap();
        let shortcuts: Vec<_> = ctx
            .tool_descriptions
            .iter()
            .filter_map(|t| t.shortcut.as_deref())
            .collect();
        assert!(!shortcuts.is_empty(), "Figma context should have shortcuts");
    }
}
