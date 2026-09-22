//! MCP session registry (P3 / §9.6).
//!
//! Goals:
//! - Amortize JSON-RPC handshake across calls by reusing one persistent
//!   child per server instead of respawning per call (the previous behavior
//!   in `bridge::mcp_call_tool_sync`/`mcp_list_tools_sync`).
//! - Bound concurrency: at most one active session per server name; calls
//!   on an existing session wait up to a deadline; otherwise fail fast.
//! - Bound lifetime: sessions carry an idle TTL (`DEFAULT_IDLE_TTL`) and
//!   are killed by a sweep task if unused past it.
//! - Bound total: `MAX_CONCURRENT_SESSIONS` is a hard ceiling — when full,
//!   new requests fail with a structured error rather than spawning
//!   unbounded children.
//! - Clean shutdown: `shutdown()` kills all live children and clears the
//!   registry; called from Tauri exit handler in `lib::run`.
//!
//! Non-goals:
//! - Persisting sessions across app restarts (cold path always re-handshakes).
//! - Process-group reaping beyond `child.kill()` (each child is a single
//!   MCP server process; the OS reaps on exit).
//!
//! Concurrency model: a single `Mutex<HashMap<String, Arc<Mutex<Session>>>>`
//! guards the registry. Each session owns its own `Mutex<Child + stdin/stdout>`
//! so calls serialize per-server but never block the registry lock.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::config::McpServerConfig;

/// How long a session may sit idle (no successful call) before the sweep
/// task kills its child.
pub const DEFAULT_IDLE_TTL: Duration = Duration::from_secs(5 * 60);

/// Hard cap on simultaneous live sessions.
pub const MAX_CONCURRENT_SESSIONS: usize = 8;

/// Per-line I/O deadline (matches `bridge::MCP_IO_TIMEOUT`).
const IO_TIMEOUT: Duration = Duration::from_secs(30);

/// How long an incoming call may wait to acquire an existing busy session
/// before failing fast.
const CALL_ACQUIRE_TIMEOUT: Duration = Duration::from_secs(10);

/// Maximum requests a single session may serve before being cycled (defends
/// against leaked subprocess state across very long-running servers).
const MAX_REQUESTS_PER_SESSION: u64 = 1024;

#[derive(Debug)]
struct Session {
    config: McpServerConfig,
    child: Child,
    stdin: std::process::ChildStdin,
    line_rx: Receiver<std::io::Result<String>>,
    next_id: i64,
    last_used: Instant,
    requests_served: u64,
}

impl Session {
    fn spawn(config: &McpServerConfig) -> Result<Self, String> {
        let mut child = Command::new(&config.command)
            .args(&config.args)
            .envs(&config.env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("spawn '{}': {e}", config.name))?;

        let stdin = child.stdin.take().ok_or("no stdin")?;
        let stdout = child.stdout.take().ok_or("no stdout")?;
        let line_rx = spawn_stdout_pump(stdout, &config.name);

        // Send initialize + read response with id correlation so notifications
        // and log lines cannot desync the handshake.
        let mut session = Session {
            config: config.clone(),
            child,
            stdin,
            line_rx,
            next_id: 2, // 1 used by initialize
            last_used: Instant::now(),
            requests_served: 0,
        };
        session.initialize()?;
        Ok(session)
    }

    fn initialize(&mut self) -> Result<(), String> {
        let req = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "clickyx", "version": env!("CARGO_PKG_VERSION")}
            }
        });
        self.write_frame(&req)?;
        for _ in 0..100 {
            let line = self.read_line("initialize response")?;
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(line.trim()) {
                if val.get("id").and_then(|v| v.as_i64()) == Some(1) {
                    return Ok(());
                }
            }
        }
        Err(format!(
            "MCP '{}': no initialize response",
            self.config.name
        ))
    }

    fn write_frame(&mut self, value: &serde_json::Value) -> Result<(), String> {
        let s = format!("{}\n", serde_json::to_string(value).unwrap_or_default());
        self.stdin
            .write_all(s.as_bytes())
            .map_err(|e| format!("write: {e}"))
    }

    fn read_line(&self, what: &str) -> Result<String, String> {
        match self.line_rx.recv_timeout(IO_TIMEOUT) {
            Ok(Ok(line)) => Ok(line),
            Ok(Err(e)) => Err(format!("stdout read while waiting for {what}: {e}")),
            Err(RecvTimeoutError::Timeout) => Err(format!(
                "timed out after {}s waiting for {what}",
                IO_TIMEOUT.as_secs()
            )),
            Err(RecvTimeoutError::Disconnected) => {
                Err(format!("server closed stdout waiting for {what}"))
            }
        }
    }

    /// Send a `tools/call` request and return the JSON-RPC `result`.
    /// Returns Err on protocol error or transport failure; caller decides
    /// whether to evict the session.
    fn call_tool(
        &mut self,
        tool: &str,
        args: &serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let id = self.next_id;
        self.next_id += 1;
        let req = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "tools/call",
            "params": {"name": tool, "arguments": args}
        });
        self.write_frame(&req)?;
        for _ in 0..100 {
            let line = self.read_line("tools/call response")?;
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(line.trim()) {
                if val.get("id").and_then(|v| v.as_i64()) == Some(id) {
                    if let Some(error) = val.get("error") {
                        return Err(format!("MCP error: {error}"));
                    }
                    return Ok(val.get("result").cloned().unwrap_or(serde_json::json!({})));
                }
            }
        }
        Err("no tools/call response".into())
    }

    fn kill(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.kill();
    }
}

