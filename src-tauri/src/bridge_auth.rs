use actix_web::{
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    http::header,
    Error, HttpResponse,
};
use futures_util::future::LocalBoxFuture;
use std::collections::{HashMap, VecDeque};
use std::future::{ready, Ready};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Instant;
use subtle::ConstantTimeEq;

/// Runtime bridge-auth settings, shared between the Tauri command layer
/// (which rotates the token) and the HTTP middleware (which enforces it).
/// P0-T1: hot-reloadable — `set_bridge_token` takes effect immediately.
#[derive(Debug, Clone)]
pub struct AuthSettings {
    pub token: Option<String>,
    /// Explicit opt-out. When true, read-only endpoints are open but the
    /// dangerous tier (computer use, screenshots, AI spend, process spawn)
    /// STILL requires a valid token.
    pub auth_disabled: bool,
}

impl AuthSettings {
    pub fn new(token: Option<String>, auth_disabled: bool) -> Self {
        Self {
            token,
            auth_disabled,
        }
    }
}

/// Tauri-managed shared state for bridge auth (hot-reload target).
#[derive(Clone)]
pub struct SharedAuthSettings(pub Arc<RwLock<AuthSettings>>);

impl SharedAuthSettings {
    pub fn new(token: Option<String>, auth_disabled: bool) -> Self {
        Self(Arc::new(RwLock::new(AuthSettings::new(
            token,
            auth_disabled,
        ))))
    }

    pub fn snapshot(&self) -> AuthSettings {
        self.0
            .read()
            .map(|s| s.clone())
            .unwrap_or(AuthSettings::new(None, false))
    }

    pub fn set_token(&self, token: Option<String>) {
        if let Ok(mut s) = self.0.write() {
            s.token = token;
        }
    }

    pub fn set_disabled(&self, disabled: bool) {
        if let Ok(mut s) = self.0.write() {
            s.auth_disabled = disabled;
        }
    }
}

#[derive(Clone)]
pub struct BridgeAuthConfig {
    pub settings: Arc<RwLock<AuthSettings>>,
}

impl BridgeAuthConfig {
    pub fn shared(shared: &SharedAuthSettings) -> Self {
        Self {
            settings: shared.0.clone(),
        }
    }
}

/// Endpoints that can drive the machine, capture the screen, spend the user's
/// API keys, or spawn processes. These ALWAYS require a valid token — even
/// when the user explicitly disabled auth for the read-only tier.
fn is_dangerous_path(path: &str) -> bool {
    const DANGEROUS_PREFIXES: &[&str] = &[
        "/click",
        "/scroll",
        "/screenshot",
        "/v1/messages",
        "/v1/responses",
        "/mcp/call",
        "/agent/",
        "/transcribe",
        "/speak",
    ];
    // Exact match for short paths; prefix match for nested ones (/agent/{slug}/run).
    DANGEROUS_PREFIXES.iter().any(|p| {
        if p.ends_with('/') {
            path.starts_with(*p)
        } else {
            path == *p || path.starts_with(&format!("{p}/"))
        }
    })
}

/// Hosts the bridge may serve. Anything else is rejected with 403 — this kills
/// DNS-rebinding attacks where `http://evil.tld:32123` resolves to 127.0.0.1
/// (CORS alone does not stop those; the browser treats the rebound origin as
/// same-origin).
fn is_allowed_host(host: &str) -> bool {
    // Strip an optional :port suffix (but not an IPv6 literal).
    let bare = if host.starts_with('[') {
        host.split(']')
            .next()
            .unwrap_or(host)
            .trim_start_matches('[')
    } else if let Some(idx) = host.rfind(':') {
        // Only strip if there is a single colon (host:port, not IPv6).
        if host[..idx].contains(':') {
            host
        } else {
            &host[..idx]
        }
    } else {
        host
    };
    let bare = bare.to_ascii_lowercase();
    bare == "127.0.0.1" || bare == "localhost"
}

/// Simple per-IP fixed-window rate limiter (stdlib only, no new deps).
/// Generous limits: localhost automation should never trip it, floods will.
#[derive(Clone)]
pub struct RateLimitState {
    inner: Arc<Mutex<HashMap<String, VecDeque<Instant>>>>,
}

