//! TypeSafe Jev System-One decision provider.
//!
//! Jev is NOT a chat LLM: `state + typed questions` → `choice / noul / score`
//! (lowercase wire types) with calibrated probabilities.
//!
//! Surfaces (verified, see JEV_JARVIS_IMPLEMENTATION_REPORT.md rev.2 §1.1):
//! - Direct: `POST https://api.typesafe.ai/v1/systemone`
//!   models `jev-latest`, `jev-1.13.0`, `jev-preview`
//! - OpenRouter: `POST https://openrouter.ai/api/alpha/decisions`
//!   (compat `https://openrouter.ai/api/v1/systemone`)
//!   request models `typesafe/jev-1.13`, `~typesafe/jev-latest`
//! - Bocha (CN): `POST https://jev.bocha.cn/v1/systemone` model `bocha-jev-v1`
//! - Vercel: `POST https://ai-gateway.vercel.sh/typesafe/v1/systemone`
//!   model `typesafe-ai/jev`
//! - Zen: `POST https://opencode.ai/zen/v1/systemone` model `jev-1.13`
//!   (limited-free `jev-1.13-free`, Zen only)
//!
//! Store the (provider, base_url, model) triple — never a bare model string.

use std::collections::BTreeMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::{AiError, ChatMessage};

/// Price: $0.042 / 1M input tokens, output free.
pub const JEV_PRICE_PER_M_INPUT: f64 = 0.042;

/// Hard limits: 64k `state + all-questions` AND 32k `state + longest-single`.
pub const JEV_MAX_TOTAL_TOKENS: usize = 64_000;
pub const JEV_MAX_SINGLE_TOKENS: usize = 32_000;

/// Rough token estimate (chars / 4) for pre-flight limit checks.
pub fn estimate_tokens(s: &str) -> usize {
    s.len().div_ceil(4)
}

pub fn jev_cost_usd(input_tokens: u64) -> f64 {
    input_tokens as f64 * JEV_PRICE_PER_M_INPUT / 1_000_000.0
}

// ── Config ────────────────────────────────────────────────────────────────────

/// Jev connection triple + key. `api_key` lives in the OS keychain when
/// available (see `secret_store`); the file copy stays empty after migration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct JevConfig {
    /// Preset id: `openrouter` | `typesafe` | `bocha` | `vercel` | `zen` | `custom`.
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub api_key: Option<String>,
}

impl Default for JevConfig {
    fn default() -> Self {
        Self {
            provider: "openrouter".into(),
            base_url: "https://openrouter.ai/api/alpha/decisions".into(),
            model: "typesafe/jev-1.13".into(),
            api_key: None,
        }
    }
}

/// Merge a partial JSON object into the current config.
/// Empty-string values NEVER overwrite (guard against `""` wipes).
pub fn merge_jev_config(current: &JevConfig, partial: &serde_json::Value) -> JevConfig {
    let mut config = current.clone();
    if let Some(obj) = partial.as_object() {
        if let Some(v) = obj.get("provider").and_then(|v| v.as_str()) {
            if !v.is_empty() {
                config.provider = v.to_string();
            }
        }
        if let Some(v) = obj.get("base_url").and_then(|v| v.as_str()) {
            if !v.is_empty() {
                config.base_url = v.to_string();
            }
        }
        if let Some(v) = obj.get("model").and_then(|v| v.as_str()) {
            if !v.is_empty() {
                config.model = v.to_string();
            }
        }
        if let Some(v) = obj.get("api_key").and_then(|v| v.as_str()) {
            // Explicit empty string clears the key (user-initiated); missing key = keep.
            config.api_key = if v.is_empty() {
                None
            } else {
                Some(v.to_string())
            };
        }
    }
    config
}

