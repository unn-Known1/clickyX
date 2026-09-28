//! Window blocklist — checked in Rust BEFORE capture (fail-closed).
//!
//! - Normalization: lowercase, strip notification counts, collapse CJK/nbsp
//!   spaces, trim. Shared with `ai::app_contexts::normalize_app_id` semantics
//!   (duplicated here to keep `jarvis` dependency-free).
//! - Hardcoded denies (never Jarvis-enabled): WeChat family, banking/payment.
//! - User extras from `JarvisConfig.blocklist_extra` (substring, lowercase).
//! - Refusals are redacted (never log the raw title).

/// Normalize a window title / app id for matching and session keys.
pub fn normalize_window_title(raw: &str) -> String {
    let mut s = raw.to_lowercase();
    for pat in ["(", "[", "{"] {
        if let Some(idx) = s.find(pat) {
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

/// Substring denies that are ALWAYS blocked (lowercase, post-normalization).
fn hardcoded_denies() -> &'static [&'static str] {
    &[
        "wechat",
        "wechat.exe",
        // CJK original term (kept as UTF-8 literal, file is UTF-8).
        "微信",
        "banking",
        "bank ",
        " payment",
        "payment ",
        "*payment*",
    ]
}

/// Glob-lite: supports `*substr*`, `prefix*`, `*suffix`, else substring.
fn glob_hit(pattern: &str, text: &str) -> bool {
    let p = pattern.to_lowercase();
    let t = text.to_lowercase();
    if p.starts_with('*') && p.ends_with('*') && p.len() >= 2 {
        t.contains(&p[1..p.len() - 1])
    } else if p.ends_with('*') {
        t.starts_with(&p[..p.len() - 1])
    } else if p.starts_with('*') {
        t.ends_with(&p[1..])
    } else {
        t.contains(&p)
    }
}

/// True when the window must NOT be Jarvis-processed.
pub fn is_blocklisted(raw_title: &str, extra: &[String]) -> bool {
    let norm = normalize_window_title(raw_title);
    if norm.is_empty() {
        return false;
    }
    for pat in hardcoded_denies() {
        if glob_hit(pat, &norm) {
            return true;
        }
    }
    for pat in extra {
        let p = pat.trim().to_lowercase();
        if p.is_empty() {
            continue;
        }
        if glob_hit(&p, &norm) {
            return true;
        }
    }
    false
}

/// Stable session key for a window (normalized; hashed to bound length).
/// Uses FNV-1a 64 (no new deps) — NOT cryptographic, just a stable id.
pub fn session_key(raw_title: &str) -> String {
    let norm = normalize_window_title(raw_title);
    let mut h: u64 = 0xcbf29ce484222325;
    for b in norm.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("jarvis-{h:016x}")
}

/// Redacted refusal message (safe for UI/logs/bridge — no title bytes).
pub fn blocklisted_refusal() -> String {
    "refusing Jarvis in this window (blocklisted category: messaging-with-e2e-encryption or banking/payment). Switch to an allowed app or edit the blocklist.".into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_strips_counts_and_spaces() {
        assert_eq!(normalize_window_title("Slack (3)"), "slack");
        assert_eq!(normalize_window_title("Telegram　(5)"), "telegram");
        assert_eq!(normalize_window_title("  Discord  "), "discord");
    }

    #[test]
    fn test_wechat_family_blocked() {
        assert!(is_blocklisted("WeChat", &[]));
        assert!(is_blocklisted("wechat.exe - Chat", &[]));
        assert!(is_blocklisted("微信", &[]));
    }

    #[test]
    fn test_banking_payment_blocked() {
        assert!(is_blocklisted("My Banking App", &[]));
        assert!(is_blocklisted("Checkout *payment* page", &[]));
    }

    #[test]
    fn test_allowed_apps_pass() {
        assert!(!is_blocklisted("Slack — #general", &[]));
        assert!(!is_blocklisted("Discord", &[]));
        assert!(!is_blocklisted("", &[]));
    }

    #[test]
    fn test_user_extra_globs() {
        let extra = vec!["*confidential*".to_string(), "hr-portal*".to_string()];
        assert!(is_blocklisted("Q3 Confidential Review", &extra));
        assert!(is_blocklisted("HR-Portal Home", &extra));
        assert!(!is_blocklisted("General Chat", &extra));
    }

    #[test]
    fn test_session_key_stable_and_bounded() {
        let a = session_key("Slack (3)");
        let b = session_key("slack");
        assert_eq!(a, b);
        assert!(a.starts_with("jarvis-"));
        assert_ne!(session_key("Slack"), session_key("Discord"));
    }

    #[test]
    fn test_refusal_carries_no_title() {
        let r = blocklisted_refusal();
        assert!(!r.contains("WeChat"));
        assert!(r.contains("blocklisted"));
    }
}
