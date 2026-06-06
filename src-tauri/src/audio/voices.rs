use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceInfo {
    pub id: String,
    pub provider: String,
    pub name: String,
    pub description: String,
    pub accent_color: String,
    pub gender: String,
    pub style: String,
    pub language: String,
    pub tier: String,
}

pub fn get_voices_for_provider(provider: &str) -> Vec<VoiceInfo> {
    match provider.to_lowercase().as_str() {
        "elevenlabs" => elevenlabs_voices(),
        "cartesia" => cartesia_voices(),
        "aura" | "deepgramaura" => deepgram_aura_voices(),
        "openai_realtime" | "realtime" => openai_realtime_voices(),
        "edge" | "microsoftedge" => edge_voices(),
        "system" => system_voices(),
        _ => vec![],
    }
}

fn elevenlabs_voices() -> Vec<VoiceInfo> {
    vec![
        VoiceInfo {
            id: "21m00Tcm4TlvDq8ikWAM".into(),
            provider: "elevenlabs".into(),
            name: "Rachel".into(),
            description: "Calm, warm female narrator".into(),
            accent_color: "#4fc3f7".into(),
            gender: "female".into(),
            style: "narration".into(),
            language: "en-US".into(),
            tier: "standard".into(),
        },
        VoiceInfo {
            id: "AZnzlk1XvdvUeBnXmlld".into(),
            provider: "elevenlabs".into(),
            name: "Domi".into(),
            description: "Confident, energetic female".into(),
            accent_color: "#ab47bc".into(),
            gender: "female".into(),
            style: "energetic".into(),
            language: "en-US".into(),
            tier: "standard".into(),
        },
        VoiceInfo {
            id: "EXAVITQu4vr4xnSDxMaL".into(),
            provider: "elevenlabs".into(),
            name: "Bella".into(),
            description: "Soft, gentle female".into(),
            accent_color: "#66bb6a".into(),
            gender: "female".into(),
            style: "gentle".into(),
            language: "en-US".into(),
            tier: "standard".into(),
        },
        VoiceInfo {
            id: "ErXwobaYiN019PkySvjV".into(),
            provider: "elevenlabs".into(),
            name: "Antoni".into(),
            description: "Warm, friendly male".into(),
            accent_color: "#ffa726".into(),
            gender: "male".into(),
            style: "friendly".into(),
            language: "en-US".into(),
            tier: "standard".into(),
        },
        VoiceInfo {
            id: "VR6AewLTigWG4xSOukaG".into(),
            provider: "elevenlabs".into(),
            name: "Arnold".into(),
            description: "Deep, authoritative male".into(),
            accent_color: "#ef5350".into(),
            gender: "male".into(),
            style: "authoritative".into(),
            language: "en-US".into(),
            tier: "standard".into(),
        },
        VoiceInfo {
            id: "pNInz6obpgDQGcFmaJgB".into(),
            provider: "elevenlabs".into(),
            name: "Adam".into(),
            description: "Middle-aged, deep male".into(),
            accent_color: "#5c6bc0".into(),
            gender: "male".into(),
            style: "narrator".into(),
            language: "en-US".into(),
            tier: "standard".into(),
        },
        VoiceInfo {
            id: "TxGEqnHWrfWFTfGW9XjX".into(),
            provider: "elevenlabs".into(),
            name: "Josh".into(),
            description: "Young, clear male".into(),
            accent_color: "#26a69a".into(),
            gender: "male".into(),
            style: "clear".into(),
            language: "en-US".into(),
            tier: "standard".into(),
        },
        VoiceInfo {
            id: "yoZ06aMxZJJ28mfd3POQ".into(),
            provider: "elevenlabs".into(),
            name: "Sam".into(),
            description: "Raspy, dynamic male".into(),
            accent_color: "#ff7043".into(),
            gender: "male".into(),
            style: "dynamic".into(),
            language: "en-US".into(),
            tier: "standard".into(),
        },
    ]
}

