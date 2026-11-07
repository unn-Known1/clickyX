//! "Sign in with ChatGPT": run the OpenAI side of ClickyX on the user's
//! ChatGPT plan instead of an API key.
//!
//! Implements OpenAI's open-source token-sharing flow
//! (<https://developers.openai.com/siwc/token-sharing-open-source>):
//! OAuth authorization code + PKCE on a loopback redirect, dynamic client
//! registration on first use, OIDC id_token validation against the issuer's
//! JWKS, rotating refresh tokens and revocation on sign-out.
//!
//! Tokens live only in the OS keychain (one JSON entry, via the app's
//! [`SecretStore`]); the issued client id, email and host id live in config.
//! Tokens are never logged and never placed in a URL (the one exception is the
//! `id_token_hint` OpenAI asks for on re-authorization).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use crate::secret_store::{keys, KeychainStore, SecretStore};

pub const ISSUER: &str = "https://auth.openai.com";
pub const RESOURCE: &str = "https://api.openai.com/v1";
pub const SCOPES: &str =
    "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
/// The scope that lets an app spend the user's plan. Without it we stay
/// signed in but plan usage is disabled.
pub const PLAN_SCOPE: &str = "chatgpt.tokens.use.direct";
pub const DYNAMIC_CLIENT_ID: &str = "dynamic_agent_client";
pub const AGENT_NAME: &str = "ClickyX";
pub const CALLBACK_PATH: &str = "/auth/callback";
pub const LOOPBACK_PORTS: [u16; 6] = [1455, 1456, 1457, 1458, 1459, 1460];
pub const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(5 * 60);
/// Refresh this long before the access token expires.
pub const REFRESH_SKEW_SECS: u64 = 120;

/// Refresh errors after which the stored tokens can never work again.
const TERMINAL_REFRESH_ERRORS: [&str; 6] = [
    "invalid_grant",
    "invalid_refresh_token",
    "token_expired",
    "refresh_token_expired",
    "refresh_token_invalidated",
    "refresh_token_reused",
];

/// Signature algorithms accepted for the id_token (the JWKS key names the
/// exact one). Symmetric (HS*) and `none`-style algorithms never qualify.
const ALLOWED_ID_TOKEN_ALGS: [Algorithm; 8] = [
    Algorithm::RS256,
    Algorithm::RS384,
    Algorithm::RS512,
    Algorithm::PS256,
    Algorithm::PS384,
    Algorithm::PS512,
    Algorithm::ES256,
    Algorithm::ES384,
];

/// Where the flow talks to. Production values by default; tests point these
/// at a loopback mock.
#[derive(Debug, Clone)]
pub struct Endpoints {
    pub issuer: String,
    pub authorize_url: String,
    pub token_url: String,
    pub discovery_url: String,
    /// OpenAI API base for plan inference (`/v1/responses`, `/v1/models`).
    pub api_base: String,
    pub ports: Vec<u16>,
    pub sign_in_timeout: Duration,
}

impl Default for Endpoints {
    fn default() -> Self {
        Self {
            issuer: ISSUER.into(),
            authorize_url: format!("{ISSUER}/api/accounts/authorize"),
            token_url: format!("{ISSUER}/api/accounts/oauth/token"),
            discovery_url: format!("{ISSUER}/.well-known/openid-configuration"),
            api_base: "https://api.openai.com".into(),
            ports: LOOPBACK_PORTS.to_vec(),
            sign_in_timeout: SIGN_IN_TIMEOUT,
        }
    }
}

/// Everything that can go wrong, with user-presentable text (`Display`).
/// No variant carries a token, a code or response content.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChatGptError {
    Cancelled,
    TimedOut,
    PortsBusy,
    InProgress,
    Browser(String),
    StateMismatch,
    NoCode,
    Denied(String),
    IncompleteRegistration,
    ClientMismatch,
    Token { status: u16, code: String },
    TokenResponse(String),
    Network(String),
    IdToken(String),
    NonceMismatch,
    KeychainUnavailable,
    Keychain(String),
    NotSignedIn,
    PlanUsageDisabled,
    SessionExpired,
    RefreshFailed(u16),
}

impl std::fmt::Display for ChatGptError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        use ChatGptError::*;
        match self {
            Cancelled => write!(f, "Sign-in was cancelled."),
            TimedOut => write!(f, "Sign-in timed out after 5 minutes. Try again."),
            PortsBusy => write!(
                f,
                "Ports 1455-1460 are all busy. Close other sign-in windows or apps using them and try again."
            ),
            InProgress => write!(f, "A ChatGPT sign-in is already in progress."),
            Browser(e) => write!(f, "Couldn't open your browser for sign-in: {e}"),
            StateMismatch => write!(f, "Sign-in failed a security check (state mismatch). Try again."),
            NoCode => write!(f, "Sign-in failed: no authorization code came back."),
            Denied(code) => write!(f, "Sign-in failed: {code}"),
            IncompleteRegistration => write!(
                f,
                "Registration with ChatGPT did not finish (no client ID was returned). Try again."
            ),
            ClientMismatch => write!(
                f,
                "ChatGPT returned a different app registration than expected. Try signing in again."
            ),
            Token { status, code } if code.is_empty() => {
                write!(f, "Sign-in failed at the token step (HTTP {status}).")
            }
            Token { status, code } => {
                write!(f, "Sign-in failed at the token step (HTTP {status}, {code}).")
            }
            TokenResponse(e) => write!(f, "ChatGPT sent an unexpected sign-in response: {e}"),
            Network(e) => write!(f, "Couldn't reach ChatGPT: {e}"),
            IdToken(e) => write!(f, "The ChatGPT identity token was rejected: {e}"),
            NonceMismatch => write!(f, "Sign-in failed a security check (nonce mismatch). Try again."),
            KeychainUnavailable => write!(
                f,
                "The OS keychain isn't available, so the ChatGPT sign-in can't be stored safely. Use an API key instead."
            ),
            Keychain(e) => write!(f, "Couldn't update the OS keychain: {e}"),
            NotSignedIn => write!(f, "Sign in with ChatGPT in AI Providers first."),
            PlanUsageDisabled => write!(
                f,
                "ChatGPT plan usage is not enabled for ClickyX. Sign in again and allow plan usage, or use an API key."
            ),
            SessionExpired => write!(
                f,
                "Your ChatGPT sign-in has expired. Sign in again in AI Providers."
            ),
            RefreshFailed(status) => write!(
                f,
                "Couldn't refresh the ChatGPT sign-in (HTTP {status}). Check your internet connection."
            ),
        }
    }
}

impl std::error::Error for ChatGptError {}

// ── Small helpers ───────────────────────────────────────────────────────────

fn b64url(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn random_token(bytes: usize) -> String {
    use rand::RngCore;
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    b64url(&buf)
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// PKCE S256: `base64url(SHA-256(verifier))` without padding (RFC 7636).
pub fn code_challenge(verifier: &str) -> String {
    b64url(&Sha256::digest(verifier.as_bytes()))
}

pub fn new_host_id() -> String {
    format!("urn:uuid:{}", uuid::Uuid::new_v4())
}

pub fn has_plan_scope(scope: &str) -> bool {
    scope.split_whitespace().any(|s| s == PLAN_SCOPE)
}

fn redirect_uri(port: u16) -> String {
    format!("http://127.0.0.1:{port}{CALLBACK_PATH}")
}

// ── Authorize URL ───────────────────────────────────────────────────────────

pub struct AuthorizeParams<'a> {
    /// The issued client id, or `None` on first registration.
    pub saved_client_id: Option<&'a str>,
    pub host_id: &'a str,
    pub redirect_uri: &'a str,
    pub state: &'a str,
    pub nonce: &'a str,
    pub code_challenge: &'a str,
    pub id_token_hint: Option<&'a str>,
    pub login_hint: Option<&'a str>,
}

pub fn build_authorize_url(authorize_url: &str, p: &AuthorizeParams) -> Result<String, ChatGptError> {
    let mut url = reqwest::Url::parse(authorize_url)
        .map_err(|e| ChatGptError::Browser(format!("bad authorize URL: {e}")))?;
    {
        let mut q = url.query_pairs_mut();
        q.append_pair("client_id", p.saved_client_id.unwrap_or(DYNAMIC_CLIENT_ID));
        if p.saved_client_id.is_none() {
            q.append_pair("agent_name_hint", AGENT_NAME);
        }
        q.append_pair("ext_agent_host_id", p.host_id);
        if p.saved_client_id.is_some() {
            if let Some(hint) = p.id_token_hint.filter(|h| !h.is_empty()) {
                q.append_pair("id_token_hint", hint);
            }
            if let Some(hint) = p.login_hint.filter(|h| !h.is_empty()) {
                q.append_pair("login_hint", hint);
            }
        }
        q.append_pair("response_type", "code");
        q.append_pair("redirect_uri", p.redirect_uri);
        q.append_pair("scope", SCOPES);
        q.append_pair("resource", RESOURCE);
        q.append_pair("state", p.state);
        q.append_pair("nonce", p.nonce);
        q.append_pair("code_challenge", p.code_challenge);
        q.append_pair("code_challenge_method", "S256");
    }
    Ok(url.into())
}

// ── Callback validation ─────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidCallback {
    pub code: String,
    /// The client id to use from now on (issued on first registration).
    pub client_id: String,
    pub scope: Option<String>,
}

