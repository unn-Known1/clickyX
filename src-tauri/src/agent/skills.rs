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

fn skills_dir() -> PathBuf {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir.parent().map(|p| p.join("skills")).unwrap_or_else(|| manifest_dir.join("../skills"))
}

pub fn load_skills() -> Vec<Skill> {
    let dir = skills_dir();
    if !dir.exists() {
        return vec![];
    }

    let mut skills = vec![];
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Ok(sub_entries) = std::fs::read_dir(&path) {
                    for sub in sub_entries.flatten() {
                        if let Some(skill) = load_skill_file(&sub.path()) {
                            skills.push(skill);
                        }
                    }
                }
            } else if let Some(skill) = load_skill_file(&path) {
                skills.push(skill);
            }
        }
    }
    skills
}

pub fn load_skill(name: &str) -> Option<Skill> {
    let dir = skills_dir();
    if !dir.exists() {
        return None;
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
        assert_eq!(original.version, restored.version);
        assert_eq!(original.entry_point, restored.entry_point);
    }

    #[test]
    fn test_load_skill_file_returns_none_for_unknown_extension() {
        let path = PathBuf::from("test.yaml");
        let result = load_skill_file(&path);
        assert!(result.is_none(), "unknown extension should return None");
    }

    #[test]
    fn test_load_json_skill_parses_valid_file() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("skill.json");
        let json = r#"{
            "name": "temp-skill",
            "description": "Temporary",
            "version": "1.0.0",
            "permission_class": "read_only",
            "entry_point": "index.js"
        }"#;
        std::fs::write(&path, json).expect("write");
        let result = load_json_skill(&path);
        assert!(result.is_some());
        assert_eq!(result.unwrap().name, "temp-skill");
    }

    #[test]
    fn test_load_json_skill_returns_none_for_invalid_json() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("bad.json");
        std::fs::write(&path, "not valid json").expect("write");
        let result = load_json_skill(&path);
        assert!(result.is_none());
    }

    #[test]
    fn test_load_toml_skill_parses_valid_file() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("skill.toml");
        let toml_content = r#"
name = "toml-skill"
description = "A TOML skill"
version = "1.2.3"
permission_class = "read_only"
entry_point = "skill.js"
"#;
        std::fs::write(&path, toml_content).expect("write");
        let result = load_toml_skill(&path);
        assert!(result.is_some());
        assert_eq!(result.unwrap().name, "toml-skill");
    }
}