impl RateLimitState {
    pub const WINDOW_SECS: u64 = 60;
    pub const MAX_REQUESTS: usize = 600;

    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Returns true when the request is allowed.
    pub fn check(&self, ip: &str) -> bool {
        let now = Instant::now();
        let window = std::time::Duration::from_secs(Self::WINDOW_SECS);
        let mut map = match self.inner.lock() {
            Ok(m) => m,
            Err(_) => return true, // fail-open on poison: availability over strictness for localhost
        };
        // Bound map growth: evict empties opportunistically.
        if map.len() > 1024 {
            map.retain(|_, q| {
                q.back()
                    .map(|t| now.duration_since(*t) < window)
                    .unwrap_or(false)
            });
        }
        let q = map.entry(ip.to_string()).or_default();
        while q
            .front()
            .map(|t| now.duration_since(*t) >= window)
            .unwrap_or(false)
        {
            q.pop_front();
        }
        if q.len() >= Self::MAX_REQUESTS {
            return false;
        }
        q.push_back(now);
        true
    }
}

impl Default for RateLimitState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone)]
pub struct Auth {
    pub config: BridgeAuthConfig,
    pub limits: RateLimitState,
}

impl Auth {
    pub fn new(config: BridgeAuthConfig, limits: RateLimitState) -> Self {
        Self { config, limits }
    }
}

impl<S> Transform<S, ServiceRequest> for Auth
where
    S: Service<ServiceRequest, Response = ServiceResponse, Error = Error> + 'static,
    S::Future: 'static,
{
    type Response = ServiceResponse;
    type Error = Error;
    type Transform = AuthMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(AuthMiddleware {
            service,
            config: self.config.clone(),
            limits: self.limits.clone(),
        }))
    }
}

pub struct AuthMiddleware<S> {
    service: S,
    config: BridgeAuthConfig,
    limits: RateLimitState,
}

/// Extract a bearer-style token from the request. Accepts (in order):
/// `Authorization: Bearer <t>`, `x-openclicky-token: <t>`, `X-Bridge-Token: <t>`
/// (the last is what BRIDGE_API.md/CONFIGURATION.md documented — H-7 fixed by
/// accepting it rather than 401ing doc-following clients into disabling auth).
fn extract_token(req: &ServiceRequest) -> Option<String> {
    req.headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok().map(|s| s.to_owned()))
        .or_else(|| {
            req.headers()
                .get("x-openclicky-token")
                .and_then(|v| v.to_str().ok().map(|s| s.to_owned()))
        })
        .or_else(|| {
            req.headers()
                .get("x-bridge-token")
                .and_then(|v| v.to_str().ok().map(|s| s.to_owned()))
        })
        .map(|h| h.strip_prefix("Bearer ").unwrap_or(&h).trim().to_owned())
}

fn token_valid(expected: &Option<String>, provided: &Option<String>) -> bool {
    match (expected, provided) {
        (Some(exp), Some(got)) if !exp.is_empty() && !got.is_empty() => {
            exp.as_bytes().ct_eq(got.as_bytes()).unwrap_u8() == 1
        }
        _ => false,
    }
}

fn reject(
    req: ServiceRequest,
    status: actix_web::http::StatusCode,
    error: &str,
    message: &str,
) -> Result<ServiceResponse, Error> {
    let (http_req, _payload) = req.into_parts();
    let response = HttpResponse::build(status).json(serde_json::json!({
        "error": error,
        "message": message,
    }));
    Ok(ServiceResponse::new(
        http_req,
        response.map_into_boxed_body(),
    ))
}

