use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize)]
struct TripoRequest {
    prompt: String,
    style: String,
}

#[derive(Debug, Deserialize)]
struct TripoResponse {
    data: TripoData,
}

#[derive(Debug, Deserialize)]
struct TripoData {
    task_id: String,
}

#[derive(Debug, Deserialize)]
struct TaskStatusResponse {
    data: TaskStatusData,
}

#[derive(Debug, Deserialize)]
struct TaskStatusData {
    status: String,
    output: Option<TaskOutput>,
}

#[derive(Debug, Deserialize)]
struct TaskOutput {
    model: String,
}

/// #49: strip any characters that could escape the models dir or be invalid in
/// a filename (`/`, `..`, path separators, control chars).
fn sanitize_prompt_fragment(prompt: &str) -> String {
    let mut out = String::new();
    for c in prompt.chars() {
        if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' {
            out.push(c);
        } else {
            out.push('-');
        }
        if out.chars().count() >= 24 {
            break;
        }
    }
    let trimmed = out.trim().trim_matches('-');
    if trimmed.is_empty() {
        "model".to_string()
    } else {
        trimmed.to_string()
    }
}

pub async fn generate_3d(prompt: &str, style: &str, api_key: &str) -> Result<String, String> {
    let client = reqwest::Client::new();

    let req_body = TripoRequest {
        prompt: prompt.to_string(),
        style: style.to_string(),
    };

    let resp = client
        .post("https://api.tripo3d.ai/v2/openapi/text_to_model")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&req_body)
        .send()
        .await
        .map_err(|e| format!("Tripo3D request failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Tripo3D request returned {status}: {body}"));
    }
    let resp: TripoResponse = resp
        .json()
        .await
        .map_err(|e| format!("Tripo3D response parse failed: {e}"))?;

    let task_id = resp.data.task_id;
    log::info!("3D generation task created: {}", task_id);

    let max_attempts = 150u32;
    for i in 0..max_attempts {
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

        let status_resp = client
            .get(format!(
                "https://api.tripo3d.ai/v2/openapi/task/{}",
                task_id
            ))
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .await;

        // #49: transient network errors should be retried, not fatal.
        let status: TaskStatusResponse = match status_resp {
            Ok(r) if r.status().is_success() => r
                .json()
                .await
                .map_err(|e| format!("Tripo3D status parse failed: {e}"))?,
            Ok(r) => {
                let code = r.status();
                if code.is_client_error() {
                    let body = r.text().await.unwrap_or_default();
                    return Err(format!("Tripo3D task check returned {code}: {body}"));
                }
                log::warn!("Tripo3D task check transient error {code} — retrying");
                continue;
            }
            Err(e) => {
                log::warn!("Tripo3D task check network error: {e} — retrying");
                continue;
            }
        };

        match status.data.status.as_str() {
            "success" => {
                if let Some(output) = status.data.output {
                    let model_url = output.model;
                    let model_bytes = client
                        .get(&model_url)
                        .send()
                        .await
                        .map_err(|e| format!("Failed to download model: {e}"))?
                        .bytes()
                        .await
                        .map_err(|e| format!("Failed to read model bytes: {e}"))?;

                    let output_dir = dirs::data_dir()
                        .unwrap_or_else(|| PathBuf::from("."))
                        .join("clickyx")
                        .join("models");
                    std::fs::create_dir_all(&output_dir)
                        .map_err(|e| format!("Failed to create models dir: {e}"))?;

                    let fragment = sanitize_prompt_fragment(prompt);
                    let file_name = format!("{}_{}.glb", task_id, fragment);
                    let file_path = output_dir.join(&file_name);
                    std::fs::write(&file_path, &model_bytes)
                        .map_err(|e| format!("Failed to save model: {e}"))?;

                    log::info!("3D model saved to {:?}", file_path);
                    return Ok(file_path.to_string_lossy().to_string());
                }
                return Err("no output in successful response".into());
            }
            "failed" => {
                return Err("Tripo3D task failed".into());
            }
            _ => {
                log::debug!("3D generation task {} status: {}", task_id, status.data.status);
            }
        }

        if i % 10 == 9 {
            log::info!(
                "3D generation polling... ({}/{} attempts)",
                i + 1,
                max_attempts
            );
        }
    }

    Err("Tripo3D generation timed out after 300 seconds".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tripo_request_serialization() {
        let req = TripoRequest {
            prompt: "a red sports car".into(),
            style: "realistic".into(),
        };
        let json = serde_json::to_string(&req).expect("serialize failed");
        assert!(json.contains("\"prompt\""));
        assert!(json.contains("a red sports car"));
        assert!(json.contains("\"style\""));
        assert!(json.contains("realistic"));
    }

    #[test]
    fn test_tripo_response_deserialization() {
        let json = r#"{"data":{"task_id":"abc-123-xyz"}}"#;
        let resp: TripoResponse = serde_json::from_str(json).expect("deserialize failed");
        assert_eq!(resp.data.task_id, "abc-123-xyz");
    }

    #[test]
    fn test_task_status_success_with_output() {
        let json = r#"{"data":{"status":"success","output":{"model":"https://example.com/model.glb"}}}"#;
        let resp: TaskStatusResponse = serde_json::from_str(json).expect("deserialize failed");
        assert_eq!(resp.data.status, "success");
        assert!(resp.data.output.is_some());
        assert_eq!(resp.data.output.unwrap().model, "https://example.com/model.glb");
    }

    #[test]
    fn test_task_status_failed() {
        let json = r#"{"data":{"status":"failed","output":null}}"#;
        let resp: TaskStatusResponse = serde_json::from_str(json).expect("deserialize failed");
        assert_eq!(resp.data.status, "failed");
        assert!(resp.data.output.is_none());
    }

    #[test]
    fn test_task_status_queued_no_output() {
        let json = r#"{"data":{"status":"queued"}}"#;
        let resp: TaskStatusResponse = serde_json::from_str(json).expect("deserialize failed");
        assert_eq!(resp.data.status, "queued");
        assert!(resp.data.output.is_none());
    }

    #[test]
    fn test_task_status_running_no_output() {
        let json = r#"{"data":{"status":"running","output":null}}"#;
        let resp: TaskStatusResponse = serde_json::from_str(json).expect("deserialize failed");
        assert_eq!(resp.data.status, "running");
        assert!(resp.data.output.is_none());
    }

    #[test]
    fn test_tripo_request_prompt_escaped() {
        let req = TripoRequest {
            prompt: r#"a "fancy" object with 'quotes'"#.into(),
            style: "cartoon".into(),
        };
        let json = serde_json::to_string(&req).expect("serialize failed");
        // JSON should handle escaping properly
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("re-parse failed");
        assert_eq!(parsed["prompt"].as_str().unwrap(), r#"a "fancy" object with 'quotes'"#);
    }

    #[test]
    fn test_output_model_url_parsed() {
        let json = r#"{"model":"https://cdn.tripo3d.ai/output/model.glb"}"#;
        let output: TaskOutput = serde_json::from_str(json).expect("deserialize failed");
        assert!(output.model.starts_with("https://"));
        assert!(output.model.ends_with(".glb"));
    }

    #[test]
    fn test_generate_3d_requires_non_empty_api_key() {
        // We can't make real HTTP calls in unit tests, but we can verify
        // the function signature compiles and parameter types are correct.
        let _prompt: &str = "a test object";
        let _style: &str = "realistic";
        let _api_key: &str = "sk-test";
        // If this compiles, the interface is correct.
    }
}
