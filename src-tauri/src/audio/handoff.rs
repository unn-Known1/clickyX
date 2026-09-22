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
        Self {
            triggers: Vec::new(),
        }
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
        // #50: match case-insensitively on the ORIGINAL string. Byte indices
        // derived from a lowercased copy misboundary non-ASCII text (e.g. "İ"),
        // which previously panicked/sliced mid-character.
        for trigger in &self.triggers {
            for phrase in &trigger.phrases {
                let Ok(pattern) = Regex::new(&format!("(?i){}", regex::escape(phrase))) else {
                    continue;
                };
                if let Some(m) = pattern.find(transcript) {
                    let remainder = transcript[m.end()..].trim().to_string();
                    return Some(HandoffAction {
                        agent_slug: trigger.agent_slug.clone(),
                        agent_name: trigger.agent_name.clone(),
                        query: if remainder.is_empty() {
                            transcript.to_string()
                        } else {
                            remainder
                        },
                        trigger_phrase: phrase.clone(),
                    });
                }
            }
        }
        None
    }
}

impl Default for VoiceAgentHandoff {
    fn default() -> Self {
        Self::new()
    }
}