fn cartesia_voices() -> Vec<VoiceInfo> {
    vec![
        VoiceInfo {
            id: "a0e99841-4380-4a51-bcb1-646b7c1c6b0b".into(),
            provider: "cartesia".into(),
            name: "Kate".into(),
            description: "Conversational British female".into(),
            accent_color: "#4fc3f7".into(),
            gender: "female".into(),
            style: "conversational".into(),
            language: "en-GB".into(),
            tier: "standard".into(),
        },
        VoiceInfo {
            id: "79a125e8-cd45-4c13-8a67-188112f4ea22".into(),
            provider: "cartesia".into(),
            name: "Sarah".into(),
            description: "Mature American female".into(),
            accent_color: "#ab47bc".into(),
            gender: "female".into(),
            style: "mature".into(),
            language: "en-US".into(),
            tier: "standard".into(),
        },
        VoiceInfo {
            id: "5ee9feff-9645-4e92-8667-86e92a3f3b74".into(),
            provider: "cartesia".into(),
            name: "Conor".into(),
            description: "Friendly Irish male".into(),
            accent_color: "#66bb6a".into(),
            gender: "male".into(),
            style: "friendly".into(),
            language: "en-IE".into(),
            tier: "standard".into(),
        },
        VoiceInfo {
            id: "ed1f6f7e-2a8c-4b5d-8c2e-7b5f7d6c5e4a".into(),
            provider: "cartesia".into(),
            name: "Tara".into(),
            description: "Calm, reassuring female".into(),
            accent_color: "#ffa726".into(),
            gender: "female".into(),
            style: "calm".into(),
            language: "en-US".into(),
            tier: "standard".into(),
        },
    ]
}

fn deepgram_aura_voices() -> Vec<VoiceInfo> {
    vec![
        VoiceInfo {
            id: "aura-asteria-en".into(),
            provider: "aura".into(),
            name: "Asteria".into(),
            description: "Warm, expressive female".into(),
            accent_color: "#4fc3f7".into(),
            gender: "female".into(),
            style: "expressive".into(),
            language: "en-US".into(),
            tier: "standard".into(),
        },
        VoiceInfo {
            id: "aura-luna-en".into(),
            provider: "aura".into(),
            name: "Luna".into(),
            description: "Soft, gentle female".into(),
            accent_color: "#ab47bc".into(),
            gender: "female".into(),
            style: "gentle".into(),
            language: "en-US".into(),
            tier: "standard".into(),
        },
        VoiceInfo {
            id: "aura-orion-en".into(),
            provider: "aura".into(),
            name: "Orion".into(),
            description: "Confident, clear male".into(),
            accent_color: "#66bb6a".into(),
            gender: "male".into(),
            style: "confident".into(),
            language: "en-US".into(),
            tier: "standard".into(),
        },
        VoiceInfo {
            id: "aura-arcas-en".into(),
            provider: "aura".into(),
            name: "Arcas".into(),
            description: "Deep, authoritative male".into(),
            accent_color: "#ffa726".into(),
            gender: "male".into(),
            style: "authoritative".into(),
            language: "en-US".into(),
            tier: "standard".into(),
        },
    ]
}

fn openai_realtime_voices() -> Vec<VoiceInfo> {
    vec![
        VoiceInfo {
            id: "alloy".into(),
            provider: "openai_realtime".into(),
            name: "Alloy".into(),
            description: "Neutral, balanced voice".into(),
            accent_color: "#4fc3f7".into(),
            gender: "neutral".into(),
            style: "neutral".into(),
            language: "en-US".into(),
            tier: "standard".into(),
        },
        VoiceInfo {
            id: "echo".into(),
            provider: "openai_realtime".into(),
            name: "Echo".into(),
            description: "Warm, conversational male".into(),
            accent_color: "#ab47bc".into(),
            gender: "male".into(),
            style: "conversational".into(),
            language: "en-US".into(),
            tier: "standard".into(),
        },
        VoiceInfo {
            id: "shimmer".into(),
            provider: "openai_realtime".into(),
            name: "Shimmer".into(),
            description: "Bright, energetic female".into(),
            accent_color: "#66bb6a".into(),
            gender: "female".into(),
            style: "energetic".into(),
            language: "en-US".into(),
            tier: "standard".into(),
        },
        VoiceInfo {
            id: "nova".into(),
            provider: "openai_realtime".into(),
            name: "Nova".into(),
            description: "Confident, smooth female".into(),
            accent_color: "#ffa726".into(),
            gender: "female".into(),
            style: "smooth".into(),
            language: "en-US".into(),
            tier: "standard".into(),
        },
        VoiceInfo {
            id: "onyx".into(),
            provider: "openai_realtime".into(),
            name: "Onyx".into(),
            description: "Deep, gravelly male".into(),
            accent_color: "#ef5350".into(),
            gender: "male".into(),
            style: "deep".into(),
            language: "en-US".into(),
            tier: "standard".into(),
        },
        VoiceInfo {
            id: "fable".into(),
            provider: "openai_realtime".into(),
            name: "Fable".into(),
            description: "Expressive British narrator".into(),
            accent_color: "#5c6bc0".into(),
            gender: "neutral".into(),
            style: "narrator".into(),
            language: "en-GB".into(),
            tier: "standard".into(),
        },
    ]
}

