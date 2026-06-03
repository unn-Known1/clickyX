use std::io::Cursor;

use actix_web::{web, App, HttpServer, HttpResponse, middleware};
use crate::bridge_auth::{Auth, BridgeAuthConfig};
use futures_util::stream::Stream;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::screen::capture;

#[derive(Clone)]
pub struct BridgeState {
    pub app_handle: AppHandle,
    pub event_tx: tokio::sync::broadcast::Sender<String>,
}

impl BridgeState {
    pub fn new(app_handle: AppHandle) -> Self {
        let (event_tx, _) = tokio::sync::broadcast::channel(256);
        Self {
            app_handle,
            event_tx,
        }
    }
}

pub fn emit_event(state: &BridgeState, event_type: &str, payload: &str) {
    let msg = format!("event: {}\ndata: {}\n\n", event_type, payload);
    let _ = state.event_tx.send(msg);
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    version: String,
}

#[derive(Serialize)]
struct PanelToggleResponse {
    panel_visible: bool,
    panel_pinned: bool,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    message: String,
}

#[derive(Serialize)]
struct OkResponse {
    ok: bool,
}

#[derive(Serialize)]
struct ScreenshotResponse {
    images: Vec<capture::ScreenImage>,
}

#[derive(Deserialize)]
struct CursorRequest {
    x: f64,
    y: f64,
    label: Option<String>,
    accent: Option<String>,
}

#[derive(Deserialize)]
struct CursorsRequest {
    cursors: Vec<CursorRequest>,
}

#[derive(Deserialize)]
struct RectRequest {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    label: Option<String>,
}

#[derive(Deserialize)]
struct ScribbleRequest {
    points: Vec<[f64; 2]>,
    label: Option<String>,
}

#[derive(Deserialize)]
struct CaptionRequest {
    text: String,
    x: f64,
    y: f64,
}

#[derive(Deserialize)]
struct ClickRequest {
    x: f64,
    y: f64,
}

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(HealthResponse {
        status: "ok".into(),
        version: "0.1.0".into(),
    })
}

async fn toggle_panel(data: web::Data<BridgeState>) -> HttpResponse {
    let app = &data.app_handle;
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
        HttpResponse::Ok().json(PanelToggleResponse {
            panel_visible: !visible,
            panel_pinned: false,
        })
    } else {
        HttpResponse::InternalServerError().json(ErrorResponse {
            error: "internal_error".into(),
            message: "main window not found".into(),
        })
    }
}

async fn screenshot(data: web::Data<BridgeState>) -> HttpResponse {
    let _app = &data.app_handle;
    match capture::capture_all_screens() {
        Ok(images) => HttpResponse::Ok().json(ScreenshotResponse { images }),
        Err(e) => HttpResponse::InternalServerError().json(ErrorResponse {
            error: "capture_error".into(),
            message: e,
        }),
    }
}

async fn show_cursor(data: web::Data<BridgeState>, body: web::Json<CursorRequest>) -> HttpResponse {
    let app = &data.app_handle;
    match crate::overlay::show_cursor(app, body.x, body.y, body.label.clone()) {
        Ok(_) => HttpResponse::Ok().json(OkResponse { ok: true }),
        Err(e) => HttpResponse::InternalServerError().json(ErrorResponse {
            error: "overlay_error".into(),
            message: e,
        }),
    }
}

async fn show_cursors(data: web::Data<BridgeState>, body: web::Json<CursorsRequest>) -> HttpResponse {
    let app = &data.app_handle;
    for c in &body.cursors {
        if let Err(e) = crate::overlay::show_cursor(app, c.x, c.y, c.label.clone()) {
            return HttpResponse::InternalServerError().json(ErrorResponse {
                error: "overlay_error".into(),
                message: e,
            });
        }
    }
    HttpResponse::Ok().json(OkResponse { ok: true })
}

