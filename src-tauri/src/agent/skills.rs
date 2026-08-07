use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub version: String,
    pub permission_class: String,
    pub entry_point: String,
}

/// Candidate skill directories.
///
/// #19: the old code only used `CARGO_MANIFEST_DIR/../skills` (a compile-time
/// path), so packaged/installed builds always returned an empty skill list.
/// We now also scan the per-user data + config dirs, which admins/packagers can
/// seed, and fall back to the in-repo `skills/` dir for dev builds.
fn skills_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(data) = dirs::data_dir() {
        dirs.push(data.join("clickyx").join("skills"));
    }
    if let Some(config) = dirs::config_dir() {
        dirs.push(config.join("clickyx").join("skills"));
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(dev) = manifest_dir.parent().map(|p| p.join("skills")) {
        if dev.exists() {
            dirs.push(dev);
        }
    }
    dirs
}

/// Scan one skill directory: every sub-folder may contain skill metadata files
/// (`<name>.toml` / `<name>.json`); top-level files are also loaded.
fn scan_dir(dir: &PathBuf, skills: &mut Vec<Skill>) {
    if !dir.exists() {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Ok(sub_entries) = std::fs::read_dir(&path) {
                for sub in sub_entries.flatten() {
                    push_unique(skills, load_skill_file(&sub.path()));
                }
            }
        } else {
            push_unique(skills, load_skill_file(&path));
        }
    }
}

fn push_unique(skills: &mut Vec<Skill>, skill: Option<Skill>) {
    if let Some(skill) = skill {
        if !skills.iter().any(|s| s.name == skill.name) {
            skills.push(skill);
        }
    }
}

pub fn load_skills() -> Vec<Skill> {
    let mut skills = vec![];
    for dir in skills_dirs() {
        scan_dir(&dir, &mut skills);
    }
    skills
}

pub fn load_skill(name: &str) -> Option<Skill> {
    for dir in skills_dirs() {
        if !dir.exists() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    if let Ok(sub_entries) = std::fs::read_dir(&path) {
                        for sub in sub_entries.flatten() {
                            if let Some(skill) = load_skill_file(&sub.path()) {
                                if skill.name == name {
                                    return Some(skill);
                                }
                            }
                        }
                    }
                } else if let Some(skill) = load_skill_file(&path) {
                    if skill.name == name {
                        return Some(skill);
                    }
                }
            }
        }
    }
    None
}

pub fn discover_skills() -> Vec<String> {
    load_skills().into_iter().map(|s| s.name).collect()
}

fn load_skill_file(path: &PathBuf) -> Option<Skill> {
    let ext = path.extension()?.to_str()?;
    match ext {
        "toml" => load_toml_skill(path),
        "json" => load_json_skill(path),
        _ => None,
    }
}

fn load_toml_skill(path: &PathBuf) -> Option<Skill> {
    let content = std::fs::read_to_string(path).ok()?;
    toml::from_str(&content).ok()
}

fn load_json_skill(path: &PathBuf) -> Option<Skill> {
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_skills_returns_vec_when_dir_missing() {
        // The skills dir won't exist in CI; should return empty vec, not panic
        let skills = load_skills();
        // Should be a Vec (possibly empty) — just ensure it doesn't panic
        let _ = skills.len();
    }

    #[test]
    fn test_discover_skills_returns_names() {
        let names = discover_skills();
        // Should return a Vec<String>; may be empty in CI
        for name in &names {
            assert!(!name.is_empty(), "skill name should not be empty");
        }
    }

    #[test]
    fn test_load_skill_returns_none_when_missing() {
        let result = load_skill("nonexistent-skill-xyz-12345");
        assert!(result.is_none());
    }

    #[test]
    fn test_skill_struct_serialization() {
        let skill = Skill {
            name: "test-skill".into(),
            description: "A test skill".into(),
            version: "1.0.0".into(),
            permission_class: "read_only".into(),
            entry_point: "index.js".into(),
        };
        let json = serde_json::to_string(&skill).expect("serialize failed");
        assert!(json.contains("\"name\""));
        assert!(json.contains("test-skill"));
        assert!(json.contains("\"description\""));
        assert!(json.contains("\"version\""));
    }

    #[test]
    fn test_skill_deserialization_from_json() {
        let json = r#"{
            "name": "web-search",
            "description": "Search the web",
            "version": "2.1.0",
            "permission_class": "network",
            "entry_point": "search.js"
        }"#;
        let skill: Skill = serde_json::from_str(json).expect("deserialize failed");
        assert_eq!(skill.name, "web-search");
        assert_eq!(skill.description, "Search the web");
        assert_eq!(skill.version, "2.1.0");
        assert_eq!(skill.permission_class, "network");
        assert_eq!(skill.entry_point, "search.js");
    }

    #[test]
    fn test_skill_roundtrip_serialization() {
        let original = Skill {
            name: "my-skill".into(),
            description: "Does things".into(),
            version: "0.1.1".into(),
            permission_class: "full_access".into(),
            entry_point: "main.ts".into(),
        };
        let json = serde_json::to_string(&original).expect("serialize");
        let restored: Skill = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(original.name, restored.name);
        assert_eq!(original.description, restored.description);
    }

    #[test]
    fn test_scan_dir_skips_missing_dir() {
        let mut skills = vec![];
        scan_dir(&PathBuf::from("/nonexistent/definitely/missing"), &mut skills);
        assert!(skills.is_empty());
    }
}