/// S-MAJ-6: `base_url` receives `Authorization: Bearer <key>` — explicit
/// http(s) only, and plain `http://` is allowed ONLY for loopback hosts
/// (local dev/proxy). Anything else must be `https://` so keys never travel
/// in cleartext.
pub fn validate_jev_base_url(base_url: &str) -> Result<(), String> {
    let lower = base_url.trim().to_ascii_lowercase();
    if let Some(_rest) = lower.strip_prefix("https://") {
        Ok(())
    } else if let Some(rest) = lower.strip_prefix("http://") {
        if http_authority_is_loopback(rest) {
            Ok(())
        } else {
            Err(format!(
                "refusing non-local http jev_base_url (use https, or localhost for dev): {base_url}"
            ))
        }
    } else {
        Err(format!(
            "refusing jev_base_url without explicit http(s) scheme: {base_url}"
        ))
    }
}

/// True when the URL authority after `http://` is a loopback host:
/// `localhost`, `loopback`, `127.0.0.0/8`, or `::1` (bracketed or bare),
/// with optional `:port`. Case-insensitive; userinfo is stripped.
pub fn http_authority_is_loopback(after_scheme: &str) -> bool {
    let auth = after_scheme.split(['/', '?', '#']).next().unwrap_or("");
    let auth = auth.rsplit('@').next().unwrap_or(auth);
    let host = if let Some(rest) = auth.strip_prefix('[') {
        // IPv6 literal: [::1] or [::1]:port
        rest.split(']').next().unwrap_or("")
    } else if auth.matches(':').count() == 1 {
        let (h, p) = auth.split_at(auth.rfind(':').unwrap_or(0));
        if !p.is_empty() && p[1..].chars().all(|c| c.is_ascii_digit()) {
            h
        } else {
            auth
        }
    } else {
        auth
    };
    let host = host.trim_end_matches('.');
    host.eq_ignore_ascii_case("localhost")
        || host.eq_ignore_ascii_case("loopback")
        || host == "127.0.0.1"
        || host.starts_with("127.")
        || host == "::1"
}

// ── Presets ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JevPreset {
    pub id: &'static str,
    pub label: &'static str,
    pub base_url: &'static str,
    pub model: &'static str,
    /// When true the UI must show a data-residency warning before testing.
    pub residency_warning: bool,
}

pub fn jev_presets() -> Vec<JevPreset> {
    vec![
        JevPreset {
            id: "openrouter",
            label: "OpenRouter Decisions",
            base_url: "https://openrouter.ai/api/alpha/decisions",
            model: "typesafe/jev-1.13",
            residency_warning: false,
        },
        JevPreset {
            id: "typesafe",
            label: "TypeSafe Direct",
            base_url: "https://api.typesafe.ai/v1/systemone",
            model: "jev-1.13.0",
            residency_warning: false,
        },
        JevPreset {
            id: "bocha",
            label: "Bocha (CN)",
            base_url: "https://jev.bocha.cn/v1/systemone",
            model: "bocha-jev-v1",
            residency_warning: true,
        },
        JevPreset {
            id: "vercel",
            label: "Vercel AI Gateway",
            base_url: "https://ai-gateway.vercel.sh/typesafe/v1/systemone",
            model: "typesafe-ai/jev",
            residency_warning: false,
        },
        JevPreset {
            id: "zen",
            label: "OpenCode Zen",
            base_url: "https://opencode.ai/zen/v1/systemone",
            model: "jev-1.13",
            residency_warning: false,
        },
    ]
}