async fn show_rectangle(data: web::Data<BridgeState>, body: web::Json<RectRequest>) -> HttpResponse {
    let app = &data.app_handle;
    match crate::overlay::show_rect(app, body.x, body.y, body.w, body.h, body.label.clone()) {
        Ok(_) => HttpResponse::Ok().json(OkResponse { ok: true }),
        Err(e) => HttpResponse::InternalServerError().json(ErrorResponse {
            error: "overlay_error".into(),
            message: e,
        }),
    }
}

async fn show_scribble(data: web::Data<BridgeState>, body: web::Json<ScribbleRequest>) -> HttpResponse {
    let app = &data.app_handle;
    match crate::overlay::show_scribble(app, body.points.clone(), body.label.clone()) {
        Ok(_) => HttpResponse::Ok().json(OkResponse { ok: true }),
        Err(e) => HttpResponse::InternalServerError().json(ErrorResponse {
            error: "overlay_error".into(),
            message: e,
        }),
    }
}

async fn show_caption(data: web::Data<BridgeState>, body: web::Json<CaptionRequest>) -> HttpResponse {
    let app = &data.app_handle;
    match crate::overlay::show_caption(app, &body.text, body.x, body.y) {
        Ok(_) => HttpResponse::Ok().json(OkResponse { ok: true }),
        Err(e) => HttpResponse::InternalServerError().json(ErrorResponse {
            error: "overlay_error".into(),
            message: e,
        }),
    }
}

async fn click(data: web::Data<BridgeState>, body: web::Json<ClickRequest>) -> HttpResponse {
    let _app = &data.app_handle;
    log::info!("Click requested at ({}, {})", body.x, body.y);
    HttpResponse::Ok().json(OkResponse { ok: true })
}

async fn clear_overlays(data: web::Data<BridgeState>) -> HttpResponse {
    let app = &data.app_handle;
    match crate::overlay::clear_overlays(app) {
        Ok(_) => HttpResponse::Ok().json(OkResponse { ok: true }),
        Err(e) => HttpResponse::InternalServerError().json(ErrorResponse {
            error: "overlay_error".into(),
            message: e,
        }),
    }
}

#[derive(Deserialize)]
struct SpeakRequest {
    text: String,
    provider: Option<String>,
}

#[derive(Deserialize)]
struct TranscribeRequest {
    audio_base64: Option<String>,
    provider: Option<String>,
}

#[derive(Serialize)]
struct TranscribeResponse {
    transcript: String,
    provider: String,
}

#[derive(Serialize)]
struct AudioLevelResponse {
    rms: f32,
    peak: f32,
    clipping: bool,
}

fn wav_to_pcm_f32(wav_data: &[u8]) -> Vec<f32> {
    let cursor = Cursor::new(wav_data);
    if let Ok(reader) = hound::WavReader::new(cursor) {
        reader
            .into_samples::<i16>()
            .filter_map(|s| s.ok())
            .map(|s| s as f32 / i16::MAX as f32)
            .collect()
    } else {
        vec![]
    }
}

async fn speak(data: web::Data<BridgeState>, body: web::Json<SpeakRequest>) -> HttpResponse {
    let app = &data.app_handle;
    if let Some(pipeline) = app.try_state::<std::sync::Mutex<crate::audio::VoicePipeline>>() {
        let pipe = match pipeline.lock() {
            Ok(p) => p,
            Err(e) => {
                return HttpResponse::InternalServerError().json(ErrorResponse {
                    error: "internal_error".into(),
                    message: format!("Pipeline lock error: {e}"),
                });
            }
        };
        match pipe.speak_response(&body.text) {
            Ok(audio) => HttpResponse::Ok()
                .content_type("audio/wav")
                .body(audio),
            Err(e) => HttpResponse::BadRequest().json(ErrorResponse {
                error: "provider_error".into(),
                message: e,
            }),
        }
    } else {
        HttpResponse::InternalServerError().json(ErrorResponse {
            error: "internal_error".into(),
            message: "Voice pipeline not initialized".into(),
        })
    }
}

