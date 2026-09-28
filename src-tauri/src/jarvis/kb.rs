//! Local Jarvis knowledge base (encrypted at rest, default-off history).
//!
//! - Path: `<config_dir>/clickyx/kb.enc` (AES-GCM via `agent::session`).
//! - Key: the agent-store encryption key (same principal, same file).
//!   Rotation follows `agent.encryption_key` (documented in SECURITY.md).
//! - Schema: `{notes: [{tag, text}], contacts: [{name}], history_opt_in: bool}`.
//! - Matching: notes tag-substring (≤5), contacts title-substring.
//!   History (≤30, de-duped, never re-absorbed) is opt-in only.
//! - `jarvis_wipe`: overwrite + delete + fsync (best-effort) + key kept.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct KbNote {
    pub tag: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct KbContact {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct JarvisKb {
    #[serde(default)]
    pub notes: Vec<KbNote>,
    #[serde(default)]
    pub contacts: Vec<KbContact>,
    #[serde(default)]
    pub history_opt_in: bool,
}

impl JarvisKb {
    pub fn validate(&self) -> Result<(), String> {
        if self.notes.len() > 200 {
            return Err("kb notes exceed 200 entries".into());
        }
        for n in &self.notes {
            if n.tag.trim().is_empty() {
                return Err("kb note tag must not be empty".into());
            }
            if n.text.len() > 2000 {
                return Err(format!("kb note '{}' exceeds 2000 chars", n.tag));
            }
        }
        if self.contacts.len() > 200 {
            return Err("kb contacts exceed 200 entries".into());
        }
        Ok(())
    }
}

pub fn kb_path() -> std::path::PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    base.join("clickyx").join("kb.enc")
}

/// Load + decrypt. Missing file → default (empty). Wrong key → Err (never
/// silent-empty: that would hide a rotation bug and lose user data silently).
pub fn load_kb(key_hex: &str) -> Result<JarvisKb, String> {
    let path = kb_path();
    if !path.exists() {
        return Ok(JarvisKb::default());
    }
    let data = std::fs::read(&path).map_err(|e| format!("kb read: {e}"))?;
    let json = crate::agent::session::decrypt_data(&data, key_hex)?;
    serde_json::from_str(&json).map_err(|e| format!("kb parse: {e}"))
}

pub fn save_kb(kb: &JarvisKb, key_hex: &str) -> Result<(), String> {
    kb.validate()?;
    let json = serde_json::to_string(kb).map_err(|e| format!("kb serialize: {e}"))?;
    let enc = crate::agent::session::encrypt_data(&json, key_hex)?;
    let path = kb_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("kb mkdir: {e}"))?;
    }
    // Atomic write: tmp + rename + best-effort fsync.
    let tmp = path.with_extension("enc.tmp");
    std::fs::write(&tmp, &enc).map_err(|e| format!("kb write: {e}"))?;
    if let Ok(f) = std::fs::File::open(tmp.clone()) {
        let _ = f.sync_all();
    }
    std::fs::rename(&tmp, &path).map_err(|e| format!("kb commit: {e}"))?;
    Ok(())
}

/// Best-effort wipe: overwrite with random bytes, delete, fsync dir.
pub fn wipe_kb() -> Result<(), String> {
    let path = kb_path();
    if !path.exists() {
        return Ok(());
    }
    if let Ok(meta) = std::fs::metadata(&path) {
        let len = meta.len().min(1_048_576) as usize;
        let mut rnd = vec![0u8; len];
        use rand::RngCore;
        rand::thread_rng().fill_bytes(&mut rnd);
        let _ = std::fs::write(&path, &rnd);
        if let Ok(f) = std::fs::File::open(path.clone()) {
            let _ = f.sync_all();
        }
    }
    std::fs::remove_file(&path).map_err(|e| format!("kb wipe: {e}"))?;
    if let Some(parent) = path.parent() {
        if let Ok(d) = std::fs::File::open(parent) {
            let _ = d.sync_all();
        }
    }
    log::info!("jarvis kb wiped");
    Ok(())
}

/// Tag-substring match (≤5). Name field is locked (frontend editor is
/// read-only for identity; notes are the editable surface).
pub fn match_notes<'a>(query: &str, kb: &'a JarvisKb, limit: usize) -> Vec<&'a KbNote> {
    let q = query.to_lowercase();
    let mut out = Vec::new();
    for n in &kb.notes {
        if n.tag.to_lowercase().contains(&q) || q.contains(&n.tag.to_lowercase()) {
            out.push(n);
            if out.len() >= limit.min(5) {
                break;
            }
        }
    }
    out
}

pub fn match_contacts<'a>(title: &str, kb: &'a JarvisKb) -> Vec<&'a KbContact> {
    let t = title.to_lowercase();
    kb.contacts
        .iter()
        .filter(|c| !c.name.is_empty() && t.contains(&c.name.to_lowercase()))
        .take(5)
        .collect()
}

/// Build the `background{relationship, notes≤5, contact}` slice for judge state.
pub fn background_for(title: &str, kb: &JarvisKb) -> serde_json::Value {
    let notes = match_notes(title, kb, 5);
    let contacts = match_contacts(title, kb);
    serde_json::json!({
        "app": title.chars().take(120).collect::<String>(),
        "notes": notes.iter().map(|n| serde_json::json!({"tag": n.tag, "text": n.text.chars().take(500).collect::<String>()})).collect::<Vec<_>>(),
        "contacts": contacts.iter().map(|c| c.name.clone()).collect::<Vec<_>>(),
        "kb_counts": {"notes": kb.notes.len(), "contacts": kb.contacts.len()},
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_match_caps_at_5() {
        let kb = JarvisKb {
            notes: (0..10)
                .map(|i| KbNote {
                    tag: "chat".into(),
                    text: format!("n{i}"),
                })
                .collect(),
            contacts: vec![],
            history_opt_in: false,
        };
        assert_eq!(match_notes("chat", &kb, 99).len(), 5);
    }

    #[test]
    fn test_validate_rejects_empty_tag_and_oversize() {
        let bad = JarvisKb {
            notes: vec![KbNote {
                tag: "".into(),
                text: "x".into(),
            }],
            contacts: vec![],
            history_opt_in: false,
        };
        assert!(bad.validate().is_err());
    }

    #[test]
    fn test_background_counts_only_lengths() {
        let kb = JarvisKb {
            notes: vec![KbNote {
                tag: "slack".into(),
                text: "x".repeat(10),
            }],
            contacts: vec![KbContact { name: "ana".into() }],
            history_opt_in: false,
        };
        let bg = background_for("Slack — ana", &kb);
        assert_eq!(bg["kb_counts"]["notes"], 1);
        assert_eq!(bg["contacts"][0], "ana");
    }
}
