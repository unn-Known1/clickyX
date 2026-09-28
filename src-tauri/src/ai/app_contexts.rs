//! Per-app CUA context injection (created for Jarvis; was phantom in rev.1).
//!
//! Maps a normalized app/window identity → prompt context snippet that gets
//! prepended to chat/draft state. Messaging apps get Jarvis-specific
//! extraction hints; everything else falls back to a generic snippet.

use std::collections::HashMap;

/// Normalize a window title / app id for context lookup:
/// lowercase, strip notification counts, CJK-space collapse, trim.
pub fn normalize_app_id(raw: &str) -> String {
    let mut s = raw.to_lowercase();
    // Strip common count badges: "(3)", "[12]", trailing digits in parens.
    for pat in ["(", "[", "{"] {
        if let Some(idx) = s.find(pat) {
            // Only strip if the bracketed tail looks like a count (<6 chars).
            let tail = &s[idx..];
            if tail.len() < 12 && tail.chars().any(|c| c.is_ascii_digit()) {
                s.truncate(idx);
            }
        }
    }
    s = s
        .replace(['　', '\u{00a0}'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    s.trim().to_string()
}

/// Static registry of per-app context snippets.
pub fn app_contexts() -> HashMap<&'static str, &'static str> {
    HashMap::from([
        (
            "slack",
            "Slack workspace. Threads matter; reply in the active thread. Keep @mentions intact.",
        ),
        (
            "discord",
            "Discord channel/DM. Short informal tone unless the channel is announcements.",
        ),
        (
            "telegram",
            "Telegram chat. Short messages; no heavy formatting (clients strip it).",
        ),
        (
            "teams",
            "Microsoft Teams. Formal tone; preserve thread replies and @mentions.",
        ),
        (
            "vscode",
            "VS Code. Code context: prefer file/line references over screenshots.",
        ),
        (
            "figma",
            "Figma. Design context: reference frame/layer names when visible.",
        ),
        (
            "terminal",
            "Terminal. Never paste multi-line commands blindly; confirm destructive commands.",
        ),
        (
            "blender",
            "Blender. UI is dense; reference panel names when describing actions.",
        ),
    ])
}

/// Look up the injection snippet for a raw app id / window title.
/// Returns `(matched_key, snippet)`. Falls back to `("generic", …)`.
pub fn get_app_context(raw_app: &str) -> (&'static str, &'static str) {
    let norm = normalize_app_id(raw_app);
    let registry = app_contexts();
    for (key, snippet) in registry {
        if norm.contains(key) {
            return (key, snippet);
        }
    }
    (
        "generic",
        "Desktop app. Describe visible UI precisely before acting.",
    )
}

/// Build the injection block for a Jarvis judge/draft call.
pub fn injection_block(raw_app: &str) -> String {
    let (key, snippet) = get_app_context(raw_app);
    format!("[app-context:{key}] {snippet}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_strips_counts() {
        assert_eq!(normalize_app_id("Slack (3)"), "slack");
        assert_eq!(normalize_app_id("Discord  [12]"), "discord");
    }

    #[test]
    fn test_lookup_messaging_apps() {
        let (k, _) = get_app_context("Slack — #general");
        assert_eq!(k, "slack");
        let (k, _) = get_app_context("Telegram (5)");
        assert_eq!(k, "telegram");
    }

    #[test]
    fn test_fallback_generic() {
        let (k, _) = get_app_context("SomeRandomApp 2.0");
        assert_eq!(k, "generic");
    }

    #[test]
    fn test_injection_block_format() {
        let b = injection_block("Discord - #random");
        assert!(b.starts_with("[app-context:discord]"));
    }
}