async fn transcribe(
    data: web::Data<BridgeState>,
    body: web::Json<TranscribeRequest>,
) -> HttpResponse {
    let app = &data.app_handle;
    let config = match crate::config::load_config(app) {
        Ok(c) => c,
        Err(e) => {
            return HttpResponse::InternalServerError().json(ErrorResponse {
                error: "internal_error".into(),
                message: e,
            });
        }
    };

    let provider_name = body
        .provider
        .clone()
        .unwrap_or(config.audio.stt_provider.clone());
    let stt_provider = crate::audio::SttProvider::from_name(&provider_name)
        .unwrap_or(crate::audio::SttProvider::Deepgram);

    let api_key = config
        .api_keys
        .iter()
        .find(|k| k.provider == stt_provider.name())
        .map(|k| k.key.clone())
        .unwrap_or_default();

    let stt_cfg = crate::audio::SttConfig {
        provider: stt_provider,
        api_key,
        language: "en".into(),
        timeout_secs: 30,
        max_retries: 3,
    };

    let audio_base64 = match &body.audio_base64 {
        Some(b64) => b64.clone(),
        None => {
            return HttpResponse::BadRequest().json(ErrorResponse {
                error: "bad_request".into(),
                message: "audio_base64 field required".into(),
            });
        }
    };

    let wav_bytes = match base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        audio_base64.as_bytes(),
    ) {
        Ok(b) => b,
        Err(e) => {
            return HttpResponse::BadRequest().json(ErrorResponse {
                error: "bad_request".into(),
                message: format!("Invalid base64: {e}"),
            });
        }
    };

    let pcm_data = wav_to_pcm_f32(&wav_bytes);

    let sample_rate = 16000;
    let transcript = match crate::audio::transcribe(&pcm_data, &stt_cfg, sample_rate).await {
        Ok(t) => t,
        Err(e) => {
            return HttpResponse::InternalServerError().json(ErrorResponse {
                error: "transcription_failed".into(),
                message: e,
            });
        }
    };

    HttpResponse::Ok().json(TranscribeResponse {
        transcript,
        provider: provider_name,
    })
}

async fn audio_level(data: web::Data<BridgeState>) -> HttpResponse {
    let app = &data.app_handle;
    if let Some(pipeline) = app.try_state::<std::sync::Mutex<crate::audio::VoicePipeline>>() {
        let pipe = match pipeline.lock() {
            Ok(p) => p,
            Err(_) => {
                return HttpResponse::Ok().json(AudioLevelResponse {
                    rms: 0.0,
                    peak: 0.0,
                    clipping: false,
                });
            }
        };
        let level = pipe.get_audio_level();
        HttpResponse::Ok().json(AudioLevelResponse {
            rms: level.rms,
            peak: level.peak,
            clipping: level.clipping,
        })
    } else {
        HttpResponse::Ok().json(AudioLevelResponse {
            rms: 0.0,
            peak: 0.0,
            clipping: false,
        })
    }
}

#[derive(Deserialize)]
struct MessagesRequest {
    model: Option<String>,
    messages: Vec<MessageItem>,
    system: Option<String>,
    max_tokens: Option<i32>,
}

#[derive(Deserialize)]
struct MessageItem {
    role: String,
    content: serde_json::Value,
}

#[derive(Deserialize)]
struct ResponsesRequest {
    model: Option<String>,
    messages: Vec<ResponseMessageItem>,
    max_tokens: Option<i32>,
}

#[derive(Deserialize)]
struct ResponseMessageItem {
    role: String,
    content: serde_json::Value,
}

#[derive(Serialize)]
struct ModelsResponse {
    models: Vec<serde_json::Value>,
}