fn edge_voices() -> Vec<VoiceInfo> {
    vec![
        VoiceInfo {
            id: "en-US-AriaNeural".into(),
            provider: "edge".into(),
            name: "Aria".into(),
            description: "Warm American female (Edge)".into(),
            accent_color: "#4fc3f7".into(),
            gender: "female".into(),
            style: "warm".into(),
            language: "en-US".into(),
            tier: "free".into(),
        },
        VoiceInfo {
            id: "en-US-GuyNeural".into(),
            provider: "edge".into(),
            name: "Guy".into(),
            description: "Mature American male (Edge)".into(),
            accent_color: "#ab47bc".into(),
            gender: "male".into(),
            style: "mature".into(),
            language: "en-US".into(),
            tier: "free".into(),
        },
        VoiceInfo {
            id: "en-US-JennyNeural".into(),
            provider: "edge".into(),
            name: "Jenny".into(),
            description: "Friendly American female (Edge)".into(),
            accent_color: "#66bb6a".into(),
            gender: "female".into(),
            style: "friendly".into(),
            language: "en-US".into(),
            tier: "free".into(),
        },
        VoiceInfo {
            id: "en-GB-RyanNeural".into(),
            provider: "edge".into(),
            name: "Ryan".into(),
            description: "British male narrator (Edge)".into(),
            accent_color: "#ffa726".into(),
            gender: "male".into(),
            style: "narrator".into(),
            language: "en-GB".into(),
            tier: "free".into(),
        },
    ]
}

fn system_voices() -> Vec<VoiceInfo> {
    vec![
        VoiceInfo {
            id: "system_default".into(),
            provider: "system".into(),
            name: "System Voice".into(),
            description: "Built-in operating system voice".into(),
            accent_color: "#66bb6a".into(),
            gender: "neutral".into(),
            style: "default".into(),
            language: "en-US".into(),
            tier: "free".into(),
        }
    ]
}

pub fn get_voice_by_id(voice_id: &str) -> Option<VoiceInfo> {
    for provider in &["elevenlabs", "cartesia", "aura", "openai_realtime", "edge", "system"] {
        for voice in get_voices_for_provider(provider) {
            if voice.id == voice_id {
                return Some(voice);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_elevenlabs_voices_non_empty() {
        let voices = elevenlabs_voices();
        assert!(!voices.is_empty());
        assert!(voices.iter().any(|v| v.id == "21m00Tcm4TlvDq8ikWAM"));
    }

    #[test]
    fn test_get_voices_for_provider_elevenlabs() {
        let v = get_voices_for_provider("elevenlabs");
        assert!(!v.is_empty());
        assert!(v.iter().all(|voice| voice.provider == "elevenlabs"));
    }

    #[test]
    fn test_get_voices_for_provider_cartesia() {
        let v = get_voices_for_provider("cartesia");
        assert!(!v.is_empty());
    }

    #[test]
    fn test_get_voices_for_provider_unknown() {
        let v = get_voices_for_provider("unknown_provider");
        assert!(v.is_empty());
    }

    #[test]
    fn test_voice_info_has_accent_color() {
        for provider in &["elevenlabs", "cartesia", "aura", "openai_realtime", "edge", "system"] {
            for v in get_voices_for_provider(provider) {
                assert!(v.accent_color.starts_with("#"));
            }
        }
    }

    #[test]
    fn test_get_voice_by_id() {
        let v = get_voice_by_id("21m00Tcm4TlvDq8ikWAM");
        assert!(v.is_some());
        assert_eq!(v.unwrap().name, "Rachel");
    }

    #[test]
    fn test_get_voice_by_id_unknown() {
        let v = get_voice_by_id("not_a_voice");
        assert!(v.is_none());
    }
}
