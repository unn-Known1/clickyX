use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub version: Option<String>,
    pub release_notes: Option<String>,
    pub download_url: Option<String>,
}

#[derive(Deserialize)]
struct UpdaterResponse {
    version: String,
    notes: Option<String>,
    pub_date: String,
    platforms: std::collections::HashMap<String, PlatformInfo>,
}

#[derive(Deserialize)]
struct PlatformInfo {
    signature: String,
    url: String,
}

fn current_platform_key() -> String {
    let os = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    };
    let arch = if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else if cfg!(target_arch = "x86_64") {
        "x86_64"
    } else {
        "x86"
    };
    format!("{os}-{arch}")
}

pub async fn check_for_updates(current_version: &str) -> Result<UpdateInfo, String> {
    let platform = current_platform_key();
    let url = format!(
        "https://releases.clickyx.app/{}/{}",
        platform, current_version
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("failed to build http client: {e}"))?;

    let resp = match client.get(&url).send().await {
        Ok(r) if r.status().is_success() => r,
        Ok(r) if r.status() == reqwest::StatusCode::NOT_FOUND => {
            return Ok(UpdateInfo {
                available: false,
                version: None,
                release_notes: None,
                download_url: None,
            });
        }
        Ok(r) => {
            return Err(format!("updater server returned {}", r.status()));
        }
        Err(e) => {
            log::warn!("Failed to check for updates: {e}");
            return Ok(UpdateInfo {
                available: false,
                version: None,
                release_notes: None,
                download_url: None,
            });
        }
    };

    let data: UpdaterResponse = match resp.json().await {
        Ok(d) => d,
        Err(e) => {
            return Err(format!("failed to parse updater response: {e}"));
        }
    };

    let platform_info = data.platforms.get(&platform);

    Ok(UpdateInfo {
        available: true,
        version: Some(data.version),
        release_notes: data.notes,
        download_url: platform_info.map(|p| p.url.clone()),
    })
}

pub async fn download_update(url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("failed to build http client: {e}"))?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("download failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("download returned {}", resp.status()));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("failed to read download: {e}"))?;

    Ok(bytes.to_vec())
}

pub fn install_update(update_data: &[u8]) -> Result<(), String> {
    let tmp_dir = std::env::temp_dir().join("clickyx-update");
    std::fs::create_dir_all(&tmp_dir)
        .map_err(|e| format!("failed to create temp dir: {e}"))?;

    let ext = if cfg!(target_os = "windows") {
        ".msi"
    } else if cfg!(target_os = "macos") {
        ".dmg"
    } else {
        ".AppImage"
    };

    let update_path = tmp_dir.join(format!("clickyx-update{}", ext));

    std::fs::write(&update_path, update_data)
        .map_err(|e| format!("failed to write update file: {e}"))?;

    log::info!("Update downloaded to {:?}", update_path);

    let path_str = update_path.to_string_lossy().to_string();

    if cfg!(target_os = "windows") {
        std::process::Command::new("msiexec")
            .args(["/i", &path_str, "/quiet", "/norestart"])
            .spawn()
            .map_err(|e| format!("failed to launch installer: {e}"))?;
    } else if cfg!(target_os = "macos") {
        std::process::Command::new("open")
            .args(["-W", &path_str])
            .spawn()
            .map_err(|e| format!("failed to open DMG: {e}"))?;
    } else {
        std::process::Command::new("chmod")
            .args(["+x", &path_str])
            .spawn()
            .map_err(|e| format!("failed to chmod: {e}"))?;
        let app_path = dirs::home_dir()
            .unwrap_or_default()
            .join(".local/bin/clickyx");
        std::fs::copy(&update_path, &app_path)
            .map_err(|e| format!("failed to copy AppImage: {e}"))?;
        log::info!("AppImage installed to {:?}", app_path);
    }

    Ok(())
}