pub fn validate_callback(
    params: &[(String, String)],
    expected_state: &str,
    saved_client_id: Option<&str>,
) -> Result<ValidCallback, ChatGptError> {
    let get = |k: &str| {
        params
            .iter()
            .find(|(key, _)| key == k)
            .map(|(_, v)| v.as_str())
    };
    if get("state") != Some(expected_state) {
        return Err(ChatGptError::StateMismatch);
    }
    if let Some(err) = get("error") {
        return Err(if err == "access_denied" {
            ChatGptError::Cancelled
        } else {
            let safe: String = err
                .chars()
                .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
                .take(40)
                .collect();
            ChatGptError::Denied(safe)
        });
    }
    let code = get("code")
        .filter(|c| !c.is_empty())
        .ok_or(ChatGptError::NoCode)?;
    let returned = get("client_id").filter(|c| !c.is_empty());
    let client_id = match (saved_client_id, returned) {
        // First registration must hand back an issued id, never the placeholder.
        (None, None) => return Err(ChatGptError::IncompleteRegistration),
        (None, Some(DYNAMIC_CLIENT_ID)) => return Err(ChatGptError::IncompleteRegistration),
        (None, Some(id)) => id.to_string(),
        (Some(saved), Some(id)) if saved != id => return Err(ChatGptError::ClientMismatch),
        (Some(saved), _) => saved.to_string(),
    };
    Ok(ValidCallback {
        code: code.to_string(),
        client_id,
        scope: get("scope").map(str::to_string),
    })
}

// ── Token endpoint ──────────────────────────────────────────────────────────

/// Stored credentials. `Debug` is hand-written so a stray `{:?}` can't leak.
#[derive(Clone, Serialize, Deserialize)]
pub struct TokenSet {
    pub access_token: String,
    pub refresh_token: String,
    #[serde(default)]
    pub id_token: Option<String>,
    #[serde(default)]
    pub token_type: String,
    /// Unix seconds.
    pub expires_at: u64,
    #[serde(default)]
    pub scope: String,
}

impl std::fmt::Debug for TokenSet {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TokenSet")
            .field("expires_at", &self.expires_at)
            .field("scope", &self.scope)
            .finish_non_exhaustive()
    }
}

impl TokenSet {
    pub fn plan_enabled(&self) -> bool {
        has_plan_scope(&self.scope)
    }

    pub fn needs_refresh(&self, now: u64) -> bool {
        now + REFRESH_SKEW_SECS >= self.expires_at
    }
}

#[derive(Deserialize)]
struct RawTokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    id_token: Option<String>,
    token_type: Option<String>,
    expires_in: Option<serde_json::Value>,
    scope: Option<String>,
}

/// A parsed token endpoint response.
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub id_token: Option<String>,
    pub token_type: String,
    pub expires_in: u64,
    pub scope: Option<String>,
}

pub fn parse_token_response(body: &str) -> Result<TokenResponse, ChatGptError> {
    let raw: RawTokenResponse = serde_json::from_str(body)
        .map_err(|_| ChatGptError::TokenResponse("not valid JSON".into()))?;
    let access_token = raw
        .access_token
        .filter(|t| !t.is_empty())
        .ok_or_else(|| ChatGptError::TokenResponse("missing access_token".into()))?;
    let expires_in = match raw.expires_in {
        Some(serde_json::Value::Number(n)) => n.as_u64(),
        Some(serde_json::Value::String(s)) => s.parse().ok(),
        _ => None,
    }
    .filter(|n| *n > 0)
    .unwrap_or(3600);
    Ok(TokenResponse {
        access_token,
        refresh_token: raw.refresh_token.filter(|t| !t.is_empty()),
        id_token: raw.id_token.filter(|t| !t.is_empty()),
        token_type: raw.token_type.unwrap_or_else(|| "Bearer".into()),
        expires_in,
        scope: raw.scope,
    })
}

impl TokenResponse {
    /// Merge into stored credentials: a refresh may omit the refresh token,
    /// id token or scope, in which case the previous values stand.
    pub fn into_token_set(self, now: u64, previous: Option<&TokenSet>) -> Result<TokenSet, ChatGptError> {
        let refresh_token = self
            .refresh_token
            .or_else(|| previous.map(|p| p.refresh_token.clone()))
            .ok_or_else(|| ChatGptError::TokenResponse("missing refresh_token".into()))?;
        Ok(TokenSet {
            access_token: self.access_token,
            refresh_token,
            id_token: self.id_token.or_else(|| previous.and_then(|p| p.id_token.clone())),
            token_type: self.token_type,
            expires_at: now + self.expires_in,
            scope: self
                .scope
                .or_else(|| previous.map(|p| p.scope.clone()))
                .unwrap_or_default(),
        })
    }
}

/// The OAuth error code in a token endpoint failure body, in any of the
/// shapes seen in the wild: `{"error":"x"}`, `{"error":{"code":"x"}}`, `{"code":"x"}`.
pub fn error_code(body: &str) -> String {
    let json = serde_json::from_str::<serde_json::Value>(body).unwrap_or_default();
    let raw = json
        .get("error")
        .and_then(|e| e.as_str())
        .or_else(|| json.pointer("/error/code").and_then(|c| c.as_str()))
        .or_else(|| json.get("code").and_then(|c| c.as_str()))
        .unwrap_or("");
    raw.chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
        .take(64)
        .collect()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RefreshFailure {
    /// The stored tokens are dead: clear them and require a fresh sign-in.
    Terminal(String),
    /// Anything else (network blip, 5xx, unknown code): keep the tokens.
    Transient(u16),
}

pub fn classify_refresh_error(status: u16, body: &str) -> RefreshFailure {
    let code = error_code(body);
    if TERMINAL_REFRESH_ERRORS.contains(&code.as_str()) {
        RefreshFailure::Terminal(code)
    } else {
        RefreshFailure::Transient(status)
    }
}

// ── id_token validation ─────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IdClaims {
    pub subject: String,
    pub email: Option<String>,
}

#[derive(Deserialize)]
struct RawClaims {
    #[serde(default)]
    sub: Option<String>,
    #[serde(default)]
    nonce: Option<String>,
    #[serde(default)]
    email: Option<String>,
}

/// Verify an id_token: signature against the issuer's JWKS (algorithm taken
/// from the matching key, restricted to an asymmetric allowlist), `iss`
/// exactly the issuer, `aud` the issued client id, `exp`, the saved `nonce`
/// and a non-empty `sub`.
pub fn verify_id_token(
    id_token: &str,
    jwks: &JwkSet,
    issuer: &str,
    client_id: &str,
    expected_nonce: &str,
) -> Result<IdClaims, ChatGptError> {
    let reject = |why: &str| ChatGptError::IdToken(why.to_string());
    let header = jsonwebtoken::decode_header(id_token).map_err(|_| reject("malformed token"))?;

    let jwk = match header.kid.as_deref() {
        Some(kid) => jwks.find(kid).ok_or_else(|| reject("unknown signing key"))?,
        None if jwks.keys.len() == 1 => &jwks.keys[0],
        None => return Err(reject("no key id to select a signing key")),
    };
    let key = DecodingKey::from_jwk(jwk).map_err(|_| reject("unusable signing key"))?;
    // The key names its algorithm; fall back to the header only for keys that don't.
    let alg = match jwk.common.key_algorithm {
        Some(ka) => Algorithm::try_from(ka).map_err(|_| reject("unsupported key algorithm"))?,
        None => header.alg,
    };
    if alg != header.alg {
        return Err(reject("token algorithm does not match the signing key"));
    }
    if !ALLOWED_ID_TOKEN_ALGS.contains(&alg) || alg.family() != key.family() {
        return Err(reject("signature algorithm not allowed"));
    }

    let mut validation = Validation::new(alg);
    validation.set_issuer(&[issuer]);
    validation.set_audience(&[client_id]);
    validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
    let data = jsonwebtoken::decode::<RawClaims>(id_token, &key, &validation).map_err(|e| {
        use jsonwebtoken::errors::ErrorKind::*;
        reject(match e.kind() {
            ExpiredSignature => "token expired",
            InvalidIssuer => "wrong issuer",
            InvalidAudience => "wrong audience",
            InvalidSignature => "bad signature",
            MissingRequiredClaim(_) => "missing required claim",
            _ => "validation failed",
        })
    })?;

    let subject = data.claims.sub.unwrap_or_default();
    if subject.trim().is_empty() {
        return Err(reject("empty subject"));
    }
    if data.claims.nonce.as_deref() != Some(expected_nonce) {
        return Err(ChatGptError::NonceMismatch);
    }
    Ok(IdClaims {
        subject,
        email: data.claims.email.filter(|e| !e.is_empty()),
    })
}