// ── Wire types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JevDecideRequest {
    pub model: String,
    pub state: serde_json::Value,
    pub questions: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct JevUsage {
    #[serde(default)]
    pub input_tokens: u64,
    #[serde(default)]
    pub output_tokens: u64,
    /// OpenRouter-only. Direct TypeSafe responses carry no `cost`.
    #[serde(default)]
    pub cost: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JevDecideResponse {
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub provider: Option<String>,
    pub answers: BTreeMap<String, serde_json::Value>,
    #[serde(default)]
    pub usage: Option<JevUsage>,
}

// ── Question builders (validated) ─────────────────────────────────────────────

/// `noul`: criteria optional. Returns `{type:"noul", instructions, criteria?}`.
pub fn noul_question(
    instructions: &str,
    criteria: Option<BTreeMap<String, String>>,
) -> Result<serde_json::Value, String> {
    if instructions.trim().is_empty() {
        return Err("noul instructions must not be empty".into());
    }
    let mut q = serde_json::json!({"type": "noul", "instructions": instructions});
    if let Some(c) = criteria {
        q["criteria"] = serde_json::to_value(&c).map_err(|e| e.to_string())?;
    }
    Ok(q)
}

/// `choice`: criteria REQUIRED (≤255 entries). Always include an
/// `other`/`none` escape hatch at the call site — never threshold a Choice
/// like a Noul.
pub fn choice_question(
    instructions: &str,
    criteria: &BTreeMap<String, String>,
) -> Result<serde_json::Value, String> {
    if instructions.trim().is_empty() {
        return Err("choice instructions must not be empty".into());
    }
    if criteria.is_empty() {
        return Err("choice criteria is required (min 1 entry)".into());
    }
    if criteria.len() > 255 {
        return Err(format!(
            "choice criteria exceeds 255 entries (got {})",
            criteria.len()
        ));
    }
    Ok(serde_json::json!({
        "type": "choice",
        "instructions": instructions,
        "criteria": criteria,
    }))
}

/// `score`: criteria REQUIRED, 2–10 ordered labels.
/// Returns 0-indexed question; the caller maps `0→1 … n-1→n` for display and
/// gates on BANDS (`score ≥ lo ∧ confidence ≥ min`), never `==`.
pub fn score_question(
    instructions: &str,
    criteria: &[String],
) -> Result<serde_json::Value, String> {
    if instructions.trim().is_empty() {
        return Err("score instructions must not be empty".into());
    }
    if criteria.len() < 2 || criteria.len() > 10 {
        return Err(format!(
            "score criteria requires 2–10 ordered labels (got {})",
            criteria.len()
        ));
    }
    Ok(serde_json::json!({
        "type": "score",
        "instructions": instructions,
        "criteria": criteria,
    }))
}

/// Validate a full questions map: `minProperties 1`, known `type` per entry.
pub fn validate_questions(questions: &BTreeMap<String, serde_json::Value>) -> Result<(), String> {
    if questions.is_empty() {
        return Err("questions requires at least 1 entry (minProperties 1)".into());
    }
    for (id, q) in questions {
        let t = q
            .get("type")
            .and_then(|t| t.as_str())
            .ok_or_else(|| format!("question '{id}' is missing string field 'type'"))?;
        match t {
            "noul" => {
                if q.get("instructions").and_then(|v| v.as_str()).is_none() {
                    return Err(format!("noul question '{id}' needs 'instructions'"));
                }
            }
            "choice" => {
                let n = q
                    .get("criteria")
                    .and_then(|c| c.as_object())
                    .map(|o| o.len())
                    .unwrap_or(0);
                if n == 0 {
                    return Err(format!("choice question '{id}' needs non-empty 'criteria'"));
                }
                if n > 255 {
                    return Err(format!("choice question '{id}' exceeds 255 criteria"));
                }
            }
            "score" => {
                let n = q
                    .get("criteria")
                    .and_then(|c| c.as_array())
                    .map(|a| a.len())
                    .unwrap_or(0);
                if !(2..=10).contains(&n) {
                    return Err(format!(
                        "score question '{id}' needs 2–10 criteria (got {n})"
                    ));
                }
            }
            other => return Err(format!("question '{id}' has unknown type '{other}'")),
        }
    }
    Ok(())
}

/// Validate that each echoed answer matches its question `type`.
pub fn validate_answer_echo(
    questions: &BTreeMap<String, serde_json::Value>,
    answers: &BTreeMap<String, serde_json::Value>,
) -> Result<(), String> {
    for (id, q) in questions {
        let want = q.get("type").and_then(|t| t.as_str()).unwrap_or("");
        let ans = answers
            .get(id)
            .ok_or_else(|| format!("missing answer for question '{id}'"))?;
        let got = ans.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if want != got {
            return Err(format!(
                "answer type mismatch for '{id}': question is '{want}', answer is '{got}'"
            ));
        }
    }
    Ok(())
}

/// Build the dependent rank question over N drafts (call 2).
/// Always includes an `other` escape hatch so the judge can abstain.
pub fn build_rank_question(drafts: &[String]) -> Result<serde_json::Value, String> {
    if drafts.is_empty() {
        return Err("rank needs at least 1 draft".into());
    }
    let mut criteria = BTreeMap::new();
    for (i, d) in drafts.iter().enumerate() {
        criteria.insert(
            format!("draft_{i}"),
            d.chars().take(500).collect::<String>(),
        );
    }
    // Always include an escape hatch so the judge can abstain.
    criteria.insert("other".into(), "None of the drafts is acceptable".into());
    choice_question("Pick the best draft reply.", &criteria)
}

/// Concentration statistic — NOT P(correct). `(n·max − 1) / (n − 1)`.
pub fn concentration_stat(probabilities: &BTreeMap<String, f64>) -> f64 {
    let n = probabilities.len() as f64;
    if n <= 1.0 {
        return 1.0;
    }
    let max = probabilities.values().cloned().fold(0.0_f64, f64::max);
    ((n * max - 1.0) / (n - 1.0)).clamp(0.0, 1.0)
}

/// Weighted-mean score from a `{"0": p0, …}` distribution → `0..n-1`.
pub fn weighted_score(probabilities: &BTreeMap<String, f64>) -> f64 {
    let mut num = 0.0;
    let mut den = 0.0;
    for (k, p) in probabilities {
        if let Ok(idx) = k.parse::<f64>() {
            num += idx * p;
            den += p;
        }
    }
    if den <= 0.0 {
        0.0
    } else {
        num / den
    }
}

/// Band gate for 0-indexed scores mapped to 1–9 display: `score ≥ lo ∧ conf ≥ min`.
pub fn score_band_hit(score_0idx: f64, confidence: f64, lo_1idx: f64, min_conf: f64) -> bool {
    score_0idx + 1.0 >= lo_1idx && confidence >= min_conf
}

/// Pre-flight token-limit check. Returns `max_tokens_exceeded` style error so
/// callers can split-and-retry instead of burning a request.
pub fn check_limits(
    state: &serde_json::Value,
    questions: &BTreeMap<String, serde_json::Value>,
) -> Result<(), String> {
    let state_s = serde_json::to_string(state).unwrap_or_default();
    let state_tok = estimate_tokens(&state_s);
    let mut longest: usize = 0;
    let mut total = state_tok;
    for q in questions.values() {
        let s = serde_json::to_string(q).unwrap_or_default();
        let t = estimate_tokens(&s);
        longest = longest.max(t);
        total += t;
    }
    if state_tok + longest > JEV_MAX_SINGLE_TOKENS {
        return Err(format!(
            "max_tokens_exceeded: state+longest-question ~{tok} tokens > {lim} (split state or shorten the question)",
            tok = state_tok + longest,
            lim = JEV_MAX_SINGLE_TOKENS
        ));
    }
    if total > JEV_MAX_TOTAL_TOKENS {
        return Err(format!(
            "max_tokens_exceeded: state+all-questions ~{total} tokens > {lim} (batch fewer questions per call)",
            lim = JEV_MAX_TOTAL_TOKENS
        ));
    }
    Ok(())
}

// ── Error helpers ─────────────────────────────────────────────────────────────

/// Strip anything key-like before an error reaches UI/bridge/logs.
pub fn declassify_jev_error(msg: &str) -> String {
    // Never echo bearer tokens or sk-* fragments.
    let mut out = msg.to_string();
    for prefix in ["sk-ant-", "sk-", "xox", "Bearer "] {
        while let Some(idx) = out.find(prefix) {
            let end = out[idx..]
                .find(|c: char| c.is_whitespace() || c == '"' || c == '\'')
                .map(|e| idx + e)
                .unwrap_or(out.len());
            // Keep the prefix kind, drop the secret tail.
            let keep = if prefix == "Bearer " {
                "Bearer "
            } else {
                prefix
            };
            out.replace_range(idx..end.min(idx + 64), &format!("{keep}[redacted]"));
            if out.len() > 2048 {
                break;
            }
        }
        if out.len() > 4096 {
            out.truncate(4096);
        }
    }
    // S-MIN-12: generic api_key-adjacent values (non-sk key formats can
    // otherwise echo into bridge/UI errors via `key=...` / `"api_key":"..."`).
    for (pat, rep) in [
        (
            r#"(?i)(api[_-]?key\s*[:=]\s*["']?)([^"'\s,};&\]]{2,})"#,
            "${1}[redacted]",
        ),
        (
            r"(?i)\b(key|token)\s*=\s*([A-Za-z0-9\-._~+/=]{8,})",
            "$1=[redacted]",
        ),
    ] {
        if let Ok(re) = regex::Regex::new(pat) {
            out = re.replace_all(&out, rep).into_owned();
        }
    }
    if out.len() > 4096 {
        out.truncate(4096);
    }
    out
}

fn map_status(status: reqwest::StatusCode, body: &str) -> AiError {
    let body = declassify_jev_error(&body.chars().take(500).collect::<String>());
    match status.as_u16() {
        401 | 403 => AiError::Config(format!(
            "jev auth failed ({status}): {body} (no-retry: check key)"
        )),
        400 | 422 => AiError::Config(format!("jev bad request ({status}): {body} (fix shape)")),
        429 => AiError::Api(format!(
            "jev rate-limited (429): {body} (backoff + Retry-After)"
        )),
        529 => AiError::Api(format!(
            "jev overloaded (529): {body} (backoff + Retry-After)"
        )),
        _ => AiError::Api(format!("jev API error ({status}): {body}")),
    }
}

// ── Client ────────────────────────────────────────────────────────────────────

pub struct JevClient {
    api_key: String,
    base_url: String,
    model: String,
    http: reqwest::Client,
}

impl JevClient {
    pub fn new(config: &JevConfig) -> Result<Self, AiError> {
        let api_key = config
            .api_key
            .clone()
            .filter(|k| !k.is_empty())
            .ok_or_else(|| AiError::Config("Jev API key not configured".into()))?;
        validate_jev_base_url(&config.base_url).map_err(AiError::Config)?;
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| AiError::Network(e.to_string()))?;
        Ok(Self {
            api_key,
            base_url: config.base_url.trim_end_matches('/').to_string(),
            model: config.model.clone(),
            http,
        })
    }

    pub fn decisions_url(&self) -> String {
        self.base_url.clone()
    }

    fn body(
        &self,
        state: serde_json::Value,
        questions: BTreeMap<String, serde_json::Value>,
        model_override: Option<&str>,
    ) -> Result<serde_json::Value, AiError> {
        validate_questions(&questions).map_err(AiError::Config)?;
        check_limits(&state, &questions).map_err(AiError::Config)?;
        Ok(serde_json::json!({
            "model": model_override.unwrap_or(&self.model),
            "state": state,
            "questions": questions,
        }))
    }

    /// Single batched call for all INDEPENDENT questions.
    /// Dependent rank calls go second via [`JevClient::decide_rank`].
    pub async fn decide(
        &self,
        state: serde_json::Value,
        questions: BTreeMap<String, serde_json::Value>,
    ) -> Result<JevDecideResponse, AiError> {
        self.decide_with_model(state, questions, None).await
    }

    pub async fn decide_with_model(
        &self,
        state: serde_json::Value,
        questions: BTreeMap<String, serde_json::Value>,
        model_override: Option<&str>,
    ) -> Result<JevDecideResponse, AiError> {
        let body = self.body(state, questions.clone(), model_override)?;
        let resp = self
            .http
            .post(self.decisions_url())
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AiError::Network(declassify_jev_error(&e.to_string())))?;
        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| AiError::Decode(declassify_jev_error(&e.to_string())))?;
        if !status.is_success() {
            return Err(map_status(status, &text));
        }
        let parsed: JevDecideResponse =
            serde_json::from_str(&text).map_err(|e| AiError::Decode(e.to_string()))?;
        validate_answer_echo(&questions, &parsed.answers).map_err(AiError::Decode)?;
        Ok(parsed)
    }

    /// Convenience: rank N drafts with a dependent second call.
    /// `drafts` are draft texts; returns (winner_idx, sorted desc).
    pub async fn decide_rank(
        &self,
        state: serde_json::Value,
        drafts: &[String],
    ) -> Result<(usize, Vec<(usize, f64)>), AiError> {
        if drafts.is_empty() {
            return Err(AiError::Config("decide_rank needs at least 1 draft".into()));
        }
        if drafts.len() == 1 {
            return Ok((0, vec![(0, 1.0)]));
        }
        let q = build_rank_question(drafts).map_err(AiError::Config)?;
        let mut qs = BTreeMap::new();
        qs.insert("rank".into(), q);
        let resp = self.decide(state, qs).await?;
        let ans = resp
            .answers
            .get("rank")
            .ok_or_else(|| AiError::Decode("missing rank answer".into()))?;
        let choice = ans
            .get("choice")
            .and_then(|c| c.as_str())
            .unwrap_or("draft_0");
        let probs: BTreeMap<String, f64> = ans
            .get("probabilities")
            .and_then(|p| serde_json::from_value(p.clone()).ok())
            .unwrap_or_default();
        let mut ranked: Vec<(usize, f64)> = drafts
            .iter()
            .enumerate()
            .map(|(i, _)| (i, probs.get(&format!("draft_{i}")).cloned().unwrap_or(0.0)))
            .collect();
        ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        let winner = choice
            .strip_prefix("draft_")
            .and_then(|n| n.parse::<usize>().ok())
            .unwrap_or(ranked.first().map(|r| r.0).unwrap_or(0));
        Ok((winner, ranked))
    }
}

