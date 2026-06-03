use std::collections::HashMap;

use regex::Regex;

#[derive(Debug, Clone)]
pub struct AgentTrigger {
    pub phrases: Vec<String>,
    pub agent_name: String,
    pub agent_slug: String,
}

#[derive(Debug, Clone)]
pub struct HandoffAction {
    pub agent_slug: String,
    pub agent_name: String,
    pub query: String,
    pub trigger_phrase: String,
}

pub struct VoiceAgentHandoff {
    triggers: Vec<AgentTrigger>,
}

impl VoiceAgentHandoff {
    pub fn new() -> Self {
        Self { triggers: Vec::new() }
    }

    pub fn update_triggers(&mut self, agent_triggers: &HashMap<String, Vec<String>>) {
        self.triggers.clear();
        for (slug, phrases) in agent_triggers {
            if !phrases.is_empty() {
                self.triggers.push(AgentTrigger {
                    phrases: phrases.iter().map(|p| p.to_lowercase()).collect(),
                    agent_name: slug.clone(),
                    agent_slug: slug.clone(),
                });
            }
        }
    }

    pub fn analyze(&self, transcript: &str) -> Option<HandoffAction> {
        let lower = transcript.to_lowercase();
        for trigger in &self.triggers {
            for phrase in &trigger.phrases {
                if let Some(idx) = lower.find(phrase) {
                    let remainder = transcript[idx + phrase.len()..].trim().to_string();
                    return Some(HandoffAction {
                        agent_slug: trigger.agent_slug.clone(),
                        agent_name: trigger.agent_name.clone(),
                        query: if remainder.is_empty() { transcript.to_string() } else { remainder },
                        trigger_phrase: phrase.clone(),
                    });
                }
            }
        }
        None
    }

    pub fn has_triggers(&self) -> bool {
        !self.triggers.is_empty()
    }

    pub fn clear(&mut self) {
        self.triggers.clear();
    }
}

impl Default for VoiceAgentHandoff {
    fn default() -> Self {
        Self::new()
    }
}

pub fn extract_agent_name(text: &str) -> Option<(String, String)> {
    lazy_static::lazy_static! {
        static ref AGENT_PATTERN: Regex = Regex::new(
            r"(?i)(?:hey|ask|tell|wake up)\s+(\w[\w\s]{0,20}?)(?:[,.:]|\s+to|\s+about|\s+can you|\s*$)"
        )
        .expect("invalid agent trigger regex");
    }
    if let Some(caps) = AGENT_PATTERN.captures(text) {
        let name = caps.get(1)?.as_str().trim().to_string();
        let remainder = text.replacen(caps.get(0)?.as_str(), "", 1).trim().to_string();
        Some((name, remainder))
    } else {
        None
    }
}