// ── Discovery ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct Discovery {
    jwks_uri: Option<String>,
    revocation_endpoint: Option<String>,
}

fn origin(url: &str) -> Option<String> {
    let u = reqwest::Url::parse(url).ok()?;
    Some(format!(
        "{}://{}:{}",
        u.scheme(),
        u.host_str()?,
        u.port_or_known_default()?
    ))
}

/// Endpoints named by the discovery document must live on the same origin as
/// the discovery document itself (so a tampered doc can't redirect token
/// revocation or key fetches elsewhere).
fn same_origin_as_discovery(endpoints: &Endpoints, url: &str) -> bool {
    match (origin(&endpoints.discovery_url), origin(url)) {
        (Some(a), Some(b)) => a == b,
        _ => false,
    }
}

fn http_client() -> Result<reqwest::Client, ChatGptError> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| ChatGptError::Network(e.to_string()))
}

fn net_err(e: reqwest::Error) -> ChatGptError {
    ChatGptError::Network(if e.is_timeout() {
        "the request timed out".into()
    } else if e.is_connect() {
        "connection failed".into()
    } else {
        "network error".into()
    })
}

async fn fetch_discovery(http: &reqwest::Client, endpoints: &Endpoints) -> Result<Discovery, ChatGptError> {
    let resp = http
        .get(&endpoints.discovery_url)
        .send()
        .await
        .map_err(net_err)?;
    if !resp.status().is_success() {
        return Err(ChatGptError::Network(format!(
            "discovery document unavailable (HTTP {})",
            resp.status().as_u16()
        )));
    }
    resp.json::<Discovery>()
        .await
        .map_err(|_| ChatGptError::Network("discovery document unreadable".into()))
}

async fn fetch_jwks(http: &reqwest::Client, endpoints: &Endpoints) -> Result<JwkSet, ChatGptError> {
    let discovery = fetch_discovery(http, endpoints).await?;
    let jwks_uri = discovery
        .jwks_uri
        .ok_or_else(|| ChatGptError::IdToken("discovery document has no jwks_uri".into()))?;
    if !same_origin_as_discovery(endpoints, &jwks_uri) {
        return Err(ChatGptError::IdToken("jwks_uri is not on the issuer's origin".into()));
    }
    let resp = http.get(&jwks_uri).send().await.map_err(net_err)?;
    if !resp.status().is_success() {
        return Err(ChatGptError::Network(format!(
            "signing keys unavailable (HTTP {})",
            resp.status().as_u16()
        )));
    }
    resp.json::<JwkSet>()
        .await
        .map_err(|_| ChatGptError::IdToken("signing keys unreadable".into()))
}

// ── Token storage ───────────────────────────────────────────────────────────

pub fn load_tokens(store: &dyn SecretStore) -> Option<TokenSet> {
    let raw = store.get(keys::CHATGPT_TOKENS)?;
    serde_json::from_str(&raw).ok()
}

fn save_tokens(store: &dyn SecretStore, tokens: &TokenSet) -> Result<(), ChatGptError> {
    if !store.available() {
        return Err(ChatGptError::KeychainUnavailable);
    }
    let json = serde_json::to_string(tokens).map_err(|e| ChatGptError::Keychain(e.to_string()))?;
    store
        .set(keys::CHATGPT_TOKENS, &json)
        .map_err(|_| ChatGptError::Keychain("write failed".into()))
}

pub fn clear_tokens(store: &dyn SecretStore) -> Result<(), ChatGptError> {
    if load_tokens(store).is_none() && store.get(keys::CHATGPT_TOKENS).is_none() {
        return Ok(());
    }
    store
        .delete(keys::CHATGPT_TOKENS)
        .map_err(|_| ChatGptError::Keychain("delete failed".into()))
}

// ── Loopback callback server ────────────────────────────────────────────────

const DONE_PAGE: &str = "<!doctype html><meta charset=\"utf-8\"><title>ClickyX</title>\
<body style=\"font-family:system-ui;padding:48px;text-align:center\">\
<h2>You're signed in to ClickyX.</h2><p>You can close this tab and go back to the app.</p></body>";

const FAIL_PAGE: &str = "<!doctype html><meta charset=\"utf-8\"><title>ClickyX</title>\
<body style=\"font-family:system-ui;padding:48px;text-align:center\">\
<h2>Sign-in didn't finish.</h2><p>Go back to ClickyX and try again.</p></body>";

/// Bind `127.0.0.1` (never `localhost`) on the first free port.
async fn bind_loopback(ports: &[u16]) -> Result<(TcpListener, u16), ChatGptError> {
    for port in ports {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", *port)).await {
            let bound = listener.local_addr().map(|a| a.port()).unwrap_or(*port);
            return Ok((listener, bound));
        }
    }
    Err(ChatGptError::PortsBusy)
}

async fn respond(socket: &mut tokio::net::TcpStream, status: &str, body: &str) {
    let msg = format!(
        "HTTP/1.1 {status}\r\ncontent-type: text/html; charset=utf-8\r\ncontent-length: {}\r\ncache-control: no-store\r\nconnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = socket.write_all(msg.as_bytes()).await;
    let _ = socket.shutdown().await;
}

/// Wait for the browser to hit `CALLBACK_PATH`; returns its query pairs.
async fn await_callback(
    listener: TcpListener,
    expected_state: &str,
    timeout: Duration,
) -> Result<Vec<(String, String)>, ChatGptError> {
    let serve = async {
        loop {
            let Ok((mut socket, _)) = listener.accept().await else {
                continue;
            };
            let mut data: Vec<u8> = Vec::new();
            let mut chunk = [0u8; 2048];
            let read = tokio::time::timeout(Duration::from_secs(5), async {
                loop {
                    let n = socket.read(&mut chunk).await.unwrap_or(0);
                    if n == 0 {
                        break;
                    }
                    data.extend_from_slice(&chunk[..n]);
                    if data.windows(4).any(|w| w == b"\r\n\r\n") || data.len() > 16 * 1024 {
                        break;
                    }
                }
            })
            .await;
            if read.is_err() || data.is_empty() {
                continue;
            }
            let head = String::from_utf8_lossy(&data);
            let mut parts = head.lines().next().unwrap_or("").split_whitespace();
            let (method, target) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
            let Ok(url) = reqwest::Url::parse(&format!("http://127.0.0.1{target}")) else {
                respond(&mut socket, "400 Bad Request", "").await;
                continue;
            };
            if method != "GET" || url.path() != CALLBACK_PATH {
                respond(&mut socket, "404 Not Found", "").await;
                continue;
            }
            let pairs: Vec<(String, String)> = url
                .query_pairs()
                .map(|(k, v)| (k.into_owned(), v.into_owned()))
                .collect();
            let ok = pairs.iter().any(|(k, v)| k == "code" && !v.is_empty())
                && pairs.iter().any(|(k, v)| k == "state" && v == expected_state)
                && !pairs.iter().any(|(k, _)| k == "error");
            respond(&mut socket, "200 OK", if ok { DONE_PAGE } else { FAIL_PAGE }).await;
            return pairs;
        }
    };
    tokio::time::timeout(timeout, serve)
        .await
        .map_err(|_| ChatGptError::TimedOut)
}

// ── Sign-in ─────────────────────────────────────────────────────────────────

static SIGN_IN_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Held for the duration of an interactive sign-in so only one runs at a
/// time (the command layer takes it; the flow itself stays re-entrant for tests).
pub struct SignInGuard;

impl SignInGuard {
    pub fn acquire() -> Result<Self, ChatGptError> {
        SIGN_IN_ACTIVE
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| SignInGuard)
            .map_err(|_| ChatGptError::InProgress)
    }
}

impl Drop for SignInGuard {
    fn drop(&mut self) {
        SIGN_IN_ACTIVE.store(false, Ordering::Release);
    }
}

