use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::Receiver;
use std::time::Duration;

use serde_json::Value;

use crate::agent::AgentConfig;

/// Deadline for one Codex RPC round-trip (P1/H-01/M-6).
const CODEX_RPC_TIMEOUT: Duration = Duration::from_secs(60);

/// TOML-escape a string interpolated into generated config (P1/H-27: skill
/// names or paths containing `"`/`\` used to corrupt or inject config).
fn toml_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

pub struct CodexProcess {
    child: Option<Child>,
    home_dir: PathBuf,
    /// Pump thread owns child stdout; RPC reads wait with a deadline.
    lines: Option<Receiver<std::io::Result<String>>>,
}

impl CodexProcess {
    pub fn new(config: &AgentConfig) -> Self {
        let home_dir = PathBuf::from(&config.codex_home);
        let _ = std::fs::create_dir_all(&home_dir);
        Self {
            child: None,
            home_dir,
            lines: None,
        }
    }

    pub fn start(&mut self, config: &AgentConfig) -> Result<(), String> {
        if self.child.is_some() {
            return Err("Codex already running".into());
        }

        let codex_bin = config.codex_path.clone().unwrap_or_else(|| "codex".into());

        // P1 (H-27): a configured codex_path spawns with full user privileges —
        // refuse anything that isn't an existing file (fail-closed).
        if config.codex_path.is_some() && !std::path::Path::new(&codex_bin).is_file() {
            return Err(format!(
                "refusing to run codex: configured codex_path is not a file: {codex_bin}"
            ));
        }

        let config_path = self.home_dir.join("config.toml");
        let config_toml = self.generate_config_toml(config);
        std::fs::write(&config_path, &config_toml)
            .map_err(|e| format!("failed to write codex config: {e}"))?;

        let mut child = Command::new(&codex_bin)
            .arg("--config")
            .arg(config_path.to_string_lossy().to_string())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("failed to start codex: {e}"))?;

        // Sole stdout ownership goes to a pump thread; RPC reads wait with a
        // deadline instead of blocking forever on a wedged child.
        let stdout = child.stdout.take().ok_or("no stdout on codex process")?;
        let (tx, rx) = std::sync::mpsc::channel();
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
        });

        self.child = Some(child);
        self.lines = Some(rx);
        Ok(())
    }

    pub fn stop(&mut self) -> Result<(), String> {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        // Dropping the receiver ends the pump thread once stdout closes.
        self.lines = None;
        Ok(())
    }

    pub fn send_rpc(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let stdin = self
            .child
            .as_mut()
            .and_then(|child| child.stdin.as_mut())
            .ok_or_else(|| "Codex not running".to_string())?;

        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params,
        });

        let req_line =
            serde_json::to_string(&request).map_err(|e| format!("serialization error: {e}"))?;

        writeln!(stdin, "{req_line}").map_err(|e| format!("write error: {e}"))?;

        let rx = self
            .lines
            .as_ref()
            .ok_or_else(|| "Codex not running".to_string())?;

        // Deadline-bounded, id-correlated read (P1/M-6: old code blocked on
        // read_line forever and re-created a BufReader per call over shared
        // stdout, risking desync on chatty children).
        let mut response: Option<Value> = None;
        for _ in 0..100 {
            let line = match rx.recv_timeout(CODEX_RPC_TIMEOUT) {
                Ok(Ok(line)) => line,
                Ok(Err(e)) => return Err(format!("read error: {e}")),
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    // Child is wedged — kill it rather than hanging the caller.
                    self.stop().ok();
                    return Err(format!(
                        "codex RPC '{method}' timed out after {}s (process killed)",
                        CODEX_RPC_TIMEOUT.as_secs()
                    ));
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            };
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            if let Ok(val) = serde_json::from_str::<Value>(line) {
                if val.get("id").and_then(|v| v.as_i64()) == Some(1) {
                    response = Some(val);
                    break;
                }
            }
        }

        let response =
            response.ok_or_else(|| "failed to find valid JSON-RPC response".to_string())?;

        if let Some(error) = response.get("error") {
            return Err(format!(
                "codex error: {}",
                error
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
            ));
        }

        Ok(response.get("result").cloned().unwrap_or(Value::Null))
    }

    pub fn is_running(&mut self) -> bool {
        if let Some(ref mut child) = self.child {
            matches!(child.try_wait(), Ok(None))
        } else {
            false
        }
    }

    pub fn generate_config_toml(&self, config: &AgentConfig) -> String {
        let home = toml_escape(&self.home_dir.to_string_lossy());
        let enabled_skills = config
            .enabled_skills
            .iter()
            .map(|s| format!("\"{}\"", toml_escape(s)))
            .collect::<Vec<_>>()
            .join(", ");
        format!(
            r#"[codex]
model = "claude-sonnet-4-20250514"
provider = "anthropic"
max_tokens = 4096
system_prompt = "You are ClickyX Agent"

[codex.model_override]
# This config is generated by ClickyX. The model used at runtime
# is determined by the user's AI provider settings, not this file.

[skills]
directory = "{}"
enabled = [{}]

[mcp_servers]
"#,
            home, enabled_skills
        )
    }
}
