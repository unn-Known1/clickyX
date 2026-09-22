use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub version: Option<String>,
    pub release_notes: Option<String>,
    pub download_url: Option<String>,
    /// Minisign signature text (`.sig` companion) for the download, when known.
    pub signature: Option<String>,
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

/// Trusted minisign release public key (base64), baked in at build time via
/// `CLICKYX_UPDATE_PUBKEY`. Empty in dev builds — and an empty key means
/// installs are REFUSED (fail-closed, P0-T3). The release workflow sets this
/// from the `UPDATE_SIGNING_PUBKEY` secret; see release.yml + SECURITY.md.
pub fn update_signing_pubkey() -> &'static str {
    option_env!("CLICKYX_UPDATE_PUBKEY").unwrap_or("").trim()
}

/// Parse `1.2.3` / `v1.2.3` into a semver Version. Returns None when the
/// string is not valid semver (caller treats unparseable as "no update").
fn parse_version(v: &str) -> Option<semver::Version> {
    semver::Version::parse(v.trim().trim_start_matches(['v', 'V'])).ok()
}

/// True only when `latest` is strictly NEWER than `current` (semver order).
/// Equal, older, or unparseable versions never report an update — this also
/// refuses downgrades/replays (C-2).
fn is_newer_version(latest: &str, current: &str) -> bool {
    match (parse_version(latest), parse_version(current)) {
        (Some(l), Some(c)) => l > c,
        _ => false,
    }
}

fn no_update(version: Option<String>, notes: Option<String>) -> UpdateInfo {
    UpdateInfo {
        available: false,
        version,
        release_notes: notes,
        download_url: None,
        signature: None,
        delta_available: None,
        delta_url: None,
    }
}

pub async fn check_for_updates(current_version: &str) -> Result<UpdateInfo, String> {
    // P0-T3: single update path — hosted metadata first, GitHub fallback.
    match check_hosted_for_updates(current_version).await {
        Ok(info) => Ok(info),
        Err(e) => {
            log::warn!("Hosted update check failed ({e}); falling back to GitHub releases");
            check_github_for_updates(current_version).await
        }
    }
}

async fn check_hosted_for_updates(current_version: &str) -> Result<UpdateInfo, String> {
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
            return Ok(no_update(None, None));
        }
        Ok(r) => {
            return Err(format!("updater server returned {}", r.status()));
        }
        Err(e) => {
            return Err(format!("hosted update check failed: {e}"));
        }
    };

    let data: UpdaterResponse = match resp.json().await {
        Ok(d) => d,
        Err(e) => {
            return Err(format!("failed to parse updater response: {e}"));
        }
    };

    let platform_info = data.platforms.get(&platform);

    // #41: don't advertise an update we cannot download for this platform.
    let Some(platform_info) = platform_info else {
        log::warn!(
            "updater: no artifact for platform '{platform}' (v{})",
            data.version
        );
        return Ok(no_update(Some(data.version), data.notes));
    };

    // P0-T3: semver-aware — never offer equal/older/unparseable versions.
    if !is_newer_version(&data.version, current_version) {
        log::info!(
            "updater: remote v{} is not newer than current v{current_version}; no update",
            data.version
        );
        return Ok(no_update(Some(data.version), data.notes));
    }

    Ok(UpdateInfo {
        available: true,
        version: Some(data.version),
        release_notes: data.notes,
        download_url: Some(platform_info.url.clone()),
        signature: if platform_info.signature.is_empty() {
            None
        } else {
            Some(platform_info.signature.clone())
        },
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

#[cfg(not(target_os = "linux"))]
fn detect_linux_package_format() -> &'static str {
    "appimage"
}

/// Verify downloaded update bytes against a minisign signature, fail-closed:
/// - no trusted release key configured → refuse;
/// - signature missing → refuse;
/// - signature invalid → refuse.
pub fn verify_update_signature(data: &[u8], signature: Option<&str>) -> Result<(), String> {
    let pubkey_b64 = update_signing_pubkey();
    if pubkey_b64.is_empty() {
        return Err(
            "refusing update install: no trusted release key configured in this build \
             (release process must set CLICKYX_UPDATE_PUBKEY; see SECURITY.md)"
                .into(),
        );
    }
    let sig_text = signature
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "refusing update install: release signature missing".to_string())?;
    let pubkey = minisign_verify::PublicKey::from_base64(pubkey_b64)
        .map_err(|e| format!("refusing update install: bad release key: {e}"))?;
    let sig = minisign_verify::Signature::decode(sig_text)
        .map_err(|e| format!("refusing update install: bad signature: {e}"))?;
    pubkey
        .verify(data, &sig, false)
        .map_err(|e| format!("refusing update install: signature verification failed: {e}"))?;
    log::info!("Update signature verified against trusted release key");
    Ok(())
}

