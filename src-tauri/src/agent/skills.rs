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
