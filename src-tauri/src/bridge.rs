use actix_web::{web, App, HttpServer, HttpResponse, middleware};
use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Clone)]
pub struct BridgeState {
    pub app_handle: AppHandle,
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

async fn not_found() -> HttpResponse {
    HttpResponse::NotFound().json(ErrorResponse {
        error: "not_found".into(),
        message: "Route not found".into(),
    })
}

pub fn start_bridge(app_handle: AppHandle) {
    log::info!("Starting bridge server thread");
    std::thread::spawn(move || {
        let bridge_state = BridgeState { app_handle };
        let data = web::Data::new(bridge_state);

        let rt = actix_rt::System::new();
        rt.block_on(async {
            let server = HttpServer::new(move || {
                App::new()
                    .wrap(middleware::Logger::default())
                    .app_data(data.clone())
                    .route("/health", web::get().to(health))
                    .route("/panel/toggle", web::post().to(toggle_panel))
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