/// Download `url`, verify its signature, then install.
/// When no signature was supplied (GitHub path), a `<url>.sig` companion is
/// fetched best-effort; verification itself stays fail-closed.
pub async fn install_update_from_url(url: &str, signature: Option<&str>) -> Result<(), String> {
    let data = download_update(url).await?;
    let sig_owned: Option<String>;
    let sig = match signature.map(str::trim).filter(|s| !s.is_empty()) {
        Some(s) => Some(s),
        None => {
            let sig_url = format!("{url}.sig");
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .map_err(|e| format!("failed to build http client: {e}"))?;
            match client.get(&sig_url).send().await {
                Ok(r) if r.status().is_success() => match r.text().await {
                    Ok(t) => {
                        sig_owned = Some(t);
                        sig_owned.as_deref()
                    }
                    Err(_) => None,
                },
                _ => None,
            }
        }
    };
    install_update(&data, sig)
}

pub fn install_update(update_data: &[u8], signature: Option<&str>) -> Result<(), String> {
    // P0-T3/C-2: verify FIRST — unsigned artifacts are refused, no exceptions.
    verify_update_signature(update_data, signature)?;
    let tmp_dir = std::env::temp_dir().join("clickyx-update");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| format!("failed to create temp dir: {e}"))?;

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
        // Mount DMG, copy .app to /Applications, then unmount.
        let mount_output = std::process::Command::new("hdiutil")
            .args(["attach", "-nobrowse", "-quiet", &path_str])
            .output()
            .map_err(|e| format!("failed to mount DMG: {e}"))?;
        if !mount_output.status.success() {
            let stderr = String::from_utf8_lossy(&mount_output.stderr);
            return Err(format!("hdiutil attach failed: {}", stderr.trim()));
        }
        // Find the mounted volume path
        let mount_out = String::from_utf8_lossy(&mount_output.stdout);
        let vol_path = mount_out
            .lines()
            .filter_map(|l| {
                let l = l.trim();
                if l.contains("/Volumes/") {
                    l.split_whitespace().last().map(|s| s.to_string())
                } else {
                    None
                }
            })
            .next();
        let vol_path = match vol_path {
            Some(p) => p,
            None => return Err("could not determine DMG mount path".into()),
        };
        // Find the .app on the volume
        let app_on_vol = format!("{}/ClickyX.app", vol_path);
        // P2 (clippy): Path::join("/Applications") silently discarded the
        // home dir (absolute wins) — the target is system /Applications; say so.
        let apps_dir = std::path::PathBuf::from("/Applications");
        let target_app = format!("{}/ClickyX.app", apps_dir.display());
        // Remove existing app if present
        let _ = std::fs::remove_dir_all(&target_app);
        // Copy with ditto (preserves code signature, extended attributes)
        let copy_result = std::process::Command::new("ditto")
            .args([&app_on_vol, &target_app])
            .output();
        // Unmount DMG regardless of copy result
        let _ = std::process::Command::new("hdiutil")
            .args(["detach", "-quiet", &vol_path])
            .output();
        match copy_result {
            Ok(out) if out.status.success() => {
                log::info!("macOS app updated at {}", target_app);
            }
            Ok(out) => {
                let stderr = String::from_utf8_lossy(&out.stderr);
                return Err(format!("ditto copy failed: {}", stderr.trim()));
            }
            Err(e) => {
                return Err(format!("ditto launch failed: {e}"));
            }
        }
        log::info!("Update installed to /Applications. User must relaunch.");
    } else {
        let pkg_format = detect_linux_package_format();
        match pkg_format {
            "deb" => {
                let _ = std::process::Command::new("xdg-open")
                    .arg(&path_str)
                    .spawn();
                log::info!(
                    "Opened .deb package for manual install; user should run: sudo dpkg -i {}",
                    path_str
                );
            }
            "rpm" => {
                let _ = std::process::Command::new("xdg-open")
                    .arg(&path_str)
                    .spawn();
                log::info!(
                    "Opened .rpm package for manual install; user should run: sudo rpm -Uvh {}",
                    path_str
                );
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
                if let Err(_e) = std::fs::rename(&update_path, &app_path) {
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

/// GitHub fallback for the single update path (P0-T3). Replaces the dead
/// `check_for_update_with_delta`: one GitHub check, semver-aware, with asset
/// matching that understands real artifact names
/// (`ClickyX_0.2.0_x64-setup.exe`, `ClickyX_0.2.0_aarch64.dmg`, `ClickyX_0.2.0_amd64.deb`).
pub async fn check_github_for_updates(current_version: &str) -> Result<UpdateInfo, String> {
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
        return Ok(no_update(None, None));
    }

    if !resp.status().is_success() {
        return Err(format!("github api returned {}", resp.status()));
    }

    let release: GithubRelease = resp
        .json()
        .await
        .map_err(|e| format!("failed to parse github release: {e}"))?;

    // P0-T3: semver-aware — equal/older/unparseable never offer an update.
    if !is_newer_version(&release.tag_name, current_version) {
        log::info!(
            "updater: github release {} is not newer than current v{current_version}; no update",
            release.tag_name
        );
        return Ok(no_update(Some(release.tag_name), release.body));
    }

    let full_asset = release
        .assets
        .iter()
        .filter_map(|a| score_github_asset(&a.name).map(|score| (score, a)))
        .max_by_key(|(score, _)| *score)
        .map(|(_, a)| a);

    let Some(full_asset) = full_asset else {
        log::warn!(
            "updater: no installable asset for this platform in {}",
            release.tag_name
        );
        return Ok(no_update(Some(release.tag_name), release.body));
    };

    Ok(UpdateInfo {
        available: true,
        version: Some(release.tag_name),
        release_notes: release.body,
        download_url: Some(full_asset.browser_download_url.clone()),
        // Signature companion (`<url>.sig`) is fetched at install time.
        signature: None,
        delta_available: Some(false),
        delta_url: None,
    })
}

fn current_arch_token() -> &'static [&'static str] {
    if cfg!(target_arch = "aarch64") {
        &["aarch64", "arm64"]
    } else if cfg!(target_arch = "x86_64") {
        &["x86_64", "x64", "amd64"]
    } else {
        &["x86"]
    }
}

/// Score a GitHub release asset name for THIS platform. `None` = not for us.
/// P0-T3: the old matcher looked for `name.contains("windows"|"macos"|"linux")`,
/// but published assets are named like `ClickyX_0.2.0_x64-setup.exe` — no match,
/// so the fallback never found anything.
fn score_github_asset(name: &str) -> Option<u32> {
    let lower = name.to_ascii_lowercase();
    // Never pick signatures/patches as the installable artifact.
    if lower.ends_with(".sig") || lower.contains("delta") || lower.contains(".patch") {
        return None;
    }
    let arch_bonus = current_arch_token().iter().any(|a| lower.contains(a));

    #[cfg(target_os = "windows")]
    {
        // Real names look like ClickyX_0.2.0_x64-setup.exe (no "windows" in
        // the name) — match on installer signals, not just OS substrings.
        if !(lower.contains("windows")
            || lower.contains("win")
            || lower.contains("setup")
            || lower.ends_with(".msi")
            || lower.ends_with(".exe"))
        {
            return None;
        }
        let mut score = 1u32;
        if lower.ends_with(".msi") {
            score += 2; // install_update shells to msiexec
        }
        if arch_bonus {
            score += 2;
        }
        Some(score)
    }

    #[cfg(target_os = "macos")]
    {
        if !(lower.contains("macos") || lower.contains("darwin") || lower.ends_with(".dmg")) {
            return None;
        }
        let mut score = 1u32;
        if lower.ends_with(".dmg") {
            score += 2;
        }
        if arch_bonus {
            score += 2;
        }
        Some(score)
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        // Real names look like ClickyX_0.2.0_amd64.deb (no "linux" in the
        // name) — match on package-format signals, not just OS substrings.
        if !(lower.contains("linux")
            || lower.contains("appimage")
            || lower.ends_with(".deb")
            || lower.ends_with(".rpm")
            || lower.ends_with(".appimage"))
        {
            return None;
        }
        let mut score = 1u32;
        // Prefer the format matching how this machine installed the app.
        let preferred_ext = match detect_linux_package_format() {
            "deb" => ".deb",
            "rpm" => ".rpm",
            _ => ".appimage",
        };
        if lower.ends_with(preferred_ext) {
            score += 2;
        }
        if arch_bonus {
            score += 2;
        }
        Some(score)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_version() {
        assert!(parse_version("0.2.0").is_some());
        assert!(parse_version("v0.2.0").is_some());
        assert!(parse_version("  1.10.3  ").is_some());
        assert!(parse_version("not-a-version").is_none());
        assert!(parse_version("").is_none());
        assert!(parse_version("1.2").is_none());
    }

    #[test]
    fn test_is_newer_version_semver_order() {
        assert!(is_newer_version("0.2.1", "0.2.0"));
        assert!(is_newer_version("0.10.0", "0.9.9")); // numeric, not lexicographic
        assert!(is_newer_version("1.0.0", "0.99.99"));
        assert!(is_newer_version("v0.2.1", "0.2.0"));
        // Equal / older / garbage never offer an update (downgrade refusal).
        assert!(!is_newer_version("0.2.0", "0.2.0"));
        assert!(!is_newer_version("0.1.9", "0.2.0"));
        assert!(!is_newer_version("1.0.0", "2.0.0"));
        assert!(!is_newer_version("garbage", "0.2.0"));
        assert!(!is_newer_version("0.3.0", "garbage"));
    }

    #[test]
    fn test_verify_refuses_without_trusted_key() {
        // Dev builds have no CLICKYX_UPDATE_PUBKEY → fail-closed.
        if update_signing_pubkey().is_empty() {
            let err = verify_update_signature(b"bytes", Some("sig")).unwrap_err();
            assert!(err.contains("no trusted release key"), "unexpected: {err}");
            let err = verify_update_signature(b"bytes", None).unwrap_err();
            assert!(err.contains("no trusted release key"), "unexpected: {err}");
        }
    }

    #[test]
    fn test_verify_refuses_missing_signature_shape() {
        // Empty/whitespace signatures are treated as missing.
        // (With a key configured this errors on the signature; without a key
        // it errors on the key first — either way it refuses.)
        assert!(verify_update_signature(b"bytes", None).is_err());
        assert!(verify_update_signature(b"bytes", Some("   ")).is_err());
    }

    #[test]
    fn test_score_github_asset_rejects_non_artifacts() {
        assert!(score_github_asset("ClickyX_0.2.0_amd64.deb.sig").is_none());
        assert!(score_github_asset("linux-delta.patch").is_none());
        assert!(score_github_asset("README.md").is_none());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn test_score_github_asset_linux_prefers_install_format() {
        // On this CI machine (x86_64 linux) real names must match.
        let deb = score_github_asset("ClickyX_0.2.0_amd64.deb");
        assert!(deb.is_some(), "real .deb name should match on linux");
        assert!(score_github_asset("ClickyX_0.2.0_x86_64.AppImage").is_some());
        assert!(score_github_asset("ClickyX_0.2.0_x86_64.rpm").is_some());
        assert!(score_github_asset("ClickyX_0.2.0_x64-setup.exe").is_none());
        assert!(score_github_asset("ClickyX_0.2.0_aarch64.dmg").is_none());
    }

    #[test]
    fn test_current_platform_key_format() {
        let key = current_platform_key();
        assert!(key.contains('-'), "unexpected key: {key}");
    }

    #[test]
    fn test_no_update_shape() {
        let info = no_update(Some("1.0.0".into()), None);
        assert!(!info.available);
        assert!(info.download_url.is_none());
        assert!(info.signature.is_none());
    }
}
