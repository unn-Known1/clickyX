use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};

use serde_json::Value;

use crate::agent::AgentConfig;

pub struct CodexProcess {
    child: Option<Child>,
    home_dir: PathBuf,
}

impl CodexProcess {
    pub fn new(config: &AgentConfig) -> Self {
        let home_dir = PathBuf::from(&config.codex_home);
        let _ = std::fs::create_dir_all(&home_dir);
        Self {
            child: None,
            home_dir,
        }
    }

    pub fn start(&mut self, config: &AgentConfig) -> Result<(), String> {
        if self.child.is_some() {
            return Err("Codex already running".into());
        }

        let codex_bin = config
            .codex_path
            .clone()
            .unwrap_or_else(|| "codex".into());

        let config_path = self.home_dir.join("config.toml");
        let config_toml = self.generate_config_toml(config);
        std::fs::write(&config_path, &config_toml)
            .map_err(|e| format!("failed to write codex config: {e}"))?;

        let child = Command::new(&codex_bin)
            .arg("--config")
            .arg(config_path.to_string_lossy().to_string())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("failed to start codex: {e}"))?;

        self.child = Some(child);
        Ok(())
    }

    pub fn stop(&mut self) -> Result<(), String> {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        Ok(())
    }

    pub fn send_rpc(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let child = self
            .child
            .as_mut()
            .ok_or_else(|| "Codex not running".to_string())?;

        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| "no stdin on codex process".to_string())?;

        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params,
        });

        let req_line = serde_json::to_string(&request)
            .map_err(|e| format!("serialization error: {e}"))?;

        writeln!(stdin, "{req_line}").map_err(|e| format!("write error: {e}"))?;

        let stdout = child
            .stdout
            .as_mut()
            .ok_or_else(|| "no stdout on codex process".to_string())?;

        let mut reader = BufReader::new(stdout);
        let mut response: Option<Value> = None;
        
        for _ in 0..100 {
            let mut line = String::new();
            let bytes_read = reader
                .read_line(&mut line)
                .map_err(|e| format!("read error: {e}"))?;
                
            if bytes_read == 0 { break; }
            let line = line.trim();
            if line.is_empty() { continue; }
            
            if let Ok(val) = serde_json::from_str::<Value>(line) {
                if val.get("id").and_then(|v| v.as_i64()) == Some(1) {
                    response = Some(val);
                    break;
                }
            }
        }

        let response = response.ok_or_else(|| "failed to find valid JSON-RPC response".to_string())?;

        if let Some(error) = response.get("error") {
            return Err(format!(
                "codex error: {}",
                error.get("message").and_then(|v| v.as_str()).unwrap_or("unknown")
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
        let home = self.home_dir.to_string_lossy();
        let enabled_skills = config.enabled_skills.join(", ");
        format!(
            r#"[codex]
model = "claude-sonnet-4-20250514"
provider = "anthropic"
max_tokens = 4096
system_prompt = "You are ClickyX Agent"

[skills]
directory = "{}"
enabled = [{}]

[mcp_servers]
"#,
            home, enabled_skills
        )
    }
}