async fn proxy_messages(
    data: web::Data<BridgeState>,
    body: web::Json<MessagesRequest>,
) -> HttpResponse {
    let app = &data.app_handle;
    let config = match app.try_state::<crate::config::AppConfig>() {
        Some(c) => c.inner().clone(),
        None => {
            return HttpResponse::InternalServerError().json(ErrorResponse {
                error: "internal_error".into(),
                message: "config not available".into(),
            });
        }
    };

    let api_key = match &config.ai.anthropic_api_key {
        Some(k) => k.clone(),
        None => {
            return HttpResponse::Unauthorized().json(serde_json::json!({
                "error": "auth_error",
                "message": "Anthropic API key not configured"
            }));
        }
    };

    let model = body
        .model
        .clone()
        .unwrap_or_else(|| config.ai.anthropic_model.clone());

    let max_tokens = body.max_tokens.unwrap_or(4096);

    let mut api_messages: Vec<serde_json::Value> = Vec::new();
    for msg in &body.messages {
        api_messages.push(serde_json::json!({
            "role": msg.role,
            "content": msg.content,
        }));
    }

    let mut request_body = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "stream": false,
        "messages": api_messages,
    });

    if let Some(system) = &body.system {
        request_body
            .as_object_mut()
            .unwrap()
            .insert("system".into(), serde_json::json!(system));
    }

    let client = reqwest::Client::new();
    let response = match client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&request_body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return HttpResponse::InternalServerError().json(ErrorResponse {
                error: "internal_error".into(),
                message: format!("proxy error: {e}"),
            });
        }
    };

    let status = response.status();
    let text = match response.text().await {
        Ok(t) => t,
        Err(e) => {
            return HttpResponse::InternalServerError().json(ErrorResponse {
                error: "internal_error".into(),
                message: format!("response read error: {e}"),
            });
        }
    };

    match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(json) => HttpResponse::build(
            actix_web::http::StatusCode::from_u16(status.as_u16()).unwrap(),
        )
        .json(json),
        Err(_) => HttpResponse::build(
            actix_web::http::StatusCode::from_u16(status.as_u16()).unwrap(),
        )
        .body(text),
    }
}

async fn proxy_responses(
    data: web::Data<BridgeState>,
    body: web::Json<ResponsesRequest>,
) -> HttpResponse {
    let app = &data.app_handle;
    let config = match app.try_state::<crate::config::AppConfig>() {
        Some(c) => c.inner().clone(),
        None => {
            return HttpResponse::InternalServerError().json(ErrorResponse {
                error: "internal_error".into(),
                message: "config not available".into(),
            });
        }
    };

    let api_key = match &config.ai.openai_api_key {
        Some(k) => k.clone(),
        None => {
            return HttpResponse::Unauthorized().json(serde_json::json!({
                "error": "auth_error",
                "message": "OpenAI API key not configured"
            }));
        }
    };

    let model = body
        .model
        .clone()
        .unwrap_or_else(|| config.ai.openai_model.clone());

    let max_tokens = body.max_tokens.unwrap_or(4096);

    let mut api_messages = Vec::new();
    if !config.ai.system_prompt.is_empty() {
        api_messages.push(serde_json::json!({
            "role": "system",
            "content": config.ai.system_prompt,
        }));
    }
    for msg in &body.messages {
        api_messages.push(serde_json::json!({
            "role": msg.role,
            "content": msg.content,
        }));
    }

    let request_body = serde_json::json!({
        "model": model,
        "messages": api_messages,
        "max_tokens": max_tokens,
        "stream": false,
    });

    let client = reqwest::Client::new();
    let response = match client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("content-type", "application/json")
        .json(&request_body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return HttpResponse::InternalServerError().json(ErrorResponse {
                error: "internal_error".into(),
                message: format!("proxy error: {e}"),
            });
        }
    };

    let status = response.status();
    let text = match response.text().await {
        Ok(t) => t,
        Err(e) => {
            return HttpResponse::InternalServerError().json(ErrorResponse {
                error: "internal_error".into(),
                message: format!("response read error: {e}"),
            });
        }
    };

    match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(json) => HttpResponse::build(
            actix_web::http::StatusCode::from_u16(status.as_u16()).unwrap(),
        )
        .json(json),
        Err(_) => HttpResponse::build(
            actix_web::http::StatusCode::from_u16(status.as_u16()).unwrap(),
        )
        .body(text),
    }
}

