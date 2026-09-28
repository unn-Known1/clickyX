//! jarvis_cmds: Jarvis co-pilot commands (Track 2).
//!
//! - `jarvis_analyze`: gates + blocklist(app_id) + KB background + Jev judge
//!   (batched call 1) → typed verdict + fail-closed fill advice. Judge-down →
//!   Err (`judge_unavailable`: frontend goes copy-only, never blind-fill).
//! - `jarvis_fill`: gates + blocklist + fill-only paste (never Enter /
//!   send-click / a11y press|click|submit). Emits `jarvis-state-changed`.
//! - `jarvis_status`: counts + booleans only (no secrets, no content).
//! - `jarvis_get_kb` / `jarvis_save_kb` / `jarvis_wipe`: encrypted KB CRUD.
//!
//! Vision extraction stays in the existing chat path (`capture_focused_window`
//! + `chat_with_vision`); this module judges text the frontend supplies.

use tauri::{AppHandle, Emitter};

use crate::ai::{jev, ChatMessage};
use crate::jarvis::{
    self, fill_advice, require_jarvis_gates, require_window_allowed, JarvisAnalyzeResult,
    JarvisStatus,
};

#[tauri::command]
pub async fn jarvis_analyze(
    app: AppHandle,
    app_id: String,
    messages: Vec<ChatMessage>,
    background: Option<serde_json::Value>,
    history: Option<Vec<ChatMessage>>,
) -> Result<JarvisAnalyzeResult, String> {
    let config = require_jarvis_gates(&app)?;
    // S-MAJ-1: the caller-supplied app_id is untrusted — re-resolve the OS
    // focused window server-side and blocklist-check THAT. Fail closed on
    // mismatch/blocklisted. Response shape unchanged.
    let focused_title =
        jarvis::require_focused_window_allowed(&app_id, &config.jarvis.blocklist_extra)?;
    let session = jarvis::session_key(&focused_title);

    if messages.is_empty() {
        return Err("jarvis_analyze needs at least 1 message (extract text first)".into());
    }

    // KB background (fail with a clear error on decrypt failure — never
    // silently judge without the user's notes).
    let kb = jarvis::load_kb(&config.agent.encryption_key).map_err(|e| format!("kb: {e}"))?;
    let kb_bg = jarvis::background_for(&focused_title, &kb);
    let mut bg = background.unwrap_or_else(|| serde_json::json!({}));
    if let (Some(b), Some(k)) = (bg.as_object_mut(), kb_bg.as_object()) {
        for (k2, v2) in k {
            b.entry(k2.clone()).or_insert(v2.clone());
        }
    }
    // App-context injection (Slack/Discord/… hints) — keyed on the trusted
    // OS focus reading, not the caller claim.
    let ctx = crate::ai::app_contexts::injection_block(&focused_title);
    if let Some(b) = bg.as_object_mut() {
        b.insert("app_context".into(), serde_json::json!(ctx));
    }

    let hist = history.unwrap_or_default();
    let state = jev::build_judge_state(&messages, &bg, &hist);
    let questions = jarvis::questions::judge_questions()?;

    let client = jev::JevClient::new(&config.jev).map_err(|e| {
        format!(
            "judge_unavailable: {}",
            jev::declassify_jev_error(&e.to_string())
        )
    })?;
    let resp = client.decide(state, questions).await.map_err(|e| {
        format!(
            "judge_unavailable: {}",
            jev::declassify_jev_error(&e.to_string())
        )
    })?;

    let input_tokens = resp.usage.as_ref().map(|u| u.input_tokens).unwrap_or(0);
    let verdict = jarvis::questions::parse_verdict(&resp.answers, input_tokens);

    // Screens over the judged text (screen-derived, untrusted).
    let corpus: String = messages
        .iter()
        .map(|m| m.content.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let injection = jarvis::questions::detect_injection(&corpus);
    let money_or_secret = jarvis::questions::detect_money_or_secret(&corpus);
    let (may_fill, reason) = fill_advice(&verdict, injection, money_or_secret, true);

    let msg_chars: usize = messages.iter().map(|m| m.content.len()).sum();
    let what_was_read = serde_json::json!({
        "messages": messages.len(),
        "msg_chars": msg_chars,
        "history": hist.len(),
        "kb_notes": kb.notes.len(),
        "kb_contacts": kb.contacts.len(),
        "model": resp.model,
        "input_tokens": input_tokens,
        "cost_usd": verdict.cost_usd,
        "injection": injection,
    });

    log::info!(
        "jarvis analyze: session={session} intent={} danger={:.2} fill={may_fill} ({reason}) tokens={input_tokens}",
        verdict.intent,
        verdict.danger_1idx
    );

    Ok(JarvisAnalyzeResult {
        verdict,
        session,
        app: focused_title.chars().take(120).collect(),
        injection,
        money_or_secret,
        may_fill,
        fill_reason: reason.into(),
        what_was_read,
    })
}

#[tauri::command]
pub fn jarvis_fill(
    app: AppHandle,
    text: String,
    app_id: String,
) -> Result<jarvis::FillOutcome, String> {
    let config = require_jarvis_gates(&app)?;
    // S-MAJ-1: re-resolve OS focus server-side; refuse on mismatch/blocklisted.
    jarvis::require_focused_window_allowed(&app_id, &config.jarvis.blocklist_extra)?;
    // Belt-and-suspenders: this entry point only ever pastes text.
    jarvis::fill::refuse_action_shape("paste-text")?;
    let outcome = jarvis::fill_draft(&text)?;
    let _ = app.emit(
        "jarvis-state-changed",
        serde_json::json!({"kind": "fill", "filled": outcome.filled, "mode": outcome.mode}),
    );
    Ok(outcome)
}

/// Copy-only fallback (clipboard set, no paste attempt). Used when the judge
/// is down, the window is Wayland, or the user confirms manual handling.
#[tauri::command]
pub fn jarvis_copy(app: AppHandle, text: String) -> Result<bool, String> {
    require_jarvis_gates(&app)?;
    jarvis::fill::copy_text(&text)?;
    let _ = app.emit("jarvis-state-changed", serde_json::json!({"kind": "copy"}));
    Ok(true)
}

#[tauri::command]
pub fn jarvis_status(app: AppHandle) -> Result<JarvisStatus, String> {
    let config = crate::config::load_config(&app)?;
    let kb_counts = jarvis::load_kb(&config.agent.encryption_key)
        .map(|kb| (kb.notes.len(), kb.contacts.len()))
        .unwrap_or((0, 0));
    Ok(JarvisStatus {
        enabled: config.jarvis.enabled,
        paused: config.jarvis.paused,
        hotkey: config.jarvis.hotkey.clone(),
        auto_trigger: config.jarvis.auto_trigger,
        has_jev_key: config.jev.api_key.as_ref().is_some_and(|k| !k.is_empty()),
        wayland_fill_limited: jarvis::fill::is_wayland(),
        kb_notes: kb_counts.0,
        kb_contacts: kb_counts.1,
    })
}

#[tauri::command]
pub fn jarvis_get_kb(app: AppHandle) -> Result<jarvis::JarvisKb, String> {
    require_jarvis_gates(&app)?;
    let config = crate::config::load_config(&app)?;
    jarvis::load_kb(&config.agent.encryption_key)
}

#[tauri::command]
pub fn jarvis_save_kb(app: AppHandle, kb: jarvis::JarvisKb) -> Result<jarvis::JarvisKb, String> {
    require_jarvis_gates(&app)?;
    let config = crate::config::load_config(&app)?;
    jarvis::save_kb(&kb, &config.agent.encryption_key)?;
    let _ = app.emit("jarvis-state-changed", serde_json::json!({"kind": "kb"}));
    Ok(kb)
}

#[tauri::command]
pub fn jarvis_wipe(app: AppHandle) -> Result<(), String> {
    let _config = crate::config::load_config(&app)?;
    jarvis::wipe_kb()?;
    let _ = app.emit("jarvis-state-changed", serde_json::json!({"kind": "wipe"}));
    Ok(())
}

/// Focused-window extraction for the manual panel flow: title + JPEG + session
/// in one call (the `capture_focused_window` command carries no title).
#[tauri::command]
pub fn jarvis_extract(app: AppHandle) -> Result<jarvis::FocusedApp, String> {
    let config = require_jarvis_gates(&app)?;
    let focused = jarvis::extract_focused()?;
    // Enforce the blocklist BEFORE pixels leave Rust (fail-closed).
    let session = require_window_allowed(&focused.title, &config.jarvis.blocklist_extra)?;
    if session != focused.session {
        log::warn!("jarvis extract: session mismatch (title changed mid-flight)");
    }
    Ok(focused)
}

/// Draft-3 via the chat provider (vision-capable). POINT/OFFER tags are
/// STRIPPED for display and NEVER executed — Jarvis drafts must not move the
/// mouse. Excluded from streaming (raw-tag leak, P4 residual).
#[tauri::command]
pub async fn jarvis_draft(
    app: AppHandle,
    app_id: String,
    messages: Vec<ChatMessage>,
    images: Vec<String>,
    model: Option<String>,
    background: Option<String>,
) -> Result<Vec<String>, String> {
    let config = require_jarvis_gates(&app)?;
    // S-MAJ-1: re-resolve OS focus server-side; refuse on mismatch/blocklisted.
    let focused_title =
        jarvis::require_focused_window_allowed(&app_id, &config.jarvis.blocklist_extra)?;
    if messages.is_empty() {
        return Err("jarvis_draft needs at least 1 message".into());
    }

    let model = model
        .unwrap_or_else(|| crate::ai::get_default_model(&config.ai, &config.ai.default_provider));
    // Never route a decision model into the chat provider (fail-closed).
    if crate::ai::resolve_provider_for_model(&model) == "jev" {
        return Err("jarvis_draft needs a chat model (jev models are decision-only)".into());
    }

    let ctx = crate::ai::app_contexts::injection_block(&focused_title);
    let bg = background.unwrap_or_default();
    let system = format!(
        "{}\n[Jarvis draft mode — fill-only co-pilot. {}]\nBackground: {}\nRules: draft EXACTLY 3 distinct short replies for the latest incoming message, separated by a line containing only ---. Match the user's own terse style (≤60 chars each unless the ask needs more). No numbering, no quotes, no `me:` prefix, no template filler. Never include money movement, credentials, or irreversible commitments. <<<untrusted-screen-below>>>",
        config.ai.system_prompt, ctx, bg
    );

    let mut full: Vec<ChatMessage> = Vec::with_capacity(messages.len() + 1);
    full.push(ChatMessage {
        role: "system".into(),
        content: system,
    });
    // Cap at 10 recent to respect context limits.
    full.extend(messages.iter().rev().take(10).rev().cloned());

    let image_inputs: Vec<crate::ai::ImageInput> = images
        .iter()
        .filter_map(|data_url| {
            if let Some(rest) = data_url.strip_prefix("data:") {
                let parts: Vec<&str> = rest.splitn(2, ';').collect();
                if parts.len() == 2 {
                    Some(crate::ai::ImageInput {
                        media_type: parts[0].to_string(),
                        data: parts[1]
                            .strip_prefix("base64,")
                            .unwrap_or(parts[1])
                            .to_string(),
                    })
                } else {
                    None
                }
            } else {
                Some(crate::ai::ImageInput {
                    media_type: "image/jpeg".into(),
                    data: data_url.clone(),
                })
            }
        })
        .collect();

    let provider =
        crate::ai::create_provider_for_model(&config.ai, &model).map_err(|e| format!("{e}"))?;
    let raw = provider
        .chat_with_vision(&full, &model, &image_inputs)
        .await
        .map_err(|e| crate::ai::jev::declassify_jev_error(&e.to_string()))?;

    // NOTE: deliberately NO execute_guidance_tags — drafts never act.
    let stripped = crate::ai::guidance::strip_guidance_tags(&raw);
    let mut drafts: Vec<String> = stripped
        .split("\n---\n")
        .map(clean_draft)
        .filter(|d| !d.is_empty())
        .take(3)
        .collect();
    if drafts.is_empty() {
        drafts.push(clean_draft(&stripped));
    }
    if drafts.iter().all(|d| d.is_empty()) {
        return Err("jarvis_draft: provider returned no usable draft".into());
    }
    log::info!("jarvis draft: n={} model={model}", drafts.len());
    Ok(drafts)
}

/// De-template a raw draft: strip numbering, quotes, `me:` leader.
fn clean_draft(raw: &str) -> String {
    let mut s = raw.trim().to_string();
    for prefix in ["1.", "2.", "3.", "1)", "2)", "3)", "-", "*"] {
        if let Some(rest) = s.strip_prefix(prefix) {
            s = rest.trim().to_string();
            break;
        }
    }
    if (s.starts_with('"') && s.ends_with('"') && s.len() >= 2)
        || (s.starts_with('\'') && s.ends_with('\'') && s.len() >= 2)
    {
        s = s[1..s.len() - 1].trim().to_string();
    }
    for leader in ["me:", "Me:", "ME:"] {
        if let Some(rest) = s.strip_prefix(leader) {
            s = rest.trim().to_string();
            break;
        }
    }
    // Trailing 。 (CJK full stop from template-y replies).
    while s.ends_with('。') {
        s.pop();
    }
    s.trim().to_string()
}

/// Dependent rank over drafts (call 2; independents belong in call 1).
#[tauri::command]
pub async fn jarvis_rank(
    app: AppHandle,
    drafts: Vec<String>,
    state: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let config = require_jarvis_gates(&app)?;
    if drafts.is_empty() {
        return Err("jarvis_rank needs at least 1 draft".into());
    }
    let client = jev::JevClient::new(&config.jev).map_err(|e| {
        format!(
            "judge_unavailable: {}",
            jev::declassify_jev_error(&e.to_string())
        )
    })?;
    let st = state.unwrap_or_else(|| serde_json::json!({"drafts": drafts.len()}));
    let (winner, ranked) = client.decide_rank(st, &drafts).await.map_err(|e| {
        format!(
            "judge_unavailable: {}",
            jev::declassify_jev_error(&e.to_string())
        )
    })?;
    Ok(serde_json::json!({
        "winner": winner,
        "ranked": ranked.iter().map(|(i, p)| serde_json::json!({"index": i, "prob": p})).collect::<Vec<_>>(),
    }))
}
