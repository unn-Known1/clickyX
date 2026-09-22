//! chat_cmds: Tauri command handlers (split from commands.rs in P3).
//!
//! Re-exported through `crate::commands`; `commands::foo` paths keep working.

use tauri::{AppHandle, Emitter};

use crate::ai;
use crate::ai::streaming::StreamEvent;
use crate::config::{self};

use super::types::*;

#[tauri::command]
pub fn load_conversations(app: AppHandle) -> Result<Vec<Conversation>, String> {
    let config = config::load_config(&app).unwrap_or_default();
    let base = dirs::config_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    let path = base.join("clickyx").join("conversations.enc");
    if !path.exists() {
        return Ok(vec![]);
    }
    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    let decrypted = crate::agent::session::decrypt_data(&data, &config.agent.encryption_key)?;
    serde_json::from_str(&decrypted).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_conversations(app: AppHandle, conversations: Vec<Conversation>) -> Result<(), String> {
    let config = config::load_config(&app).unwrap_or_default();
    let base = dirs::config_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    let path = base.join("clickyx").join("conversations.enc");
    let json = serde_json::to_string(&conversations).map_err(|e| e.to_string())?;
    let encrypted = crate::agent::session::encrypt_data(&json, &config.agent.encryption_key)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap_or_default();
    }
    std::fs::write(&path, encrypted).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn send_chat_message(
    app: AppHandle,
    message: String,
    model: Option<String>,
) -> Result<String, String> {
    let config = config::load_config(&app).unwrap_or_default();
    let msg = ai::ChatMessage {
        role: "user".into(),
        content: message,
    };
    let model =
        model.unwrap_or_else(|| ai::get_default_model(&config.ai, &config.ai.default_provider));
    let provider = ai::create_provider_for_model(&config.ai, &model).map_err(|e| format!("{e}"))?;
    let response = provider
        .chat(&[msg], &model)
        .await
        .map_err(|e| format!("{e}"))?;

    execute_guidance_tags(&app, &response);
    // P3: annotations fire from the raw text above; the user-visible reply
    // has tags stripped (strip fns were dead until this call site existed).
    // NOTE: streaming paths still surface raw tags mid-stream (P4 residual).
    Ok(crate::ai::guidance::strip_guidance_tags(&response))
}

fn execute_guidance_tags(app: &AppHandle, text: &str) {
    let tags = crate::ai::guidance::parse_guidance_tags(text);
    if tags.is_empty() {
        return;
    }

    let config = crate::config::load_config(app).unwrap_or_default();
    let backend = if config.computer_use.native_cua {
        crate::cua::CuaBackend::Native
    } else {
        crate::cua::CuaBackend::Background
    };
    let mut sim = crate::cua::InputSimulator::new(backend);

    // P1 (CR-4): AI tags arrive in screenshot pixels — normalize to virtual
    // display coords (offset + HiDPI scale + macOS Y-flip) before ANY click or
    // overlay call. Previously tags executed raw (misaligned on macOS/HiDPI).
    let normalizer = crate::overlay::screen_router::CoordinateNormalizer::default();
    let scale = normalizer.primary_scale();
    let pt = |x: f64, y: f64| normalizer.ai_point_to_virtual(x, y);
    // Extents are screenshot pixels — convert to display points.
    let ext = |v: f64| v / scale;

    for tag in tags {
        match tag {
            crate::ai::guidance::GuidanceTag::Point { x, y, label } => {
                let (x, y) = pt(x, y);
                let _ = sim.click(x, y);
                let _ = crate::overlay::show_cursor(app, x, y, label);
            }
            crate::ai::guidance::GuidanceTag::Rect { x, y, w, h, label } => {
                let (x, y) = pt(x, y);
                let _ = crate::overlay::show_rect(app, x, y, ext(w), ext(h), label);
            }
            crate::ai::guidance::GuidanceTag::Highlight { x, y, w, h, label } => {
                let (x, y) = pt(x, y);
                let _ = crate::overlay::show_highlight(app, x, y, ext(w), ext(h), label);
            }
            crate::ai::guidance::GuidanceTag::Shape {
                shape_type,
                x1,
                y1,
                x2,
                y2,
                label,
            } => {
                let (x1, y1) = pt(x1, y1);
                let (x2, y2) = pt(x2, y2);
                let _ = crate::overlay::show_shape(app, &shape_type, x1, y1, x2, y2, label);
            }
            crate::ai::guidance::GuidanceTag::Scribble { points, label } => {
                let p = points
                    .into_iter()
                    .map(|(x, y)| {
                        let (vx, vy) = pt(x, y);
                        [vx, vy]
                    })
                    .collect();
                let _ = crate::overlay::show_scribble(app, p, label);
            }
            _ => {}
        }
    }
}

#[tauri::command]
pub async fn send_chat_message_stream(
    app: AppHandle,
    message: String,
    model: Option<String>,
    session_id: Option<String>,
) -> Result<(), String> {
    let config = config::load_config(&app).unwrap_or_default();
    let msg = ai::ChatMessage {
        role: "user".into(),
        content: message,
    };
    let model =
        model.unwrap_or_else(|| ai::get_default_model(&config.ai, &config.ai.default_provider));

    let app_clone = app.clone();
    tokio::spawn(async move {
        let provider = match ai::create_provider_for_model(&config.ai, &model) {
            Ok(p) => p,
            Err(e) => {
                let _ = app_clone.emit(
                    "stream-event",
                    StreamEvent::Error {
                        message: e.to_string(),
                        session_id: session_id.clone(),
                    },
                );
                return;
            }
        };

        let mut receiver = match provider.chat_stream(&[msg], &model).await {
            Ok(r) => r,
            Err(e) => {
                let _ = app_clone.emit(
                    "stream-event",
                    StreamEvent::Error {
                        message: e.to_string(),
                        session_id: session_id.clone(),
                    },
                );
                return;
            }
        };

        while let Some(mut event) = receiver.recv().await {
            match &mut event {
                StreamEvent::TextDelta { session_id: s, .. } => *s = session_id.clone(),
                StreamEvent::TextDone {
                    text,
                    session_id: s,
                } => {
                    *s = session_id.clone();
                    execute_guidance_tags(&app_clone, text);
                }
                StreamEvent::Error { session_id: s, .. } => *s = session_id.clone(),
                StreamEvent::Done { session_id: s } => *s = session_id.clone(),
            }
            let _ = app_clone.emit("stream-event", &event);
            if matches!(event, StreamEvent::Done { .. } | StreamEvent::Error { .. }) {
                break;
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn chat_with_vision(
    app: AppHandle,
    message: String,
    images: Vec<String>,
    model: Option<String>,
) -> Result<String, String> {
    let config = config::load_config(&app).unwrap_or_default();
    let msg = ai::ChatMessage {
        role: "user".into(),
        content: message,
    };
    let model =
        model.unwrap_or_else(|| ai::get_default_model(&config.ai, &config.ai.default_provider));

    let image_inputs: Vec<ai::ImageInput> = images
        .iter()
        .filter_map(|data_url| {
            if let Some(rest) = data_url.strip_prefix("data:") {
                let parts: Vec<&str> = rest.splitn(2, ';').collect();
                if parts.len() == 2 {
                    let media_type = parts[0].to_string();
                    let b64 = parts[1].strip_prefix("base64,").unwrap_or(parts[1]);
                    Some(ai::ImageInput {
                        media_type,
                        data: b64.to_string(),
                    })
                } else {
                    None
                }
            } else {
                Some(ai::ImageInput {
                    media_type: "image/png".into(),
                    data: data_url.clone(),
                })
            }
        })
        .collect();

    let provider = ai::create_provider_for_model(&config.ai, &model).map_err(|e| format!("{e}"))?;
    let response = provider
        .chat_with_vision(&[msg], &model, &image_inputs)
        .await
        .map_err(|e| format!("{e}"))?;

    execute_guidance_tags(&app, &response);
    // P3: annotations fire from the raw text above; the user-visible reply
    // has tags stripped (strip fns were dead until this call site existed).
    // NOTE: streaming paths still surface raw tags mid-stream (P4 residual).
    Ok(crate::ai::guidance::strip_guidance_tags(&response))
}