async fn list_models() -> HttpResponse {
    let catalog = crate::ai::catalog::ModelCatalog::new();
    let models: Vec<serde_json::Value> = catalog
        .models
        .iter()
        .map(|m| {
            serde_json::json!({
                "id": m.id,
                "provider": m.provider,
                "name": m.name,
                "capabilities": m.capabilities,
            })
        })
        .collect();

    HttpResponse::Ok().json(ModelsResponse { models })
}

#[derive(Deserialize)]
struct NotifyRequest {
    title: String,
    body: String,
    icon: Option<String>,
}

#[derive(Serialize)]
struct McpToolsResponse {
    tools: Vec<McpToolInfo>,
}

#[derive(Serialize)]
struct McpToolInfo {
    server: String,
    name: String,
    description: String,
}

#[derive(Deserialize)]
struct McpCallRequest {
    server: String,
    tool: String,
    args: serde_json::Value,
}

async fn events(data: web::Data<BridgeState>) -> HttpResponse {
    let rx = data.event_tx.subscribe();
    let stream: Box<dyn Stream<Item = Result<actix_web::web::Bytes, actix_web::Error>> + Unpin> =
        Box::new(tokio_stream::wrappers::BroadcastStream::new(rx).map(|result| {
            result
                .map(|msg| actix_web::web::Bytes::from(msg))
                .map_err(|_| actix_web::error::ErrorGone("channel closed"))
        }));
    HttpResponse::Ok()
        .insert_header(("Content-Type", "text/event-stream"))
        .insert_header(("Cache-Control", "no-cache"))
        .insert_header(("Connection", "keep-alive"))
        .streaming(stream)
}

async fn click_handler(data: web::Data<BridgeState>, body: web::Json<ClickRequest>) -> HttpResponse {
    let _app = &data.app_handle;
    log::info!("Click at ({}, {})", body.x, body.y);
    emit_event(&data, "guidance_update", &format!("{{\"action\":\"click\",\"x\":{},\"y\":{}}}", body.x, body.y));
    HttpResponse::Ok().json(OkResponse { ok: true })
}

async fn notify(data: web::Data<BridgeState>, body: web::Json<NotifyRequest>) -> HttpResponse {
    let _app = &data.app_handle;
    log::info!("Notification: {} - {}", body.title, body.body);
    if let Some(window) = _app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    HttpResponse::Ok().json(OkResponse { ok: true })
}

async fn mcp_tools() -> HttpResponse {
    let tools = vec![McpToolInfo {
        server: "placeholder".into(),
        name: "no_mcp_servers_configured".into(),
        description: "Add MCP servers in Settings > Connections".into(),
    }];
    HttpResponse::Ok().json(McpToolsResponse { tools })
}

async fn mcp_call(body: web::Json<McpCallRequest>) -> HttpResponse {
    log::info!("MCP call: server={}, tool={}", body.server, body.tool);
    HttpResponse::Ok().json(serde_json::json!({
        "result": format!("MCP tool '{}' called on server '{}'", body.tool, body.server)
    }))
}

async fn bridge_list_agents(data: web::Data<BridgeState>) -> HttpResponse {
    let app = &data.app_handle;
    if let Some(store) = app.try_state::<std::sync::Mutex<crate::agent::session::AgentStore>>() {
        match store.lock() {
            Ok(s) => {
                let agents = s.list();
                HttpResponse::Ok().json(serde_json::json!({ "agents": agents }))
            }
            Err(e) => HttpResponse::InternalServerError().json(ErrorResponse {
                error: "internal_error".into(),
                message: format!("lock error: {e}"),
            }),
        }
    } else {
        HttpResponse::InternalServerError().json(ErrorResponse {
            error: "internal_error".into(),
            message: "agent store not available".into(),
        })
    }
}