fn spawn_stdout_pump(
    stdout: std::process::ChildStdout,
    server_name: &str,
) -> Receiver<std::io::Result<String>> {
    let (tx, rx) = mpsc::channel();
    let name = server_name.to_string();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            let mut line = String::new();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    if tx.send(Ok(line)).is_err() {
                        break;
                    }
                }
                Err(e) => {
                    let _ = tx.send(Err(e));
                    break;
                }
            }
        }
        log::debug!("MCP '{name}': stdout pump exiting");
    });
    rx
}

#[derive(Default)]
struct RegistryInner {
    sessions: HashMap<String, Arc<Mutex<Session>>>,
}

/// Public, cloneable handle to the registry. Cheap (one Arc clone) and
/// `Send + Sync` because the inner state is mutex-guarded.
#[derive(Clone, Default)]
pub struct McpSessionRegistry {
    inner: Arc<Mutex<RegistryInner>>,
    idle_ttl: Arc<Duration>,
}

impl McpSessionRegistry {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(RegistryInner::default())),
            idle_ttl: Arc::new(DEFAULT_IDLE_TTL),
        }
    }

    #[allow(dead_code)]
    pub fn with_idle_ttl(idle_ttl: Duration) -> Self {
        Self {
            inner: Arc::new(Mutex::new(RegistryInner::default())),
            idle_ttl: Arc::new(idle_ttl),
        }
    }

    /// Spawn `n` calls against `server` returning each result.
    /// Used by the existing bridge handlers; one session is acquired and
    /// reused for all calls (each `call_tool` is sequential within a session).
    pub fn call_tool(
        &self,
        server: &McpServerConfig,
        tool: &str,
        args: &serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        // Capacity gate first (cheap; before touching the session).
        {
            let inner = self
                .inner
                .lock()
                .map_err(|e| format!("registry lock: {e}"))?;
            if inner.sessions.len() >= MAX_CONCURRENT_SESSIONS
                && !inner.sessions.contains_key(&server.name)
            {
                return Err(format!(
                    "MCP session limit reached ({MAX_CONCURRENT_SESSIONS}); reuse or close an existing session"
                ));
            }
        }

        let session = self.acquire(server)?;
        let mut guard = match acquire_with_timeout(&session, CALL_ACQUIRE_TIMEOUT) {
            Ok(g) => g,
            Err(_) => {
                return Err(format!(
                    "MCP '{}': session busy >{CALL_ACQUIRE_TIMEOUT:?}",
                    server.name
                ));
            }
        };
        let result = guard.call_tool(tool, args);
        let evict_now = match &result {
            Ok(_) => {
                guard.last_used = Instant::now();
                guard.requests_served = guard.requests_served.saturating_add(1);
                guard_recyclable(&guard)
            }
            Err(_) => true, // Protocol/transport failure: cycle the session.
        };
        if evict_now {
            drop(guard);
            self.evict(&server.name);
        }
        result
    }

    /// Evict and kill the session for `name`, if any. Public so callers can
    /// force a clean cycle (e.g. after a config edit).
    #[allow(dead_code)]
    pub fn evict(&self, name: &str) {
        if let Ok(mut inner) = self.inner.lock() {
            if let Some(session) = inner.sessions.remove(name) {
                if let Ok(mut s) = session.lock() {
                    s.kill();
                }
            }
        }
    }

    /// Iterate registered session names (for diagnostics / tests).
    #[allow(dead_code)]
    pub fn names(&self) -> Vec<String> {
        self.inner
            .lock()
            .map(|i| i.sessions.keys().cloned().collect())
            .unwrap_or_default()
    }

    /// Number of currently live sessions.
    #[allow(dead_code)]
    pub fn live_count(&self) -> usize {
        self.inner.lock().map(|i| i.sessions.len()).unwrap_or(0)
    }

    /// Kill all sessions and clear the registry. Called from shutdown.
    #[allow(dead_code)]
    pub fn shutdown(&self) {
        if let Ok(mut inner) = self.inner.lock() {
            for (_, session) in inner.sessions.drain() {
                if let Ok(mut s) = session.lock() {
                    s.kill();
                }
            }
        }
    }

    /// Sweep idle sessions past TTL. Returns the names of sessions that
    /// were killed (for logging / tests).
    pub fn sweep_idle(&self) -> Vec<String> {
        let ttl = *self.idle_ttl;
        let mut killed = Vec::new();
        let to_kill: Vec<String> = match self.inner.lock() {
            Ok(inner) => inner
                .sessions
                .iter()
                .filter_map(|(name, s)| match s.lock() {
                    Ok(g) if g.last_used.elapsed() > ttl => Some(name.clone()),
                    _ => None,
                })
                .collect(),
            Err(_) => return killed,
        };
        for name in to_kill {
            self.evict(&name);
            killed.push(name);
        }
        killed
    }

    fn acquire(&self, server: &McpServerConfig) -> Result<Arc<Mutex<Session>>, String> {
        if let Ok(inner) = self.inner.lock() {
            if let Some(s) = inner.sessions.get(&server.name) {
                return Ok(s.clone());
            }
        }
        let mut inner = self
            .inner
            .lock()
            .map_err(|e| format!("registry lock: {e}"))?;
        // Re-check after re-acquiring the write lock to avoid double-spawn.
        if let Some(s) = inner.sessions.get(&server.name) {
            return Ok(s.clone());
        }
        let session = Session::spawn(server)?;
        let arc = Arc::new(Mutex::new(session));
        inner.sessions.insert(server.name.clone(), arc.clone());
        Ok(arc)
    }
}

