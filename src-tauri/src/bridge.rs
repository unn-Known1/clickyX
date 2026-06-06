use std::io::Cursor;

use actix_web::{web, App, HttpServer, HttpResponse, middleware};
use crate::bridge_auth::BridgeAuthConfig;
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
    screen: Option<usize>,
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
    screen: Option<usize>,
}

#[derive(Deserialize)]
struct ScribbleRequest {
    points: Vec<[f64; 2]>,
    label: Option<String>,
    screen: Option<usize>,
}

#[derive(Deserialize)]
struct CaptionRequest {
    text: String,
    x: f64,
    y: f64,
    screen: Option<usize>,
}

#[derive(Deserialize)]
struct ClickRequest {
    x: f64,
    y: f64,
}

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(HealthResponse {
        status: "ok".into(),
        version: "0.1.1".into(),
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
    let result = match body.screen {
        Some(idx) => crate::overlay::show_cursor_on_screen(app, body.x, body.y, body.label.clone(), idx),
        None => crate::overlay::show_cursor(app, body.x, body.y, body.label.clone()),
    };
    match result {
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
        let result = match c.screen {
            Some(idx) => crate::overlay::show_cursor_on_screen(app, c.x, c.y, c.label.clone(), idx),
            None => crate::overlay::show_cursor(app, c.x, c.y, c.label.clone()),
        };
        if let Err(e) = result {
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
    let result = match body.screen {
        Some(idx) => crate::overlay::show_rect_on_screen(app, body.x, body.y, body.w, body.h, body.label.clone(), idx),
        None => crate::overlay::show_rect(app, body.x, body.y, body.w, body.h, body.label.clone()),
    };
    match result {
        Ok(_) => HttpResponse::Ok().json(OkResponse { ok: true }),
        Err(e) => HttpResponse::InternalServerError().json(ErrorResponse {
            error: "overlay_error".into(),
            message: e,
        }),
    }
}

async fn show_scribble(data: web::Data<BridgeState>, body: web::Json<ScribbleRequest>) -> HttpResponse {
    let app = &data.app_handle;
    let result = match body.screen {
        Some(idx) => crate::overlay::show_scribble_on_screen(app, body.points.clone(), body.label.clone(), idx),
        None => crate::overlay::show_scribble(app, body.points.clone(), body.label.clone()),
    };
    match result {
        Ok(_) => HttpResponse::Ok().json(OkResponse { ok: true }),
        Err(e) => HttpResponse::InternalServerError().json(ErrorResponse {
            error: "overlay_error".into(),
            message: e,
        }),
    }
}

async fn show_caption(data: web::Data<BridgeState>, body: web::Json<CaptionRequest>) -> HttpResponse {
    let app = &data.app_handle;
    let result = match body.screen {
        Some(idx) => crate::overlay::show_caption_on_screen(app, &body.text, body.x, body.y, idx),
        None => crate::overlay::show_caption(app, &body.text, body.x, body.y),
    };
    match result {
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

#[derive(Deserialize)]
struct ClearRequest {
    screen: Option<usize>,
}

async fn clear_overlays(data: web::Data<BridgeState>, body: Option<web::Json<ClearRequest>>) -> HttpResponse {
    let app = &data.app_handle;
    let result = match body {
        Some(ref req) if req.screen.is_some() => crate::overlay::clear_overlays_on_screen(app, req.screen.unwrap()),
        _ => crate::overlay::clear_overlays(app),
    };
    match result {
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
    let config = match crate::config::load_config(app) {
        Ok(c) => c,
        Err(_) => {
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
    let config = match crate::config::load_config(app) {
        Ok(c) => c,
        Err(_) => {
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
    let app = &data.app_handle;
    log::info!("Click at ({}, {})", body.x, body.y);
    
    let config = crate::config::load_config(app).unwrap_or_default();
    let backend = if config.computer_use.native_cua {
        crate::cua::CuaBackend::Native
    } else {
        crate::cua::CuaBackend::Background
    };
    
    let mut sim = crate::cua::InputSimulator::new(backend);
    
    let result = sim.click(body.x, body.y);
    if result.success {
        emit_event(&data, "guidance_update", &format!("{{\"action\":\"click\",\"x\":{},\"y\":{}}}", body.x, body.y));
        HttpResponse::Ok().json(OkResponse { ok: true })
    } else {
        HttpResponse::InternalServerError().json(ErrorResponse {
            error: "click_error".into(),
            message: format!("Click failed on backend: {}", result.backend),
        })
    }
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

/// Spawn an MCP server process, perform JSON-RPC initialize + tools/list,
/// and return the list of tool names/descriptions.
fn mcp_list_tools_sync(server: &crate::config::McpServerConfig) -> Vec<McpToolInfo> {
    use std::io::{BufRead, BufReader, Write};
    use std::process::{Command, Stdio};

    let mut child = match Command::new(&server.command)
        .args(&server.args)
        .envs(&server.env)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            log::warn!("MCP: failed to spawn server '{}': {}", server.name, e);
            return Vec::new();
        }
    };

    let mut stdin = match child.stdin.take() {
        Some(s) => s,
        None => return Vec::new(),
    };
    let stdout = match child.stdout.take() {
        Some(s) => s,
        None => return Vec::new(),
    };

    let mut reader = BufReader::new(stdout);

    // Send initialize
    let init_req = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "clickyx", "version": "1.0"}
        }
    });
    let init_str = format!("{}\n", serde_json::to_string(&init_req).unwrap_or_default());
    if stdin.write_all(init_str.as_bytes()).is_err() {
        let _ = child.kill();
        return Vec::new();
    }

    // Read initialize response (one line of JSON-RPC)
    for _ in 0..100 {
        let mut line = String::new();
        if reader.read_line(&mut line).unwrap_or(0) == 0 { break; }
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(line.trim()) {
            if val.get("id").and_then(|v| v.as_i64()) == Some(1) {
                break;
            }
        }
    }

    // Send tools/list
    let list_req = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/list",
        "params": {}
    });
    let list_str = format!("{}\n", serde_json::to_string(&list_req).unwrap_or_default());
    if stdin.write_all(list_str.as_bytes()).is_err() {
        let _ = child.kill();
        return Vec::new();
    }

    // Read tools/list response
    let mut list_resp_line = String::new();
    for _ in 0..100 {
        let mut line = String::new();
        if reader.read_line(&mut line).unwrap_or(0) == 0 { break; }
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(line.trim()) {
            if val.get("id").and_then(|v| v.as_i64()) == Some(2) {
                list_resp_line = line;
                break;
            }
        }
    }
    let _ = child.kill();

    // Parse the tools from the JSON-RPC response
    let tools: Vec<McpToolInfo> = match serde_json::from_str::<serde_json::Value>(&list_resp_line) {
        Ok(resp) => {
            let tool_array = resp
                .get("result")
                .and_then(|r| r.get("tools"))
                .and_then(|t| t.as_array());
            match tool_array {
                Some(arr) => arr
                    .iter()
                    .map(|t| McpToolInfo {
                        server: server.name.clone(),
                        name: t
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("unknown")
                            .to_string(),
                        description: t
                            .get("description")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                    })
                    .collect(),
                None => Vec::new(),
            }
        }
        Err(e) => {
            log::warn!(
                "MCP: failed to parse tools/list response from '{}': {}",
                server.name,
                e
            );
            Vec::new()
        }
    };

    tools
}

/// Spawn an MCP server, call a specific tool, and return the result JSON.
fn mcp_call_tool_sync(
    server: &crate::config::McpServerConfig,
    tool: &str,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    use std::io::{BufRead, BufReader, Write};
    use std::process::{Command, Stdio};

    let mut child = Command::new(&server.command)
        .args(&server.args)
        .envs(&server.env)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("failed to spawn MCP server '{}': {}", server.name, e))?;

    let mut stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let mut reader = BufReader::new(stdout);

    // Initialize
    let init_req = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "clickyx", "version": "1.0"}
        }
    });
    let init_str = format!("{}\n", serde_json::to_string(&init_req).unwrap_or_default());
    stdin
        .write_all(init_str.as_bytes())
        .map_err(|e| format!("write init: {e}"))?;

    let mut init_resp = String::new();
    let _ = reader.read_line(&mut init_resp);

    // Call the tool
    let call_req = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
            "name": tool,
            "arguments": args
        }
    });
    let call_str = format!("{}\n", serde_json::to_string(&call_req).unwrap_or_default());
    stdin
        .write_all(call_str.as_bytes())
        .map_err(|e| format!("write call: {e}"))?;

    let mut resp_line = String::new();
    let _ = reader.read_line(&mut resp_line);
    let _ = child.kill();

    let resp: serde_json::Value = serde_json::from_str(&resp_line)
        .map_err(|e| format!("invalid JSON-RPC response: {e}"))?;

    if let Some(error) = resp.get("error") {
        return Err(format!("MCP error: {}", error));
    }

    Ok(resp.get("result").cloned().unwrap_or(serde_json::json!({})))
}