async fn bridge_create_agent(
    data: web::Data<BridgeState>,
    body: web::Json<serde_json::Value>,
) -> HttpResponse {
    let app = &data.app_handle;
    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or("Agent");
    let slug = body.get("slug").and_then(|v| v.as_str()).unwrap_or("");
    let skills: Vec<String> = body
        .get("skills")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    if slug.is_empty() {
        return HttpResponse::BadRequest().json(ErrorResponse {
            error: "bad_request".into(),
            message: "slug is required".into(),
        });
    }

    if let Some(store) = app.try_state::<std::sync::Mutex<crate::agent::session::AgentStore>>() {
        match store.lock() {
            Ok(mut s) => {
                let session = s.create(name.to_string(), slug.to_string(), skills);
                HttpResponse::Ok().json(session)
            }
            Err(e) => HttpResponse::InternalServerError().json(ErrorResponse {
                error: "internal_error".into(),
                message: format!("lock error: {e}"),
            }),
        }
    } else {
        HttpResponse::InternalServerError().json(ErrorResponse {
            error: "internal_error".into(),
            message: "agent store not available".into(),
        })
    }
}

async fn bridge_run_agent(
    data: web::Data<BridgeState>,
    path: web::Path<String>,
    body: web::Json<serde_json::Value>,
) -> HttpResponse {
    let app = &data.app_handle;
    let slug = path.into_inner();
    let prompt = body
        .get("prompt")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if let Some(store) = app.try_state::<std::sync::Mutex<crate::agent::session::AgentStore>>() {
        match store.lock() {
            Ok(mut s) => {
                if let Some(session) = s.get_mut(&slug) {
                    session.state = crate::agent::session::SessionState::Running;
                    session.transcript.push(crate::agent::session::ChatMessage {
                        role: "user".into(),
                        content: prompt.to_string(),
                    });
                    let now =
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs()
                            .to_string();
                    session.updated_at = now;
                    HttpResponse::Ok().json(serde_json::json!({ "ok": true }))
                } else {
                    HttpResponse::NotFound().json(ErrorResponse {
                        error: "not_found".into(),
                        message: format!("agent '{slug}' not found"),
                    })
                }
            }
            Err(e) => HttpResponse::InternalServerError().json(ErrorResponse {
                error: "internal_error".into(),
                message: format!("lock error: {e}"),
            }),
        }
    } else {
        HttpResponse::InternalServerError().json(ErrorResponse {
            error: "internal_error".into(),
            message: "agent store not available".into(),
        })
    }
}

async fn bridge_stop_agent(
    data: web::Data<BridgeState>,
    path: web::Path<String>,
) -> HttpResponse {
    let app = &data.app_handle;
    let slug = path.into_inner();

    if let Some(store) = app.try_state::<std::sync::Mutex<crate::agent::session::AgentStore>>() {
        match store.lock() {
            Ok(mut s) => {
                if let Some(session) = s.get_mut(&slug) {
                    session.state = crate::agent::session::SessionState::Paused;
                    HttpResponse::Ok().json(serde_json::json!({ "ok": true }))
                } else {
                    HttpResponse::NotFound().json(ErrorResponse {
                        error: "not_found".into(),
                        message: format!("agent '{slug}' not found"),
                    })
                }
            }
            Err(e) => HttpResponse::InternalServerError().json(ErrorResponse {
                error: "internal_error".into(),
                message: format!("lock error: {e}"),
            }),
        }
    } else {
        HttpResponse::InternalServerError().json(ErrorResponse {
            error: "internal_error".into(),
            message: "agent store not available".into(),
        })
    }
}