/// What the caller knows before signing in.
#[derive(Debug, Clone, Default)]
pub struct SignInRequest {
    /// Issued client id from a previous sign-in (`None` = first registration).
    pub saved_client_id: Option<String>,
    pub host_id: String,
    /// Saved email, sent as `login_hint` on re-authorization.
    pub email: Option<String>,
    /// Last id_token, sent as `id_token_hint` on re-authorization.
    pub id_token_hint: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignInOutcome {
    /// Persist this in config; it is never `dynamic_agent_client`.
    pub client_id: String,
    pub email: Option<String>,
    pub subject: String,
    pub plan_enabled: bool,
}

/// Run the whole interactive flow. `open_browser` receives the authorize URL
/// (it is only called after the loopback listener is up).
pub async fn sign_in<F>(
    endpoints: &Endpoints,
    store: &dyn SecretStore,
    req: &SignInRequest,
    open_browser: F,
) -> Result<SignInOutcome, ChatGptError>
where
    F: FnOnce(String) -> Result<(), String>,
{
    if !store.available() {
        return Err(ChatGptError::KeychainUnavailable);
    }

    let verifier = random_token(32);
    let challenge = code_challenge(&verifier);
    let state = random_token(16);
    let nonce = random_token(16);

    // Listen first, then open the browser.
    let (listener, port) = bind_loopback(&endpoints.ports).await?;
    let redirect = redirect_uri(port);
    let url = build_authorize_url(
        &endpoints.authorize_url,
        &AuthorizeParams {
            saved_client_id: req.saved_client_id.as_deref(),
            host_id: &req.host_id,
            redirect_uri: &redirect,
            state: &state,
            nonce: &nonce,
            code_challenge: &challenge,
            id_token_hint: req.id_token_hint.as_deref(),
            login_hint: req.email.as_deref(),
        },
    )?;
    open_browser(url).map_err(ChatGptError::Browser)?;

    let pairs = await_callback(listener, &state, endpoints.sign_in_timeout).await?;
    let callback = validate_callback(&pairs, &state, req.saved_client_id.as_deref())?;

    let http = http_client()?;
    let resp = http
        .post(&endpoints.token_url)
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", callback.client_id.as_str()),
            ("code", callback.code.as_str()),
            ("code_verifier", verifier.as_str()),
            ("redirect_uri", redirect.as_str()),
            ("resource", RESOURCE),
        ])
        .send()
        .await
        .map_err(net_err)?;
    let status = resp.status().as_u16();
    let body = resp.text().await.map_err(net_err)?;
    if !(200..300).contains(&status) {
        return Err(ChatGptError::Token {
            status,
            code: error_code(&body),
        });
    }
    let parsed = parse_token_response(&body)?;
    let id_token = parsed
        .id_token
        .clone()
        .ok_or_else(|| ChatGptError::IdToken("the response had no id_token".into()))?;

    let jwks = fetch_jwks(&http, endpoints).await?;
    let claims = verify_id_token(&id_token, &jwks, &endpoints.issuer, &callback.client_id, &nonce)?;

    let tokens = parsed.into_token_set(now_secs(), None)?;
    let plan_enabled = tokens.plan_enabled();
    save_tokens(store, &tokens)?;
    log::info!(
        "ChatGPT sign-in complete; plan usage {}",
        if plan_enabled { "enabled" } else { "NOT enabled" }
    );
    Ok(SignInOutcome {
        client_id: callback.client_id,
        email: claims.email,
        subject: claims.subject,
        plan_enabled,
    })
}

// ── Session: access tokens, refresh, sign-out ───────────────────────────────

