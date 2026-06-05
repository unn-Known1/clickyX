use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::io::Write;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub version: Option<String>,
    pub release_notes: Option<String>,
    pub download_url: Option<String>,
    /// Whether a delta patch is available (smaller download)
    pub delta_available: Option<bool>,
    pub delta_url: Option<String>,
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
                delta_available: None,
                delta_url: None,
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
                delta_available: None,
                delta_url: None,
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
        delta_available: None,
        delta_url: None,
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

/// Detect the installed Linux update format.
#[cfg(target_os = "linux")]
fn detect_linux_package_format() -> &'static str {
    // Check if installed via dpkg (.deb)
    if let Ok(out) = std::process::Command::new("dpkg")
        .args(["-l", "clickyx"])
        .output()
    {
        if out.status.success() {
            return "deb";
        }
    }
    // Check if installed via rpm
    if let Ok(out) = std::process::Command::new("rpm")
        .args(["-q", "clickyx"])
        .output()
    {
        if out.status.success() {
            return "rpm";
        }
    }
    // Check if installed as AppImage in ~/.local/bin
    let appimage_path = dirs::home_dir()
        .unwrap_or_default()
        .join(".local/bin/clickyx");
    if appimage_path.exists() {
        return "appimage";
    }
    // Default to AppImage
    "appimage"
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
        // Linux: detect installed format
        match detect_linux_package_format() {
            "deb" => ".deb",
            "rpm" => ".rpm",
            _ => ".AppImage",
        }
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
        let pkg_format = detect_linux_package_format();
        match pkg_format {
            "deb" => {
                let _ = std::process::Command::new("xdg-open")
                    .arg(&path_str)
                    .spawn();
                log::info!("Opened .deb package for manual install; user should run: sudo dpkg -i {}", path_str);
            }
            "rpm" => {
                let _ = std::process::Command::new("xdg-open")
                    .arg(&path_str)
                    .spawn();
                log::info!("Opened .rpm package for manual install; user should run: sudo rpm -Uvh {}", path_str);
            }
            _ => {
                // AppImage: chmod +x then install
                std::process::Command::new("chmod")
                    .args(["+x", &path_str])
                    .spawn()
                    .map_err(|e| format!("failed to chmod: {e}"))?;
                let app_path = dirs::home_dir()
                    .unwrap_or_default()
                    .join(".local/bin/clickyx");
                // Use rename (mv) instead of copy to avoid leaving temp file
                if let Err(e) = std::fs::rename(&update_path, &app_path) {
                    // Fall back to copy if rename fails (cross-device link)
                    std::fs::copy(&update_path, &app_path)
                        .map_err(|e2| format!("failed to copy AppImage: {e2}"))?;
                    let _ = std::fs::remove_file(&update_path);
                }
                log::info!("AppImage installed to {:?}", app_path);
                // Warn if ~/.local/bin is not in PATH
                let path_var = std::env::var("PATH").unwrap_or_default();
                if !path_var.contains(".local/bin") {
                    log::warn!(
                        "~/.local/bin is not in your PATH. Add 'export PATH=\"$HOME/.local/bin:$PATH\"' to your ~/.profile"
                    );
                }
            }
        }
    }

    Ok(())
}

/// Build the GitHub API URL for the latest release of this project.
fn github_latest_release_url() -> &'static str {
    "https://api.github.com/repos/unn-Known1/clickyX/releases/latest"
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    body: Option<String>,
    assets: Vec<GithubAsset>,
}

#[derive(Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

/// Check for an update on GitHub, preferring a `.sig`-accompanied delta patch if available.
/// Falls back to full binary download if no delta is found.
/// Emits `"update-download-progress"` events during download.
pub async fn check_for_update_with_delta(
    app: &AppHandle,
    current_version: &str,
) -> Result<UpdateInfo, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("ClickyX-Updater/1.0")
        .build()
        .map_err(|e| format!("failed to build http client: {e}"))?;

    let resp = client
        .get(github_latest_release_url())
        .send()
        .await
        .map_err(|e| format!("github api request failed: {e}"))?;

    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(UpdateInfo {
            available: false,
            version: None,
            release_notes: None,
            download_url: None,
            delta_available: None,
            delta_url: None,
        });
    }

    if !resp.status().is_success() {
        return Err(format!("github api returned {}", resp.status()));
    }

    let release: GithubRelease = resp
        .json()
        .await
        .map_err(|e| format!("failed to parse github release: {e}"))?;

    // Strip leading 'v' for comparison
    let latest_ver = release.tag_name.trim_start_matches('v');
    if latest_ver == current_version.trim_start_matches('v') {
        return Ok(UpdateInfo {
            available: false,
            version: Some(release.tag_name),
            release_notes: release.body,
            download_url: None,
            delta_available: Some(false),
            delta_url: None,
        });
    }

    // Determine platform keyword for asset matching
    let platform_keyword = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };

    // Look for a delta patch: asset name contains "delta" or ".patch"
    let delta_asset = release.assets.iter().find(|a| {
        (a.name.contains("delta") || a.name.contains(".patch"))
            && a.name.contains(platform_keyword)
    });

    // Look for the primary full release asset
    let full_asset = release.assets.iter().find(|a| {
        a.name.contains(platform_keyword)
            && !a.name.contains("delta")
            && !a.name.contains(".sig")
            && !a.name.contains(".patch")
    });

    let _ = app; // used for progress events in download_update_with_progress

    Ok(UpdateInfo {
        available: true,
        version: Some(release.tag_name),
        release_notes: release.body,
        download_url: full_asset.map(|a| a.browser_download_url.clone()),
        delta_available: Some(delta_asset.is_some()),
        delta_url: delta_asset.map(|a| a.browser_download_url.clone()),
    })
}

/// Download an update from `url`, emitting `"update-download-progress"` events on `app`.
/// Returns the downloaded bytes.
pub async fn download_update_with_progress(
    app: &AppHandle,
    url: &str,
) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| format!("failed to build http client: {e}"))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("download request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("download returned {}", response.status()));
    }

    let total = response
        .content_length()
        .unwrap_or(0);

    let tmp_dir = std::env::temp_dir().join("clickyx-update-tmp");
    std::fs::create_dir_all(&tmp_dir)
        .map_err(|e| format!("failed to create temp dir: {e}"))?;
    let tmp_file = tmp_dir.join("download.bin");
    let mut file = std::fs::File::create(&tmp_file)
        .map_err(|e| format!("failed to create temp file: {e}"))?;

    let mut stream = response.bytes_stream();
    let mut downloaded = 0u64;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        let _ = app.emit(
            "update-download-progress",
            serde_json::json!({
                "percent": if total > 0 { (downloaded as f64 / total as f64 * 100.0) as u32 } else { 0u32 },
                "bytes_downloaded": downloaded,
                "total_bytes": total,
            }),
        );

        file.write_all(&chunk).map_err(|e| format!("write failed: {e}"))?;
    }

    drop(file);

    let data = std::fs::read(&tmp_file)
        .map_err(|e| format!("failed to read downloaded file: {e}"))?;
    let _ = std::fs::remove_file(&tmp_file);

    Ok(data)
}