impl<S> Service<ServiceRequest> for AuthMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse, Error = Error> + 'static,
    S::Future: 'static,
{
    type Response = ServiceResponse;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        // P0-T1: Host validation first — kills DNS rebinding (C-3).
        let host = req.connection_info().host().to_owned();
        if !is_allowed_host(&host) {
            return Box::pin(async move {
                reject(
                    req,
                    actix_web::http::StatusCode::FORBIDDEN,
                    "forbidden",
                    "Unrecognized Host header",
                )
            });
        }

        // P0-T1: rate limiting (self-admitted gap in bridge.rs).
        let ip = req
            .connection_info()
            .realip_remote_addr()
            .unwrap_or("unknown")
            .to_owned();
        if !self.limits.check(&ip) {
            return Box::pin(async move {
                reject(
                    req,
                    actix_web::http::StatusCode::TOO_MANY_REQUESTS,
                    "rate_limited",
                    "Too many requests — slow down",
                )
            });
        }

        let path = req.path().to_owned();
        // /health is always exempt from *auth* (spec FR6.5) but still gets
        // host validation + rate limiting above.
        if path == "/health" {
            let fut = self.service.call(req);
            return Box::pin(fut);
        }

        let settings = self
            .config
            .settings
            .read()
            .map(|s| s.clone())
            .unwrap_or(AuthSettings::new(None, false));
        let provided = extract_token(&req);
        let ok = if settings.auth_disabled {
            // Explicit opt-out: read-only tier open, dangerous tier still gated.
            if is_dangerous_path(&path) {
                token_valid(&settings.token, &provided)
            } else {
                true
            }
        } else {
            token_valid(&settings.token, &provided)
        };

        if !ok {
            return Box::pin(async move {
                reject(
                    req,
                    actix_web::http::StatusCode::UNAUTHORIZED,
                    "unauthorized",
                    "Invalid or missing authentication token",
                )
            });
        }

        let fut = self.service.call(req);
        Box::pin(fut)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    // NOTE: do NOT `use actix_web::test` here — it shadows the builtin
    // #[test] attribute and turns every sync unit test into a broken
    // #[actix_web::test]. Refer to it by full path instead.
    use actix_web::{web, App, HttpResponse};

    async fn ok_handler() -> HttpResponse {
        HttpResponse::Ok().finish()
    }

    fn test_auth(settings: AuthSettings) -> Auth {
        Auth::new(
            BridgeAuthConfig {
                settings: Arc::new(RwLock::new(settings)),
            },
            RateLimitState::new(),
        )
    }

    async fn test_app(
        auth: Auth,
    ) -> impl actix_web::dev::Service<
        actix_http::Request,
        Response = actix_web::dev::ServiceResponse,
        Error = actix_web::Error,
    > {
        actix_web::test::init_service(
            App::new()
                .wrap(auth)
                .route("/health", web::get().to(ok_handler))
                .route("/click", web::post().to(ok_handler))
                .route("/models", web::get().to(ok_handler)),
        )
        .await
    }

    #[actix_web::test]
    async fn test_health_open_without_token() {
        let app = test_app(test_auth(AuthSettings::new(Some("secret".into()), false))).await;
        let req = actix_web::test::TestRequest::get()
            .uri("/health")
            .to_request();
        let resp = actix_web::test::call_service(&app, req).await;
        assert_eq!(resp.status(), 200);
    }

    #[actix_web::test]
    async fn test_dangerous_requires_token() {
        let app = test_app(test_auth(AuthSettings::new(Some("secret".into()), false))).await;
        let req = actix_web::test::TestRequest::post()
            .uri("/click")
            .to_request();
        let resp = actix_web::test::call_service(&app, req).await;
        assert_eq!(resp.status(), 401);
    }

    #[actix_web::test]
    async fn test_bearer_header_accepted() {
        let app = test_app(test_auth(AuthSettings::new(Some("secret".into()), false))).await;
        let req = actix_web::test::TestRequest::post()
            .uri("/click")
            .insert_header((header::AUTHORIZATION, "Bearer secret"))
            .to_request();
        let resp = actix_web::test::call_service(&app, req).await;
        assert_eq!(resp.status(), 200);
    }

    #[actix_web::test]
    async fn test_openclicky_header_accepted() {
        let app = test_app(test_auth(AuthSettings::new(Some("secret".into()), false))).await;
        let req = actix_web::test::TestRequest::post()
            .uri("/click")
            .insert_header(("x-openclicky-token", "secret"))
            .to_request();
        let resp = actix_web::test::call_service(&app, req).await;
        assert_eq!(resp.status(), 200);
    }

    #[actix_web::test]
    async fn test_bridge_token_header_alias_accepted() {
        // H-7: docs told clients to send X-Bridge-Token — accept it.
        let app = test_app(test_auth(AuthSettings::new(Some("secret".into()), false))).await;
        let req = actix_web::test::TestRequest::post()
            .uri("/click")
            .insert_header(("x-bridge-token", "secret"))
            .to_request();
        let resp = actix_web::test::call_service(&app, req).await;
        assert_eq!(resp.status(), 200);
    }

    #[actix_web::test]
    async fn test_wrong_token_rejected() {
        let app = test_app(test_auth(AuthSettings::new(Some("secret".into()), false))).await;
        let req = actix_web::test::TestRequest::post()
            .uri("/click")
            .insert_header(("x-openclicky-token", "wrong"))
            .to_request();
        let resp = actix_web::test::call_service(&app, req).await;
        assert_eq!(resp.status(), 401);
    }

    #[actix_web::test]
    async fn test_disabled_auth_opens_readonly_but_not_dangerous() {
        let app = test_app(test_auth(AuthSettings::new(Some("secret".into()), true))).await;
        let req = actix_web::test::TestRequest::get()
            .uri("/models")
            .to_request();
        assert_eq!(actix_web::test::call_service(&app, req).await.status(), 200);
        let req = actix_web::test::TestRequest::post()
            .uri("/click")
            .to_request();
        assert_eq!(actix_web::test::call_service(&app, req).await.status(), 401);
        let req = actix_web::test::TestRequest::post()
            .uri("/click")
            .insert_header(("x-openclicky-token", "secret"))
            .to_request();
        assert_eq!(actix_web::test::call_service(&app, req).await.status(), 200);
    }

    #[actix_web::test]
    async fn test_rebound_host_rejected() {
        // C-3: DNS rebinding (Host: evil.tld) must 403 even with valid token.
        let app = test_app(test_auth(AuthSettings::new(Some("secret".into()), false))).await;
        let req = actix_web::test::TestRequest::post()
            .uri("/click")
            .insert_header(("host", "evil.example:32123"))
            .insert_header(("x-openclicky-token", "secret"))
            .to_request();
        let resp = actix_web::test::call_service(&app, req).await;
        assert_eq!(resp.status(), 403);
    }

    #[actix_web::test]
    async fn test_localhost_variants_allowed() {
        for host in [
            "127.0.0.1:32123",
            "localhost:32123",
            "127.0.0.1",
            "LOCALHOST",
        ] {
            let app = test_app(test_auth(AuthSettings::new(Some("secret".into()), false))).await;
            let req = actix_web::test::TestRequest::get()
                .uri("/health")
                .insert_header(("host", host))
                .to_request();
            let resp = actix_web::test::call_service(&app, req).await;
            assert_eq!(resp.status(), 200, "host {host} should be allowed");
        }
    }

    #[test]
    fn test_is_allowed_host_unit() {
        assert!(is_allowed_host("127.0.0.1:32123"));
        assert!(is_allowed_host("localhost:32123"));
        assert!(is_allowed_host("localhost"));
        assert!(is_allowed_host("127.0.0.1"));
        assert!(!is_allowed_host("evil.example:32123"));
        assert!(!is_allowed_host("evil.example"));
        assert!(!is_allowed_host("127.0.0.1.evil.example"));
        assert!(!is_allowed_host(""));
    }

    #[test]
    fn test_is_dangerous_path_unit() {
        assert!(is_dangerous_path("/click"));
        assert!(is_dangerous_path("/scroll"));
        assert!(is_dangerous_path("/screenshot"));
        assert!(is_dangerous_path("/v1/messages"));
        assert!(is_dangerous_path("/v1/responses"));
        assert!(is_dangerous_path("/mcp/call"));
        assert!(is_dangerous_path("/agent/foo/run"));
        assert!(is_dangerous_path("/agent/foo/stop"));
        assert!(is_dangerous_path("/transcribe"));
        assert!(is_dangerous_path("/speak"));
        assert!(!is_dangerous_path("/health"));
        assert!(!is_dangerous_path("/models"));
        assert!(!is_dangerous_path("/agents"));
        assert!(!is_dangerous_path("/cursor"));
        assert!(!is_dangerous_path("/clicky")); // prefix trap must not match
    }

    #[test]
    fn test_rate_limiter_blocks_flood() {
        let limits = RateLimitState::new();
        for _ in 0..RateLimitState::MAX_REQUESTS {
            assert!(limits.check("127.0.0.1"));
        }
        assert!(!limits.check("127.0.0.1"));
        // Other IPs unaffected.
        assert!(limits.check("127.0.0.2"));
    }

    #[test]
    fn test_token_valid_unit() {
        assert!(token_valid(&Some("s".into()), &Some("s".into())));
        assert!(!token_valid(&Some("s".into()), &Some("x".into())));
        assert!(!token_valid(&Some("s".into()), &None));
        assert!(!token_valid(&None, &Some("s".into())));
        assert!(!token_valid(&Some("".into()), &Some("".into())));
    }

    #[test]
    fn test_shared_settings_hot_reload() {
        let shared = SharedAuthSettings::new(None, false);
        assert!(shared.snapshot().token.is_none());
        shared.set_token(Some("rotated".into()));
        assert_eq!(shared.snapshot().token.as_deref(), Some("rotated"));
        shared.set_disabled(true);
        assert!(shared.snapshot().auth_disabled);
    }
}