/// One mutex for every refresh in the process: refresh tokens rotate, so two
/// racing refreshes would burn the token and force a new sign-in.
static REFRESH_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignOutOutcome {
    /// True when the server confirmed revocation (or there was nothing to revoke).
    pub revocation_confirmed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SessionStatus {
    pub signed_in: bool,
    pub plan_enabled: bool,
    pub expires_at: Option<u64>,
}

pub struct ChatGptAuth {
    store: Arc<dyn SecretStore>,
    endpoints: Endpoints,
    client_id: Option<String>,
}

impl ChatGptAuth {
    pub fn new(store: Arc<dyn SecretStore>, endpoints: Endpoints, client_id: Option<String>) -> Self {
        Self {
            store,
            endpoints,
            client_id: client_id.filter(|c| !c.is_empty()),
        }
    }

    /// Production wiring: OS keychain, OpenAI endpoints, the saved client id.
    pub fn from_client_id(client_id: Option<String>) -> Self {
        Self::new(Arc::new(KeychainStore), Endpoints::default(), client_id)
    }

    pub fn api_base(&self) -> &str {
        &self.endpoints.api_base
    }

    pub fn status(&self) -> SessionStatus {
        match load_tokens(self.store.as_ref()) {
            Some(t) => SessionStatus {
                signed_in: true,
                plan_enabled: t.plan_enabled(),
                expires_at: Some(t.expires_at),
            },
            None => SessionStatus {
                signed_in: false,
                plan_enabled: false,
                expires_at: None,
            },
        }
    }

    /// The last id_token, for the `id_token_hint` of a re-authorization.
    pub fn id_token_hint(&self) -> Option<String> {
        load_tokens(self.store.as_ref()).and_then(|t| t.id_token)
    }

    /// A valid access token, refreshing first when it is within two minutes
    /// of expiry. Fails if plan usage wasn't granted.
    pub async fn access_token(&self) -> Result<String, ChatGptError> {
        let tokens = load_tokens(self.store.as_ref()).ok_or(ChatGptError::NotSignedIn)?;
        if !tokens.plan_enabled() {
            return Err(ChatGptError::PlanUsageDisabled);
        }
        if !tokens.needs_refresh(now_secs()) {
            return Ok(tokens.access_token);
        }
        self.refresh(None).await
    }

    /// After a 401 for `rejected`: refresh once (unless another task already
    /// replaced that token) and return the new access token.
    pub async fn refresh_after_unauthorized(&self, rejected: &str) -> Result<String, ChatGptError> {
        self.refresh(Some(rejected)).await
    }

    async fn refresh(&self, rejected: Option<&str>) -> Result<String, ChatGptError> {
        let _lock = REFRESH_LOCK.lock().await;
        let current = load_tokens(self.store.as_ref()).ok_or(ChatGptError::NotSignedIn)?;
        match rejected {
            // Someone else already rotated the token while we waited.
            Some(r) if current.access_token != r => return Ok(current.access_token),
            None if !current.needs_refresh(now_secs()) => return Ok(current.access_token),
            _ => {}
        }
        let client_id = self.client_id.as_deref().ok_or(ChatGptError::NotSignedIn)?;

        let http = http_client()?;
        let resp = http
            .post(&self.endpoints.token_url)
            .form(&[
                ("grant_type", "refresh_token"),
                ("client_id", client_id),
                ("refresh_token", current.refresh_token.as_str()),
                ("resource", RESOURCE),
            ])
            .send()
            .await
            .map_err(net_err)?;
        let status = resp.status().as_u16();
        let body = resp.text().await.map_err(net_err)?;
        if !(200..300).contains(&status) {
            return match classify_refresh_error(status, &body) {
                RefreshFailure::Terminal(code) => {
                    log::warn!("ChatGPT refresh rejected ({code}); clearing stored tokens");
                    let _ = clear_tokens(self.store.as_ref());
                    Err(ChatGptError::SessionExpired)
                }
                RefreshFailure::Transient(status) => {
                    log::warn!("ChatGPT refresh failed transiently (HTTP {status})");
                    Err(ChatGptError::RefreshFailed(status))
                }
            };
        }
        let next = parse_token_response(&body)?.into_token_set(now_secs(), Some(&current))?;
        save_tokens(self.store.as_ref(), &next)?;
        Ok(next.access_token)
    }

    /// Revoke the refresh token (best effort), then clear the stored tokens
    /// either way. The client id and host id are kept by the caller.
    pub async fn sign_out(&self) -> Result<SignOutOutcome, ChatGptError> {
        let Some(tokens) = load_tokens(self.store.as_ref()) else {
            return Ok(SignOutOutcome {
                revocation_confirmed: true,
            });
        };
        let confirmed = match self.revoke(&tokens).await {
            Ok(ok) => ok,
            Err(e) => {
                log::warn!("ChatGPT token revocation failed: {e}");
                false
            }
        };
        clear_tokens(self.store.as_ref())?;
        Ok(SignOutOutcome {
            revocation_confirmed: confirmed,
        })
    }

    async fn revoke(&self, tokens: &TokenSet) -> Result<bool, ChatGptError> {
        let client_id = self.client_id.as_deref().ok_or(ChatGptError::NotSignedIn)?;
        let http = http_client()?;
        let discovery = fetch_discovery(&http, &self.endpoints).await?;
        let Some(endpoint) = discovery.revocation_endpoint else {
            return Ok(false);
        };
        if !same_origin_as_discovery(&self.endpoints, &endpoint) {
            return Err(ChatGptError::Network(
                "revocation endpoint is not on the issuer's origin".into(),
            ));
        }
        let resp = http
            .post(&endpoint)
            .form(&[
                ("token", tokens.refresh_token.as_str()),
                ("token_type_hint", "refresh_token"),
                ("client_id", client_id),
            ])
            .send()
            .await
            .map_err(net_err)?;
        // An empty 200 is the documented success.
        Ok(resp.status().is_success())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::secret_store::MemoryStore;
    use crate::test_support::{MockResponse, MockServer};
    use jsonwebtoken::{EncodingKey, Header};
    use std::sync::Mutex;

    // Throwaway P-256 test key (fixture only; signs nothing real).
    const TEST_EC_PEM: &str = "-----BEGIN PRIVATE KEY-----\n\
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgulRcmUMDqZqT3GdM\n\
ubUb3iM0s7ZqLDUahkMtuH/bPyOhRANCAAR9i4zBlwtVjg/R6IIGfjEy6McKSsMa\n\
1/Qe2lR5Z9GwTyeDXmDKcsRLqk90wzpGlMBA9YBw+mVq+4+7X68V3xGM\n\
-----END PRIVATE KEY-----\n";
    const TEST_X: &str = "fYuMwZcLVY4P0eiCBn4xMujHCkrDGtf0HtpUeWfRsE8";
    const TEST_Y: &str = "J4NeYMpyxEuqT3TDOkaUwED1gHD6ZWr7j7tfrxXfEYw";

    fn jwks_json(kid: &str, with_alg: bool) -> serde_json::Value {
        let mut key = serde_json::json!({
            "kty": "EC", "crv": "P-256", "x": TEST_X, "y": TEST_Y, "kid": kid, "use": "sig"
        });
        if with_alg {
            key["alg"] = serde_json::json!("ES256");
        }
        serde_json::json!({ "keys": [key] })
    }

    fn jwks(kid: &str, with_alg: bool) -> JwkSet {
        serde_json::from_value(jwks_json(kid, with_alg)).expect("valid test jwks")
    }

    fn mint(claims: serde_json::Value, kid: Option<&str>) -> String {
        let mut header = Header::new(Algorithm::ES256);
        header.kid = kid.map(str::to_string);
        let key = EncodingKey::from_ec_pem(TEST_EC_PEM.as_bytes()).expect("test key");
        jsonwebtoken::encode(&header, &claims, &key).expect("sign")
    }

    fn good_claims(aud: &str, nonce: &str) -> serde_json::Value {
        serde_json::json!({
            "iss": "https://auth.openai.com", "aud": aud, "sub": "user-123",
            "email": "me@example.com", "nonce": nonce, "exp": now_secs() + 600
        })
    }

    fn pairs(items: &[(&str, &str)]) -> Vec<(String, String)> {
        items.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    // PKCE ---------------------------------------------------------------

    #[test]
    fn pkce_challenge_matches_rfc7636_appendix_b() {
        assert_eq!(
            code_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn random_tokens_are_unpadded_urlsafe_and_unique() {
        let a = random_token(32);
        assert_eq!(a.len(), 43);
        assert!(!a.contains(['=', '+', '/']));
        assert_ne!(a, random_token(32));
    }

    // Authorize URL ------------------------------------------------------

    fn query_of(url: &str) -> Vec<(String, String)> {
        reqwest::Url::parse(url)
            .expect("url")
            .query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect()
    }

    fn q<'a>(query: &'a [(String, String)], key: &str) -> Option<&'a str> {
        query.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
    }

    #[test]
    fn first_registration_url_uses_dynamic_client_and_agent_name() {
        let url = build_authorize_url(
            "https://auth.openai.com/api/accounts/authorize",
            &AuthorizeParams {
                saved_client_id: None,
                host_id: "urn:uuid:1111",
                redirect_uri: "http://127.0.0.1:1455/auth/callback",
                state: "st",
                nonce: "no",
                code_challenge: "ch",
                id_token_hint: Some("ignored-without-client"),
                login_hint: Some("ignored@example.com"),
            },
        )
        .expect("url");
        assert!(url.starts_with("https://auth.openai.com/api/accounts/authorize?"));
        let query = query_of(&url);
        assert_eq!(q(&query, "client_id"), Some("dynamic_agent_client"));
        assert_eq!(q(&query, "agent_name_hint"), Some("ClickyX"));
        assert_eq!(q(&query, "ext_agent_host_id"), Some("urn:uuid:1111"));
        assert_eq!(q(&query, "response_type"), Some("code"));
        assert_eq!(q(&query, "redirect_uri"), Some("http://127.0.0.1:1455/auth/callback"));
        assert_eq!(q(&query, "scope"), Some(SCOPES));
        assert_eq!(q(&query, "resource"), Some("https://api.openai.com/v1"));
        assert_eq!(q(&query, "state"), Some("st"));
        assert_eq!(q(&query, "nonce"), Some("no"));
        assert_eq!(q(&query, "code_challenge"), Some("ch"));
        assert_eq!(q(&query, "code_challenge_method"), Some("S256"));
        assert!(q(&query, "id_token_hint").is_none());
        assert!(q(&query, "login_hint").is_none());
        // Parameters are percent-encoded, not raw.
        assert!(url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A1455%2Fauth%2Fcallback"));
        assert!(url.contains("scope=openid+profile+email") || url.contains("scope=openid%20profile"));
    }

    #[test]
    fn repeat_sign_in_uses_saved_client_and_hints_without_agent_name() {
        let url = build_authorize_url(
            "https://auth.openai.com/api/accounts/authorize",
            &AuthorizeParams {
                saved_client_id: Some("oaiapp_abc"),
                host_id: "urn:uuid:1111",
                redirect_uri: "http://127.0.0.1:1456/auth/callback",
                state: "s",
                nonce: "n",
                code_challenge: "c",
                id_token_hint: Some("eyJ.tok.en"),
                login_hint: Some("me@example.com"),
            },
        )
        .expect("url");
        let query = query_of(&url);
        assert_eq!(q(&query, "client_id"), Some("oaiapp_abc"));
        assert!(q(&query, "agent_name_hint").is_none());
        assert_eq!(q(&query, "id_token_hint"), Some("eyJ.tok.en"));
        assert_eq!(q(&query, "login_hint"), Some("me@example.com"));
    }

    // Callback validation ------------------------------------------------

    #[test]
    fn callback_rejects_state_mismatch_first() {
        let p = pairs(&[("code", "c"), ("state", "wrong"), ("client_id", "oaiapp_1")]);
        assert_eq!(validate_callback(&p, "right", None), Err(ChatGptError::StateMismatch));
        let missing = pairs(&[("code", "c")]);
        assert_eq!(validate_callback(&missing, "right", None), Err(ChatGptError::StateMismatch));
    }

    #[test]
    fn callback_access_denied_is_a_cancel() {
        let p = pairs(&[("error", "access_denied"), ("state", "s")]);
        assert_eq!(validate_callback(&p, "s", None), Err(ChatGptError::Cancelled));
        let other = pairs(&[("error", "server_error"), ("state", "s")]);
        assert!(matches!(validate_callback(&other, "s", None), Err(ChatGptError::Denied(c)) if c == "server_error"));
    }

    #[test]
    fn callback_new_registration_needs_an_issued_client_id() {
        let none = pairs(&[("code", "c"), ("state", "s")]);
        assert_eq!(validate_callback(&none, "s", None), Err(ChatGptError::IncompleteRegistration));
        let placeholder = pairs(&[("code", "c"), ("state", "s"), ("client_id", "dynamic_agent_client")]);
        assert_eq!(validate_callback(&placeholder, "s", None), Err(ChatGptError::IncompleteRegistration));
        let ok = pairs(&[("code", "c"), ("state", "s"), ("client_id", "oaiapp_new"), ("scope", "openid")]);
        let v = validate_callback(&ok, "s", None).expect("valid");
        assert_eq!(v.client_id, "oaiapp_new");
        assert_eq!(v.code, "c");
        assert_eq!(v.scope.as_deref(), Some("openid"));
    }

    #[test]
    fn callback_rejects_a_different_client_id_and_accepts_the_same_or_absent() {
        let diff = pairs(&[("code", "c"), ("state", "s"), ("client_id", "oaiapp_other")]);
        assert_eq!(validate_callback(&diff, "s", Some("oaiapp_saved")), Err(ChatGptError::ClientMismatch));
        let same = pairs(&[("code", "c"), ("state", "s"), ("client_id", "oaiapp_saved")]);
        assert_eq!(validate_callback(&same, "s", Some("oaiapp_saved")).map(|v| v.client_id), Ok("oaiapp_saved".into()));
        let absent = pairs(&[("code", "c"), ("state", "s")]);
        assert_eq!(validate_callback(&absent, "s", Some("oaiapp_saved")).map(|v| v.client_id), Ok("oaiapp_saved".into()));
        let nocode = pairs(&[("state", "s")]);
        assert_eq!(validate_callback(&nocode, "s", Some("x")), Err(ChatGptError::NoCode));
    }

    // Token parsing ------------------------------------------------------

    #[test]
    fn token_response_parses_and_checks_plan_scope() {
        let body = r#"{"access_token":"at","refresh_token":"rt","id_token":"it","token_type":"Bearer","expires_in":3600,"scope":"openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"}"#;
        let t = parse_token_response(body).expect("parse");
        assert_eq!(t.expires_in, 3600);
        let set = t.into_token_set(1000, None).expect("set");
        assert_eq!(set.expires_at, 4600);
        assert!(set.plan_enabled());
        assert!(set.needs_refresh(4600 - 119));
        assert!(!set.needs_refresh(4600 - 121));

        let without = r#"{"access_token":"at","refresh_token":"rt","scope":"openid profile email offline_access resource.invoke"}"#;
        let set = parse_token_response(without).expect("parse").into_token_set(0, None).expect("set");
        assert!(!set.plan_enabled(), "scope without the plan grant disables plan usage");
        assert_eq!(set.expires_at, 3600, "expires_in defaults to 3600");
        assert!(!has_plan_scope("chatgpt.tokens.use.directly"));
    }

    #[test]
    fn token_response_errors_and_refresh_merging() {
        assert!(parse_token_response("nope").is_err());
        assert!(parse_token_response(r#"{"refresh_token":"r"}"#).is_err());
        let prev = TokenSet {
            access_token: "old".into(),
            refresh_token: "old-rt".into(),
            id_token: Some("old-id".into()),
            token_type: "Bearer".into(),
            expires_at: 1,
            scope: "openid chatgpt.tokens.use.direct".into(),
        };
        // A refresh response without rotated fields keeps the previous ones.
        let merged = parse_token_response(r#"{"access_token":"new","expires_in":60}"#)
            .expect("parse")
            .into_token_set(100, Some(&prev))
            .expect("merge");
        assert_eq!(merged.access_token, "new");
        assert_eq!(merged.refresh_token, "old-rt");
        assert_eq!(merged.id_token.as_deref(), Some("old-id"));
        assert!(merged.plan_enabled());
        assert_eq!(merged.expires_at, 160);
        // Without a previous set, a refresh token is mandatory.
        assert!(parse_token_response(r#"{"access_token":"a"}"#).expect("parse").into_token_set(0, None).is_err());
        // Debug never prints tokens.
        assert!(!format!("{prev:?}").contains("old-rt"));
    }

    // Refresh error classification ---------------------------------------

    #[test]
    fn refresh_errors_classify_terminal_vs_transient() {
        for code in [
            "invalid_grant", "invalid_refresh_token", "token_expired",
            "refresh_token_expired", "refresh_token_invalidated", "refresh_token_reused",
        ] {
            assert_eq!(
                classify_refresh_error(400, &format!(r#"{{"error":"{code}"}}"#)),
                RefreshFailure::Terminal(code.into()),
                "{code}"
            );
        }
        // Other body shapes carry the code too.
        assert!(matches!(classify_refresh_error(401, r#"{"error":{"code":"refresh_token_reused"}}"#), RefreshFailure::Terminal(_)));
        assert!(matches!(classify_refresh_error(400, r#"{"code":"invalid_grant"}"#), RefreshFailure::Terminal(_)));
        // Unknown codes, server errors and garbage keep the tokens.
        assert_eq!(classify_refresh_error(503, r#"{"error":"temporarily_unavailable"}"#), RefreshFailure::Transient(503));
        assert_eq!(classify_refresh_error(500, "<html>"), RefreshFailure::Transient(500));
        assert_eq!(classify_refresh_error(429, ""), RefreshFailure::Transient(429));
    }

    // id_token -----------------------------------------------------------

    #[test]
    fn id_token_valid_and_claims_extracted() {
        let tok = mint(good_claims("oaiapp_1", "nonce-1"), Some("k1"));
        let claims = verify_id_token(&tok, &jwks("k1", true), ISSUER, "oaiapp_1", "nonce-1").expect("valid");
        assert_eq!(claims.subject, "user-123");
        assert_eq!(claims.email.as_deref(), Some("me@example.com"));
        // A key without an explicit alg works too (header alg checked against key family).
        let tok = mint(good_claims("oaiapp_1", "nonce-1"), Some("k1"));
        assert!(verify_id_token(&tok, &jwks("k1", false), ISSUER, "oaiapp_1", "nonce-1").is_ok());
        // A single-key set needs no kid.
        let tok = mint(good_claims("oaiapp_1", "n"), None);
        assert!(verify_id_token(&tok, &jwks("only", true), ISSUER, "oaiapp_1", "n").is_ok());
    }

    #[test]
    fn id_token_rejections() {
        let set = jwks("k1", true);
        let check = |claims: serde_json::Value| {
            verify_id_token(&mint(claims, Some("k1")), &set, ISSUER, "oaiapp_1", "n")
        };
        let mut c = good_claims("oaiapp_1", "n");
        c["iss"] = "https://evil.example".into();
        assert!(matches!(check(c), Err(ChatGptError::IdToken(m)) if m.contains("issuer")));
        let mut c = good_claims("oaiapp_1", "n");
        c["iss"] = "https://auth.openai.com/".into(); // exact match only
        assert!(check(c).is_err());
        assert!(matches!(check(good_claims("oaiapp_OTHER", "n")), Err(ChatGptError::IdToken(m)) if m.contains("audience")));
        let mut c = good_claims("oaiapp_1", "n");
        c["exp"] = (now_secs() - 3600).into();
        assert!(matches!(check(c), Err(ChatGptError::IdToken(m)) if m.contains("expired")));
        assert_eq!(check(good_claims("oaiapp_1", "different")), Err(ChatGptError::NonceMismatch));
        let mut c = good_claims("oaiapp_1", "n");
        c["nonce"] = serde_json::Value::Null;
        assert_eq!(check(c), Err(ChatGptError::NonceMismatch));
        let mut c = good_claims("oaiapp_1", "n");
        c["sub"] = "  ".into();
        assert!(matches!(check(c), Err(ChatGptError::IdToken(m)) if m.contains("subject")));
        let mut c = good_claims("oaiapp_1", "n");
        c.as_object_mut().expect("obj").remove("sub");
        assert!(check(c).is_err());
    }

    #[test]
    fn id_token_tampering_unknown_kid_and_disallowed_algorithms() {
        let set = jwks("k1", true);
        let tok = mint(good_claims("oaiapp_1", "n"), Some("k1"));
        // Tamper with the payload: signature no longer matches.
        let mut parts: Vec<String> = tok.split('.').map(str::to_string).collect();
        let forged = serde_json::to_vec(&good_claims("oaiapp_1", "n")).expect("json");
        parts[1] = b64url(&[forged.as_slice(), b" "].concat());
        assert!(verify_id_token(&parts.join("."), &set, ISSUER, "oaiapp_1", "n").is_err());
        // Unknown key id.
        let other = mint(good_claims("oaiapp_1", "n"), Some("nope"));
        assert!(matches!(verify_id_token(&other, &set, ISSUER, "oaiapp_1", "n"), Err(ChatGptError::IdToken(m)) if m.contains("unknown")));
        // HS256 "alg confusion": signed with a shared secret, rejected.
        let mut header = Header::new(Algorithm::HS256);
        header.kid = Some("k1".into());
        let hs = jsonwebtoken::encode(&header, &good_claims("oaiapp_1", "n"), &EncodingKey::from_secret(b"secret")).expect("hs");
        assert!(verify_id_token(&hs, &set, ISSUER, "oaiapp_1", "n").is_err());
        // Key pins ES256 but the token claims ES384: mismatch.
        assert!(verify_id_token("not.a.jwt", &set, ISSUER, "oaiapp_1", "n").is_err());
    }

    // End-to-end against a loopback mock ---------------------------------

    struct Shared {
        id_token: Mutex<String>,
        refresh_calls: Mutex<u32>,
    }

    fn mock_idp(shared: Arc<Shared>, scope: &'static str, token_status: u16) -> impl Fn(&crate::test_support::RecordedRequest) -> MockResponse + Send + Sync + 'static {
        // base is filled in after the server starts via a placeholder replaced below
        move |req| {
            let host = req.header("host").unwrap_or("127.0.0.1").to_string();
            let base = format!("http://{host}");
            match req.path.as_str() {
                "/.well-known/openid-configuration" => MockResponse::json(200, serde_json::json!({
                    "issuer": ISSUER,
                    "jwks_uri": format!("{base}/.well-known/jwks.json"),
                    "revocation_endpoint": format!("{base}/revoke"),
                })),
                "/.well-known/jwks.json" => MockResponse::json(200, jwks_json("k1", true)),
                "/token" => {
                    let grant = req.form_value("grant_type").unwrap_or_default();
                    if token_status != 200 {
                        return MockResponse::json(token_status, serde_json::json!({"error": "invalid_grant"}));
                    }
                    if grant == "refresh_token" {
                        let mut n = shared.refresh_calls.lock().expect("lock");
                        *n += 1;
                        return MockResponse::json(200, serde_json::json!({
                            "access_token": format!("access-refreshed-{}", *n),
                            "refresh_token": format!("refresh-rotated-{}", *n),
                            "token_type": "Bearer", "expires_in": 3600, "scope": scope
                        }));
                    }
                    MockResponse::json(200, serde_json::json!({
                        "access_token": "access-1", "refresh_token": "refresh-1",
                        "id_token": shared.id_token.lock().expect("lock").clone(),
                        "token_type": "Bearer", "expires_in": 3600, "scope": scope
                    }))
                }
                "/revoke" => MockResponse::text(200, ""),
                _ => MockResponse::text(404, ""),
            }
        }
    }

    fn endpoints_for(server: &MockServer, ports: Vec<u16>) -> Endpoints {
        Endpoints {
            issuer: ISSUER.into(),
            authorize_url: format!("{}/authorize", server.base_url),
            token_url: format!("{}/token", server.base_url),
            discovery_url: format!("{}/.well-known/openid-configuration", server.base_url),
            api_base: server.base_url.clone(),
            ports,
            sign_in_timeout: Duration::from_secs(20),
        }
    }

    /// Simulates the user's browser: reads state/nonce/redirect from the
    /// authorize URL, publishes a matching id_token and hits the callback.
    fn fake_browser(shared: Arc<Shared>, client_to_return: Option<&'static str>, aud: &'static str) -> impl FnOnce(String) -> Result<(), String> {
        move |url: String| {
            let query = query_of(&url);
            let state = q(&query, "state").unwrap_or_default().to_string();
            let nonce = q(&query, "nonce").unwrap_or_default().to_string();
            let redirect = q(&query, "redirect_uri").unwrap_or_default().to_string();
            *shared.id_token.lock().expect("lock") = mint(good_claims(aud, &nonce), Some("k1"));
            tokio::spawn(async move {
                let mut callback = format!("{redirect}?code=auth-code-1&state={state}");
                if let Some(c) = client_to_return {
                    callback.push_str(&format!("&client_id={c}"));
                }
                let _ = reqwest::get(callback).await;
            });
            Ok(())
        }
    }

    fn test_ports(offset: u16) -> Vec<u16> {
        vec![41_000 + offset]
    }

    #[tokio::test]
    async fn full_first_registration_sign_in_stores_tokens_and_returns_issued_client() {
        let shared = Arc::new(Shared { id_token: Mutex::new(String::new()), refresh_calls: Mutex::new(0) });
        let server = MockServer::start(mock_idp(shared.clone(), "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct", 200)).await;
        let store = MemoryStore::new_available();
        let req = SignInRequest { saved_client_id: None, host_id: "urn:uuid:test".into(), ..Default::default() };
        let out = sign_in(&endpoints_for(&server, test_ports(1)), &store, &req, fake_browser(shared, Some("oaiapp_issued"), "oaiapp_issued"))
            .await
            .expect("sign-in");
        assert_eq!(out.client_id, "oaiapp_issued");
        assert_eq!(out.email.as_deref(), Some("me@example.com"));
        assert!(out.plan_enabled);
        let tokens = load_tokens(&store).expect("tokens stored");
        assert_eq!(tokens.access_token, "access-1");
        assert_eq!(tokens.refresh_token, "refresh-1");

        let token_req = server.requests().into_iter().find(|r| r.path == "/token").expect("token request");
        assert_eq!(token_req.method, "POST");
        assert_eq!(token_req.form_value("grant_type").as_deref(), Some("authorization_code"));
        assert_eq!(token_req.form_value("client_id").as_deref(), Some("oaiapp_issued"));
        assert_eq!(token_req.form_value("code").as_deref(), Some("auth-code-1"));
        assert_eq!(token_req.form_value("resource").as_deref(), Some(RESOURCE));
        assert_eq!(token_req.form_value("redirect_uri").as_deref(), Some("http://127.0.0.1:41001/auth/callback"));
        let verifier = token_req.form_value("code_verifier").expect("verifier");
        assert!(verifier.len() >= 43);
        assert!(token_req.form_value("client_secret").is_none());
    }

    #[tokio::test]
    async fn sign_in_without_plan_scope_stays_signed_in_but_plan_disabled() {
        let shared = Arc::new(Shared { id_token: Mutex::new(String::new()), refresh_calls: Mutex::new(0) });
        let server = MockServer::start(mock_idp(shared.clone(), "openid profile email offline_access", 200)).await;
        let store = Arc::new(MemoryStore::new_available());
        let req = SignInRequest { saved_client_id: Some("oaiapp_saved".into()), host_id: "urn:uuid:test".into(), ..Default::default() };
        let out = sign_in(&endpoints_for(&server, test_ports(2)), store.as_ref(), &req, fake_browser(shared, None, "oaiapp_saved"))
            .await
            .expect("sign-in");
        assert!(!out.plan_enabled);
        let auth = ChatGptAuth::new(store, endpoints_for(&server, vec![]), Some("oaiapp_saved".into()));
        assert!(auth.status().signed_in && !auth.status().plan_enabled);
        assert_eq!(auth.access_token().await, Err(ChatGptError::PlanUsageDisabled));
    }

    #[tokio::test]
    async fn sign_in_fails_on_id_token_audience_mismatch_and_stores_nothing() {
        let shared = Arc::new(Shared { id_token: Mutex::new(String::new()), refresh_calls: Mutex::new(0) });
        let server = MockServer::start(mock_idp(shared.clone(), "chatgpt.tokens.use.direct", 200)).await;
        let store = MemoryStore::new_available();
        let req = SignInRequest { saved_client_id: Some("oaiapp_saved".into()), host_id: "h".into(), ..Default::default() };
        let err = sign_in(&endpoints_for(&server, test_ports(3)), &store, &req, fake_browser(shared, None, "someone_else"))
            .await
            .err();
        assert!(matches!(err, Some(ChatGptError::IdToken(_))), "{err:?}");
        assert!(load_tokens(&store).is_none());
    }

    #[tokio::test]
    async fn sign_in_needs_the_keychain_and_reports_a_busy_port_range() {
        let shared = Arc::new(Shared { id_token: Mutex::new(String::new()), refresh_calls: Mutex::new(0) });
        let server = MockServer::start(mock_idp(shared, "x", 200)).await;
        let req = SignInRequest { host_id: "h".into(), ..Default::default() };
        let unavailable = MemoryStore::new_unavailable();
        let err = sign_in(&endpoints_for(&server, test_ports(4)), &unavailable, &req, |_| Ok(())).await.err();
        assert_eq!(err, Some(ChatGptError::KeychainUnavailable));

        // Occupy the only allowed port: the flow must not open the browser.
        let busy = TcpListener::bind(("127.0.0.1", 41_005)).await.expect("bind");
        let opened = Arc::new(AtomicBool::new(false));
        let flag = opened.clone();
        let store = MemoryStore::new_available();
        let err = sign_in(&endpoints_for(&server, vec![41_005]), &store, &req, move |_| {
            flag.store(true, Ordering::SeqCst);
            Ok(())
        })
        .await
        .err();
        drop(busy);
        assert_eq!(err, Some(ChatGptError::PortsBusy));
        assert!(!opened.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn sign_in_times_out_without_a_callback() {
        let shared = Arc::new(Shared { id_token: Mutex::new(String::new()), refresh_calls: Mutex::new(0) });
        let server = MockServer::start(mock_idp(shared, "x", 200)).await;
        let mut ep = endpoints_for(&server, test_ports(6));
        ep.sign_in_timeout = Duration::from_millis(200);
        let store = MemoryStore::new_available();
        let req = SignInRequest { host_id: "h".into(), ..Default::default() };
        assert_eq!(sign_in(&ep, &store, &req, |_| Ok(())).await.err(), Some(ChatGptError::TimedOut));
    }

    #[tokio::test]
    async fn callback_listener_serves_the_done_page_and_ignores_other_paths() {
        let (listener, port) = bind_loopback(&[41_007]).await.expect("bind");
        let task = tokio::spawn(async move { await_callback(listener, "st", Duration::from_secs(10)).await });
        let base = format!("http://127.0.0.1:{port}");
        let other = reqwest::get(format!("{base}/favicon.ico")).await.expect("get");
        assert_eq!(other.status().as_u16(), 404);
        let ok = reqwest::get(format!("{base}{CALLBACK_PATH}?code=c&state=st")).await.expect("get");
        let body = ok.text().await.expect("text");
        assert!(body.contains("signed in") && body.contains("close this tab"));
        let got = task.await.expect("join").expect("callback");
        assert!(got.iter().any(|(k, v)| k == "code" && v == "c"));
    }

    fn seeded_store(expires_at: u64, scope: &str) -> Arc<MemoryStore> {
        let store = Arc::new(MemoryStore::new_available());
        save_tokens(store.as_ref(), &TokenSet {
            access_token: "stale-access".into(),
            refresh_token: "refresh-0".into(),
            id_token: Some("id-0".into()),
            token_type: "Bearer".into(),
            expires_at,
            scope: scope.into(),
        })
        .expect("seed");
        store
    }

    #[tokio::test]
    async fn expired_token_refreshes_once_for_concurrent_callers_and_rotates() {
        let shared = Arc::new(Shared { id_token: Mutex::new(String::new()), refresh_calls: Mutex::new(0) });
        let server = MockServer::start(mock_idp(shared.clone(), PLAN_SCOPE, 200)).await;
        let store = seeded_store(now_secs() + 30, PLAN_SCOPE); // inside the 2-minute window
        let auth = Arc::new(ChatGptAuth::new(store.clone(), endpoints_for(&server, vec![]), Some("oaiapp_1".into())));
        let (a, b, c) = tokio::join!(auth.access_token(), auth.access_token(), auth.access_token());
        assert_eq!(a.as_deref(), Ok("access-refreshed-1"));
        assert_eq!(b.as_deref(), Ok("access-refreshed-1"));
        assert_eq!(c.as_deref(), Ok("access-refreshed-1"));
        assert_eq!(*shared.refresh_calls.lock().expect("lock"), 1, "refreshes are serialised");
        let stored = load_tokens(store.as_ref()).expect("tokens");
        assert_eq!(stored.refresh_token, "refresh-rotated-1");
        assert_eq!(stored.id_token.as_deref(), Some("id-0"));
        let req = server.requests().into_iter().find(|r| r.path == "/token").expect("req");
        assert_eq!(req.form_value("grant_type").as_deref(), Some("refresh_token"));
        assert_eq!(req.form_value("refresh_token").as_deref(), Some("refresh-0"));
        assert_eq!(req.form_value("client_id").as_deref(), Some("oaiapp_1"));
        assert_eq!(req.form_value("resource").as_deref(), Some(RESOURCE));
        assert!(req.form_value("scope").is_none(), "scope is omitted on refresh");
    }

    #[tokio::test]
    async fn fresh_token_is_returned_without_a_network_call() {
        let shared = Arc::new(Shared { id_token: Mutex::new(String::new()), refresh_calls: Mutex::new(0) });
        let server = MockServer::start(mock_idp(shared, PLAN_SCOPE, 200)).await;
        let store = seeded_store(now_secs() + 3000, PLAN_SCOPE);
        let auth = ChatGptAuth::new(store, endpoints_for(&server, vec![]), Some("oaiapp_1".into()));
        assert_eq!(auth.access_token().await.as_deref(), Ok("stale-access"));
        assert!(server.requests().is_empty());
    }

    #[tokio::test]
    async fn unauthorized_retry_skips_refresh_if_another_task_already_rotated() {
        let shared = Arc::new(Shared { id_token: Mutex::new(String::new()), refresh_calls: Mutex::new(0) });
        let server = MockServer::start(mock_idp(shared.clone(), PLAN_SCOPE, 200)).await;
        let store = seeded_store(now_secs() + 3000, PLAN_SCOPE);
        let auth = ChatGptAuth::new(store, endpoints_for(&server, vec![]), Some("oaiapp_1".into()));
        // The rejected token is not the current one -> reuse the current one.
        assert_eq!(auth.refresh_after_unauthorized("something-older").await.as_deref(), Ok("stale-access"));
        assert_eq!(*shared.refresh_calls.lock().expect("lock"), 0);
        // The current token itself was rejected -> refresh.
        assert_eq!(auth.refresh_after_unauthorized("stale-access").await.as_deref(), Ok("access-refreshed-1"));
    }

    #[tokio::test]
    async fn terminal_refresh_error_clears_tokens_but_transient_keeps_them() {
        let shared = Arc::new(Shared { id_token: Mutex::new(String::new()), refresh_calls: Mutex::new(0) });
        let terminal = MockServer::start(mock_idp(shared.clone(), PLAN_SCOPE, 400)).await;
        let store = seeded_store(now_secs() + 10, PLAN_SCOPE);
        let auth = ChatGptAuth::new(store.clone(), endpoints_for(&terminal, vec![]), Some("oaiapp_1".into()));
        assert_eq!(auth.access_token().await, Err(ChatGptError::SessionExpired));
        assert!(load_tokens(store.as_ref()).is_none());
        assert_eq!(auth.access_token().await, Err(ChatGptError::NotSignedIn));

        let flaky = MockServer::start(|_| MockResponse::text(503, "busy")).await;
        let store = seeded_store(now_secs() + 10, PLAN_SCOPE);
        let auth = ChatGptAuth::new(store.clone(), endpoints_for(&flaky, vec![]), Some("oaiapp_1".into()));
        assert_eq!(auth.access_token().await, Err(ChatGptError::RefreshFailed(503)));
        assert!(load_tokens(store.as_ref()).is_some(), "transient failures keep the session");
    }

    #[tokio::test]
    async fn sign_out_revokes_the_refresh_token_and_clears_storage() {
        let shared = Arc::new(Shared { id_token: Mutex::new(String::new()), refresh_calls: Mutex::new(0) });
        let server = MockServer::start(mock_idp(shared, PLAN_SCOPE, 200)).await;
        let store = seeded_store(now_secs() + 3000, PLAN_SCOPE);
        let auth = ChatGptAuth::new(store.clone(), endpoints_for(&server, vec![]), Some("oaiapp_1".into()));
        let out = auth.sign_out().await.expect("sign out");
        assert!(out.revocation_confirmed);
        assert!(load_tokens(store.as_ref()).is_none());
        let rev = server.requests().into_iter().find(|r| r.path == "/revoke").expect("revoke request");
        assert_eq!(rev.form_value("token").as_deref(), Some("refresh-0"));
        assert_eq!(rev.form_value("token_type_hint").as_deref(), Some("refresh_token"));
        assert_eq!(rev.form_value("client_id").as_deref(), Some("oaiapp_1"));
        // Signing out again with nothing stored is a no-op success.
        assert!(auth.sign_out().await.expect("again").revocation_confirmed);
    }

    #[tokio::test]
    async fn sign_out_clears_tokens_even_when_revocation_cannot_be_confirmed() {
        let down = MockServer::start(|_| MockResponse::text(500, "")).await;
        let store = seeded_store(now_secs() + 3000, PLAN_SCOPE);
        let auth = ChatGptAuth::new(store.clone(), endpoints_for(&down, vec![]), Some("oaiapp_1".into()));
        let out = auth.sign_out().await.expect("sign out");
        assert!(!out.revocation_confirmed);
        assert!(load_tokens(store.as_ref()).is_none());
    }

    #[test]
    fn discovery_urls_must_share_the_discovery_origin() {
        let ep = Endpoints::default();
        assert!(same_origin_as_discovery(&ep, "https://auth.openai.com/.well-known/jwks.json"));
        assert!(!same_origin_as_discovery(&ep, "https://evil.example/jwks.json"));
        assert!(!same_origin_as_discovery(&ep, "http://auth.openai.com/jwks.json"));
    }
}
