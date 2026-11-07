//! One-shot migration of saved model ids that no longer exist or have been
//! retired, so an old `config.json` keeps working after the provider refresh.
//!
//! Only known-retired ids are rewritten; any other id (including a custom or
//! future one the user typed) is left untouched.

/// Claude ids that were retired, never existed, or belong to the 3.x / 4.0
/// dated families. Returns true when `model` should be replaced.
pub fn is_retired_anthropic_model(model: &str) -> bool {
    let m = model.trim().to_ascii_lowercase();
    matches!(
        m.as_str(),
        "claude-sonnet-4-20250514" | "claude-opus-4-20250514" | "claude-haiku-3-20250313"
    ) || m.starts_with("claude-3")
        // claude-haiku-3-*, claude-sonnet-3-*, claude-opus-3-*
        || ["claude-haiku-3", "claude-sonnet-3", "claude-opus-3"]
            .iter()
            .any(|p| m.starts_with(p))
        // claude-<family>-4-2025MMDD (the dated Claude 4.0 ids)
        || (m.starts_with("claude-") && m.contains("-4-2025"))
}

/// Replacement for a retired Claude id, or `None` to leave it alone.
pub fn migrate_anthropic_model(model: &str) -> Option<&'static str> {
    is_retired_anthropic_model(model).then_some(super::anthropic::DEFAULT_MODEL)
}

/// OpenAI ids replaced by the GPT-6 line.
const RETIRED_OPENAI_MODELS: [&str; 4] = ["gpt-4o", "gpt-4o-mini", "o3-mini", "gpt-4.1"];

/// Replacement for a retired OpenAI id. Only applies when the base URL is
/// OpenAI's own: the same id on OpenRouter, Ollama or a custom server names a
/// different (still valid) model and must not be touched.
pub fn migrate_openai_model(model: &str, base_url: &str) -> Option<&'static str> {
    let m = model.trim().to_ascii_lowercase();
    (super::responses::is_openai_own_base_url(base_url)
        && RETIRED_OPENAI_MODELS.contains(&m.as_str()))
    .then_some(super::responses::DEFAULT_MODEL)
}

/// Apply every Claude model migration to an [`AiConfig`] and the computer-use
/// pointing model. Returns one human-readable line per change (ids only,
/// never secrets) so the caller can log once and persist.
pub fn migrate_config_models(
    ai: &mut super::AiConfig,
    pointing_model: &mut String,
) -> Vec<String> {
    let mut changes = Vec::new();
    if let Some(new) = migrate_anthropic_model(&ai.anthropic_model) {
        changes.push(format!(
            "ai.anthropic_model: {} -> {new}",
            ai.anthropic_model
        ));
        ai.anthropic_model = new.to_string();
    }
    if let Some(new) = migrate_anthropic_model(pointing_model) {
        changes.push(format!(
            "computer_use.pointing_model: {pointing_model} -> {new}"
        ));
        *pointing_model = new.to_string();
    }
    if let Some(new) = migrate_openai_model(&ai.openai_model, &ai.openai_base_url) {
        changes.push(format!("ai.openai_model: {} -> {new}", ai.openai_model));
        ai.openai_model = new.to_string();
    }
    if let Some(new) = migrate_openai_model(pointing_model, &ai.openai_base_url) {
        changes.push(format!(
            "computer_use.pointing_model: {pointing_model} -> {new}"
        ));
        *pointing_model = new.to_string();
    }
    changes
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::AiConfig;

    #[test]
    fn retired_claude_ids_are_detected() {
        for id in [
            "claude-sonnet-4-20250514",
            "claude-opus-4-20250514",
            "claude-haiku-3-20250313",
            "claude-3-5-sonnet",
            "claude-3-opus-20240229",
            "claude-opus-4-20250805",
            "claude-haiku-3-5-20241022",
        ] {
            assert!(is_retired_anthropic_model(id), "{id}");
            assert_eq!(migrate_anthropic_model(id), Some("claude-opus-5-5"));
        }
    }

    #[test]
    fn current_and_unknown_ids_are_left_alone() {
        for id in [
            "claude-opus-5-5",
            "claude-sonnet-5-5",
            "claude-haiku-5-5",
            "claude-fable-5-1",
            "claude-opus-4-8",
            "claude-sonnet-4-6",
            "claude-sonnet-4-5-20250929",
            "my-local-model",
            "",
        ] {
            assert_eq!(migrate_anthropic_model(id), None, "{id}");
        }
    }

    #[test]
    fn openai_ids_migrate_only_on_openais_own_endpoint() {
        for id in ["gpt-4o", "gpt-4o-mini", "o3-mini", "gpt-4.1"] {
            assert_eq!(migrate_openai_model(id, "https://api.openai.com"), Some("gpt-6.1-sol"));
            assert_eq!(migrate_openai_model(id, "https://api.openai.com/v1/"), Some("gpt-6.1-sol"));
            assert_eq!(migrate_openai_model(id, "https://openrouter.ai/api/v1"), None);
            assert_eq!(migrate_openai_model(id, "http://localhost:11434/v1"), None);
        }
        assert_eq!(migrate_openai_model("gpt-6-luna", "https://api.openai.com"), None);
        assert_eq!(migrate_openai_model("my-custom", "https://api.openai.com"), None);
    }

    #[test]
    fn config_migration_leaves_third_party_openai_models_alone() {
        let mut ai = AiConfig {
            openai_model: "gpt-4o".into(),
            openai_base_url: "https://openrouter.ai/api/v1".into(),
            ..AiConfig::default()
        };
        let mut pointing = "claude-opus-5-5".to_string();
        assert!(migrate_config_models(&mut ai, &mut pointing).is_empty());
        assert_eq!(ai.openai_model, "gpt-4o");
        ai.openai_base_url = "https://api.openai.com".into();
        let changes = migrate_config_models(&mut ai, &mut pointing);
        assert_eq!(changes.len(), 1);
        assert_eq!(ai.openai_model, "gpt-6.1-sol");
    }

    #[test]
    fn config_migration_rewrites_both_fields_and_reports_ids_only() {
        let mut ai = AiConfig {
            anthropic_model: "claude-sonnet-4-20250514".into(),
            anthropic_api_key: Some("sk-ant-secret".into()),
            ..AiConfig::default()
        };
        let mut pointing = "claude-opus-4-20250514".to_string();
        let changes = migrate_config_models(&mut ai, &mut pointing);
        assert_eq!(changes.len(), 2);
        assert_eq!(ai.anthropic_model, "claude-opus-5-5");
        assert_eq!(pointing, "claude-opus-5-5");
        assert!(changes.iter().all(|c| !c.contains("secret")));
        // Second run is a no-op (so the log line happens once).
        assert!(migrate_config_models(&mut ai, &mut pointing).is_empty());
    }
}