// ── ChatMessage helpers (Jarvis state building) ───────────────────────────────

/// Build a Jev `state` object from chat context. Keeps the wire shape in one place.
pub fn build_judge_state(
    messages: &[ChatMessage],
    background: &serde_json::Value,
    history: &[ChatMessage],
) -> serde_json::Value {
    // Cap at 10 recent messages to respect token limits; callers split on overflow.
    let recent: Vec<&ChatMessage> = messages.iter().rev().take(10).rev().collect();
    let hist: Vec<&ChatMessage> = history.iter().rev().take(30).rev().collect();
    serde_json::json!({
        "messages": recent,
        "background": background,
        "history": hist,
    })
}

// Small helper for the cost test below (keeps response struct minimal).
impl JevDecideResponse {
    #[cfg(test)]
    fn cost_is_some(&self) -> bool {
        self.usage.as_ref().and_then(|u| u.cost).is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_criteria() -> BTreeMap<String, String> {
        BTreeMap::from([
            ("reply".into(), "Send a reply".into()),
            ("wait".into(), "Wait for more context".into()),
            ("other".into(), "None of the above".into()),
        ])
    }

    #[test]
    fn test_jev_config_default_triple() {
        let c = JevConfig::default();
        assert_eq!(c.provider, "openrouter");
        assert!(c.base_url.starts_with("https://"));
        assert_eq!(c.model, "typesafe/jev-1.13");
        assert!(c.api_key.is_none());
    }

    #[test]
    fn test_merge_jev_config_empty_never_overwrites() {
        let cur = JevConfig {
            provider: "typesafe".into(),
            base_url: "https://api.typesafe.ai/v1/systemone".into(),
            model: "jev-1.13.0".into(),
            api_key: Some("k".into()),
        };
        let partial = serde_json::json!({"provider": "", "base_url": "", "model": ""});
        let merged = merge_jev_config(&cur, &partial);
        assert_eq!(merged.provider, "typesafe");
        assert_eq!(merged.base_url, "https://api.typesafe.ai/v1/systemone");
        assert_eq!(merged.model, "jev-1.13.0");
        assert_eq!(merged.api_key.as_deref(), Some("k"));
    }

    #[test]
    fn test_merge_jev_config_sets_nonempty() {
        let cur = JevConfig::default();
        let partial = serde_json::json!({"provider": "zen", "model": "jev-1.13"});
        let merged = merge_jev_config(&cur, &partial);
        assert_eq!(merged.provider, "zen");
        assert_eq!(merged.model, "jev-1.13");
    }

    #[test]
    fn test_merge_jev_config_empty_key_clears() {
        let cur = JevConfig {
            api_key: Some("k".into()),
            ..JevConfig::default()
        };
        let merged = merge_jev_config(&cur, &serde_json::json!({"api_key": ""}));
        assert!(merged.api_key.is_none());
    }

    #[test]
    fn test_validate_jev_base_url_accepts_http() {
        assert!(validate_jev_base_url("https://api.typesafe.ai/v1/systemone").is_ok());
        assert!(validate_jev_base_url("http://localhost:32123").is_ok());
        // S-MAJ-6: loopback http stays allowed (dev/proxy).
        assert!(validate_jev_base_url("http://127.0.0.1:8080/v1").is_ok());
        assert!(validate_jev_base_url("http://[::1]:8080/v1").is_ok());
        assert!(validate_jev_base_url("HTTP://LOCALHOST/").is_ok());
    }

    #[test]
    fn test_validate_jev_base_url_rejects_remote_http() {
        // S-MAJ-6: cleartext to non-loopback hosts would leak the Bearer key.
        for bad in [
            "http://api.typesafe.ai/v1/systemone",
            "http://example.com:8080/x",
            "http://192.168.1.1/v1",
            "http://10.0.0.5/",
            "http://evil.example",
        ] {
            assert!(
                validate_jev_base_url(bad).is_err(),
                "should reject remote http {bad}"
            );
        }
    }

    #[test]
    fn test_validate_jev_base_url_rejects_schemes() {
        for bad in [
            "file:///etc/passwd",
            "gopher://x",
            "ftp://x",
            "",
            "api.typesafe.ai/v1",
        ] {
            assert!(validate_jev_base_url(bad).is_err(), "should reject {bad}");
        }
    }

    #[test]
    fn test_noul_bare_ok_criteria_optional() {
        let q = noul_question("Should we reply?", None).unwrap();
        assert_eq!(q["type"], "noul");
        assert!(q.get("criteria").is_none());
    }

    #[test]
    fn test_choice_requires_criteria() {
        assert!(choice_question("Pick", &BTreeMap::new()).is_err());
        assert!(choice_question("Pick", &sample_criteria()).is_ok());
    }

    #[test]
    fn test_score_requires_2_to_10() {
        assert!(score_question("Danger?", &["a".into()]).is_err());
        assert!(score_question("Danger?", &["a".into(), "b".into()]).is_ok());
        let eleven: Vec<String> = (0..11).map(|i| format!("l{i}")).collect();
        assert!(score_question("Danger?", &eleven).is_err());
    }

    #[test]
    fn test_validate_questions_min_1_and_unknown_type() {
        assert!(validate_questions(&BTreeMap::new()).is_err());
        let mut qs = BTreeMap::new();
        qs.insert("x".into(), serde_json::json!({"type": "boolean"}));
        assert!(validate_questions(&qs).is_err());
    }

    #[test]
    fn test_validate_answer_echo_mismatch() {
        let mut qs = BTreeMap::new();
        qs.insert(
            "a".into(),
            serde_json::json!({"type": "noul", "instructions": "x"}),
        );
        let mut ans = BTreeMap::new();
        ans.insert("a".into(), serde_json::json!({"type": "choice"}));
        assert!(validate_answer_echo(&qs, &ans).is_err());
    }

    #[test]
    fn test_concentration_stat_bounds() {
        let probs: BTreeMap<String, f64> =
            BTreeMap::from([("a".into(), 0.7), ("b".into(), 0.2), ("c".into(), 0.1)]);
        let c = concentration_stat(&probs);
        assert!((0.0..=1.0).contains(&c));
        // Uniform → 0, peaked → high.
        let uni: BTreeMap<String, f64> = BTreeMap::from([("a".into(), 0.5), ("b".into(), 0.5)]);
        assert!(concentration_stat(&uni) < 0.01);
    }

    #[test]
    fn test_weighted_score_mean() {
        let probs: BTreeMap<String, f64> = BTreeMap::from([("0".into(), 0.2), ("1".into(), 0.8)]);
        assert!((weighted_score(&probs) - 0.8).abs() < 1e-9);
    }

    #[test]
    fn test_score_band_hit_uses_1idx_display() {
        // 0-idx 5.0 == display 6 → hits lo=6 @ conf ok.
        assert!(score_band_hit(5.0, 0.7, 6.0, 0.6));
        assert!(!score_band_hit(5.0, 0.5, 6.0, 0.6));
        assert!(!score_band_hit(4.0, 0.9, 6.0, 0.6));
    }

    #[test]
    fn test_check_limits_flags_overflow() {
        let big_state = serde_json::json!({"t": "x".repeat(200_000)});
        let mut qs = BTreeMap::new();
        qs.insert(
            "q".into(),
            serde_json::json!({"type": "noul", "instructions": "s"}),
        );
        let err = check_limits(&big_state, &qs).unwrap_err();
        assert!(err.contains("max_tokens_exceeded"));
    }

    #[test]
    fn test_response_parse_direct_shape_no_cost() {
        let raw = r#"{"model":"jev-1.13.0","answers":{"should_reply":{"type":"noul","noul":0.82}},"usage":{"input_tokens":476,"output_tokens":12}}"#;
        let resp: JevDecideResponse = serde_json::from_str(raw).unwrap();
        assert!(resp.usage.as_ref().unwrap().cost.is_none());
        assert_eq!(resp.answers["should_reply"]["noul"], 0.82);
    }

    #[test]
    fn test_response_parse_openrouter_shape_with_cost() {
        let raw = r#"{"id":"gen-1","provider":"typesafe","model":"typesafe/jev-1.13-20260917","answers":{"intent":{"type":"choice","choice":"reply","probabilities":{"reply":0.8},"confidence":0.7}},"usage":{"input_tokens":500,"output_tokens":20,"cost":0.000021}}"#;
        let resp: JevDecideResponse = serde_json::from_str(raw).unwrap();
        assert!(resp.cost_is_some());
    }

    #[test]
    fn test_declassify_strips_keys() {
        let msg = r#"auth failed with sk-ant-secret123 and Bearer tokengoeshere"#;
        let out = declassify_jev_error(msg);
        assert!(!out.contains("secret123"));
        assert!(out.contains("[redacted]"));
    }

    #[test]
    fn test_declassify_strips_api_key_adjacent() {
        // S-MIN-12: non-sk key formats must not echo into UI/bridge errors.
        let msg = r#"request failed: {"api_key":"hunter2-secret"} after key=abcdefgh1234"#;
        let out = declassify_jev_error(msg);
        assert!(!out.contains("hunter2-secret"), "leaked: {out}");
        assert!(!out.contains("abcdefgh1234"), "leaked: {out}");
        assert!(out.contains("[redacted]"));
    }

    #[test]
    fn test_cost_math() {
        // 476 tokens → $0.000019992.
        let c = jev_cost_usd(476);
        assert!((c - 0.000019992).abs() < 1e-12);
    }

    #[test]
    fn test_client_requires_key_and_valid_url() {
        let no_key = JevConfig::default();
        assert!(JevClient::new(&no_key).is_err());
        let mut bad = JevConfig {
            api_key: Some("k".into()),
            ..JevConfig::default()
        };
        bad.base_url = "file:///x".into();
        assert!(JevClient::new(&bad).is_err());
    }

    #[test]
    fn test_presets_have_exact_paths() {
        let presets = jev_presets();
        let by_id = |id: &str| presets.iter().find(|p| p.id == id).unwrap().base_url;
        assert_eq!(
            by_id("openrouter"),
            "https://openrouter.ai/api/alpha/decisions"
        );
        assert_eq!(by_id("typesafe"), "https://api.typesafe.ai/v1/systemone");
        assert_eq!(by_id("bocha"), "https://jev.bocha.cn/v1/systemone");
        assert_eq!(
            by_id("vercel"),
            "https://ai-gateway.vercel.sh/typesafe/v1/systemone"
        );
        assert_eq!(by_id("zen"), "https://opencode.ai/zen/v1/systemone");
        assert!(
            presets
                .iter()
                .find(|p| p.id == "bocha")
                .unwrap()
                .residency_warning
        );
    }
}