async fn mcp_tools(data: web::Data<BridgeState>) -> HttpResponse {
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

    if config.mcp_servers.is_empty() {
        return HttpResponse::Ok().json(McpToolsResponse {
            tools: vec![McpToolInfo {
                server: "none".into(),
                name: "no_mcp_servers_configured".into(),
                description: "Add MCP servers in Settings > Connections".into(),
            }],
        });
    }

    let mut all_tools: Vec<McpToolInfo> = Vec::new();
    for server in config.mcp_servers.iter().filter(|s| s.enabled) {
        let tools = mcp_list_tools_sync(server);
        log::info!(
            "MCP: listed {} tools from server '{}'",
            tools.len(),
            server.name
        );
        all_tools.extend(tools);
    }

    HttpResponse::Ok().json(McpToolsResponse { tools: all_tools })
}

async fn mcp_call(data: web::Data<BridgeState>, body: web::Json<McpCallRequest>) -> HttpResponse {
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

    let server = match config
        .mcp_servers
        .iter()
        .find(|s| s.name == body.server && s.enabled)
    {
        Some(s) => s.clone(),
        None => {
            return HttpResponse::NotFound().json(ErrorResponse {
                error: "not_found".into(),
                message: format!("MCP server '{}' not found or not enabled", body.server),
            });
        }
    };

    log::info!("MCP call: server={}, tool={}", body.server, body.tool);

    match mcp_call_tool_sync(&server, &body.tool, &body.args) {
        Ok(result) => HttpResponse::Ok().json(serde_json::json!({ "result": result })),
        Err(e) => HttpResponse::InternalServerError().json(ErrorResponse {
            error: "mcp_error".into(),
            message: e,
        }),
    }
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

/// B-008: Scroll endpoint for bridge
#[derive(Deserialize)]
struct ScrollRequest {
    x: f64,
    y: f64,
    delta_x: f64,
    delta_y: f64,
}

async fn scroll_handler(data: web::Data<BridgeState>, body: web::Json<ScrollRequest>) -> HttpResponse {
    let app = &data.app_handle;
    log::info!(
        "Scroll at ({}, {}) delta=({}, {})",
        body.x,
        body.y,
        body.delta_x,
        body.delta_y
    );

    let config = crate::config::load_config(app).unwrap_or_default();
    let backend = if config.computer_use.native_cua {
        crate::cua::CuaBackend::Native
    } else {
        crate::cua::CuaBackend::Background
    };

    let mut sim = crate::cua::InputSimulator::new(backend);
    match sim.scroll(body.x, body.y, body.delta_x, body.delta_y) {
        Ok(()) => {
            emit_event(
                &data,
                "guidance_update",
                &format!(
                    "{{\"action\":\"scroll\",\"x\":{},\"y\":{},\"delta_x\":{},\"delta_y\":{}}}",
                    body.x, body.y, body.delta_x, body.delta_y
                ),
            );
            HttpResponse::Ok().json(OkResponse { ok: true })
        }
        Err(e) => HttpResponse::InternalServerError().json(ErrorResponse {
            error: "scroll_error".into(),
            message: e,
        }),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cursor_request_serde() {
        let json = r#"{"x":100.0,"y":200.0,"label":"test","accent":null}"#;
        let req: CursorRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.x, 100.0);
        assert_eq!(req.y, 200.0);
        assert_eq!(req.label.unwrap(), "test");
    }

    #[test]
    fn test_wav_to_pcm_f32_with_empty() {
        let result = wav_to_pcm_f32(&[]);
        assert!(result.is_empty());
    }

    #[test]
    fn test_ok_response_serde() {
        let r = OkResponse { ok: true };
        let json = serde_json::to_string(&r).unwrap();
        assert_eq!(json, r#"{"ok":true}"#);
    }

    #[test]
    fn test_error_response_serde() {
        let r = ErrorResponse { error: "test_error".into(), message: "test message".into() };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("test_error"));
    }

    #[test]
    fn test_health_response_struct() {
        let h = HealthResponse { status: "ok".into(), version: "0.1.1".into() };
        let json = serde_json::to_string(&h).unwrap();
        assert!(json.contains("0.1.1"));
    }

    #[test]
    fn test_bridge_state_new() {
        // Just verify the struct exists and builds
        let _ = HealthResponse { status: "ok".into(), version: "0.1.1".into() };
    }
}

pub fn start_bridge(app_handle: AppHandle, bridge_token: Option<String>) {
    log::info!("Starting bridge server thread");
    std::thread::spawn(move || {
        let bridge_state = BridgeState::new(app_handle);
        let data = web::Data::new(bridge_state);
        let auth_config = web::Data::new(BridgeAuthConfig { token: bridge_token });

        #[cfg(target_os = "windows")]
        {
            // On Windows, create a single-threaded runtime to avoid any I/O
            // completion port interactions with Tauri's own tokio runtime.
            actix_web::rt::System::new().block_on(async {
                run_bridge_server(data, auth_config).await;
            });
        }
        #[cfg(not(target_os = "windows"))]
        {
            actix_web::rt::System::new().block_on(async {
                run_bridge_server(data, auth_config).await;
            });
        }
    });
}

async fn run_bridge_server(
    data: web::Data<BridgeState>,
    auth_config: web::Data<BridgeAuthConfig>,
) {
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
            .route("/scroll", web::post().to(scroll_handler))
            .route("/agents", web::get().to(bridge_list_agents))
            .route("/agent/create", web::post().to(bridge_create_agent))
            .route("/agent/{slug}/run", web::post().to(bridge_run_agent))
            .route("/agent/{slug}/stop", web::post().to(bridge_stop_agent))
            .route("/agent/{slug}/status", web::get().to(bridge_agent_status))
            .route("/skills", web::get().to(bridge_list_skills))
            .default_service(web::route().to(not_found))
    })
    .workers(1)
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
}