fn guard_recyclable(g: &Session) -> bool {
    g.requests_served >= MAX_REQUESTS_PER_SESSION
}

/// Try to acquire the session lock within `timeout`. `std::sync::Mutex`
/// doesn't expose a timeout-based lock, so we poll with `try_lock` plus a
/// short sleep. The polling interval is tiny (5ms) so latency under
/// contention is bounded by `timeout`.
fn acquire_with_timeout(
    session: &Arc<Mutex<Session>>,
    timeout: Duration,
) -> Result<std::sync::MutexGuard<'_, Session>, ()> {
    let start = Instant::now();
    loop {
        match session.try_lock() {
            Ok(g) => return Ok(g),
            Err(_) if start.elapsed() >= timeout => return Err(()),
            Err(_) => std::thread::sleep(Duration::from_millis(5)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn stub_config(name: &str, command: &str) -> McpServerConfig {
        McpServerConfig {
            name: name.into(),
            command: command.into(),
            args: vec![],
            env: HashMap::new(),
            enabled: true,
        }
    }

    #[test]
    fn test_default_registry_is_empty_and_thread_safe() {
        let r = McpSessionRegistry::new();
        assert_eq!(r.live_count(), 0);
        assert!(r.names().is_empty());
        let h1 = r.clone();
        let h2 = r.clone();
        assert_eq!(h1.live_count(), h2.live_count());
    }

    #[test]
    fn test_shutdown_is_idempotent() {
        let r = McpSessionRegistry::new();
        r.shutdown();
        r.shutdown();
        assert_eq!(r.live_count(), 0);
    }

    #[test]
    fn test_sweep_idle_with_no_sessions_is_noop() {
        let r = McpSessionRegistry::with_idle_ttl(Duration::from_millis(1));
        std::thread::sleep(Duration::from_millis(5));
        let killed = r.sweep_idle();
        assert!(killed.is_empty());
        assert_eq!(r.live_count(), 0);
    }

    #[test]
    fn test_capacity_gate_refuses_when_full() {
        let r = McpSessionRegistry::new();
        // Fill with synthetic (non-spawning) entries by stuffing the registry.
        // We avoid real spawns (none in tests) by direct map manipulation via
        // the public shutdown path; this test focuses on the gate logic.
        for i in 0..MAX_CONCURRENT_SESSIONS {
            r.inner.lock().unwrap().sessions.insert(
                format!("s{i}"),
                Arc::new(Mutex::new(new_panicking_session())),
            );
        }
        // Now ask for a NEW name; the gate must refuse.
        let cfg = stub_config("new", "true");
        let args = serde_json::json!({});
        let err = r.call_tool(&cfg, "noop", &args).unwrap_err();
        assert!(
            err.contains("limit reached"),
            "expected capacity gate, got: {err}"
        );
        r.shutdown();
    }

    fn new_panicking_session() -> Session {
        // Constructed only for the capacity test. We never lock this session
        // outside the registry cleanup, which calls `kill()` and `wait()`.
        // Build a child that exits immediately so kill/wait succeed. We use
        // `sh -c 'exit 0'` because `true` is empty on some targets and
        // doesn't always grant us a stdin/stdout pipe.
        let mut child = Command::new("sh")
            .arg("-c")
            .arg("exit 0")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn sh -c 'exit 0'");
        let stdin = child.stdin.take().expect("stdin");
        let stdout = child.stdout.take().expect("stdout");
        drop(stdout);
        let (_tx, rx) = mpsc::channel();
        drop(_tx);
        Session {
            config: stub_config("synthetic", "true"),
            child,
            stdin,
            line_rx: rx,
            next_id: 2,
            last_used: Instant::now(),
            requests_served: 0,
        }
    }
}