async fn bridge_agent_status(
    data: web::Data<BridgeState>,
    path: web::Path<String>,
) -> HttpResponse {
    let app = &data.app_handle;
    let slug = path.into_inner();

    if let Some(store) = app.try_state::<std::sync::Mutex<crate::agent::session::AgentStore>>() {
        match store.lock() {
            Ok(s) => {
                if let Some(session) = s.get(&slug) {
                    HttpResponse::Ok().json(session)
                } else {
                    HttpResponse::NotFound().json(ErrorResponse {
                        error: "not_found".into(),
                        message: format!("agent '{slug}' not found"),
                    })
                }
            }
            Err(e) => HttpResponse::InternalServerError().json(ErrorResponse {
                error: "internal_error".into(),
                message: format!("lock error: {e}"),
            }),
        }
    } else {
        HttpResponse::InternalServerError().json(ErrorResponse {
            error: "internal_error".into(),
            message: "agent store not available".into(),
        })
    }
}

async fn bridge_list_skills() -> HttpResponse {
    let skills = crate::agent::skills::load_skills();
    HttpResponse::Ok().json(serde_json::json!({ "skills": skills }))
}

async fn not_found() -> HttpResponse {
    HttpResponse::NotFound().json(ErrorResponse {
        error: "not_found".into(),
        message: "Route not found".into(),
    })
}

pub fn start_bridge(app_handle: AppHandle, bridge_token: Option<String>) {
    log::info!("Starting bridge server thread");
    std::thread::spawn(move || {
        let bridge_state = BridgeState::new(app_handle);
        let data = web::Data::new(bridge_state);
        let auth_config = web::Data::new(BridgeAuthConfig { token: bridge_token });

        let rt = actix_rt::System::new();
        rt.block_on(async {
            let server = HttpServer::new(move || {
                App::new()
                    .wrap(actix_cors::Cors::permissive())
                    .wrap(middleware::Logger::default())
                    .app_data(data.clone())
                    .app_data(auth_config.clone())
                    .route("/health", web::get().to(health))
                    .route("/panel/toggle", web::post().to(toggle_panel))
                    .route("/v1/messages", web::post().to(proxy_messages))
                    .route("/v1/responses", web::post().to(proxy_responses))
                    .route("/models", web::get().to(list_models))
                    .route("/screenshot", web::post().to(screenshot))
                    .route("/cursor", web::post().to(show_cursor))
                    .route("/cursors", web::post().to(show_cursors))
                    .route("/rectangle", web::post().to(show_rectangle))
                    .route("/scribble", web::post().to(show_scribble))
                    .route("/caption", web::post().to(show_caption))
                    .route("/click", web::post().to(click))
                    .route("/clear", web::post().to(clear_overlays))
                    .route("/speak", web::post().to(speak))
                    .route("/transcribe", web::post().to(transcribe))
                    .route("/audio-level", web::get().to(audio_level))
                    .route("/events", web::get().to(events))
                    .route("/notify", web::post().to(notify))
                    .route("/mcp/tools", web::get().to(mcp_tools))
                    .route("/mcp/call", web::post().to(mcp_call))
                    .route("/agents", web::get().to(bridge_list_agents))
                    .route("/agent/create", web::post().to(bridge_create_agent))
                    .route("/agent/{slug}/run", web::post().to(bridge_run_agent))
                    .route("/agent/{slug}/stop", web::post().to(bridge_stop_agent))
                    .route("/agent/{slug}/status", web::get().to(bridge_agent_status))
                    .route("/skills", web::get().to(bridge_list_skills))
                    .default_service(web::route().to(not_found))
            })
            .bind("127.0.0.1:32123");

            match server {
                Ok(s) => {
                    log::info!("Bridge server running on http://127.0.0.1:32123");
                    if let Err(e) = s.run().await {
                        log::error!("Bridge server error: {e}");
                    }
                }
                Err(e) => {
                    log::error!("Failed to bind bridge server: {e}");
                }
            }
        });
    });
}
