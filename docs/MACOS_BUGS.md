# macOS Build & Runtime Bugs

## Audit Method

All findings come from static analysis of the source code at `/content/clickyx`. The macOS platform was analyzed for:
- `#[cfg(target_os = "macos")]` blocks in Rust source
- `cfg!(target_os = "macos")` runtime conditionals
- Apple framework usage (Foundation, AppKit — policy says none, verified)
- `osascript`, `screencapture`, `sqlite3`, `cliclick`, `open` tool calls
- `entitlements.plist`, `sign-macos.sh`, `notarize-macos.sh`
- `tauri.conf.json` macOS bundle config
- CI/CD workflows for macOS build/sign/notarize/release
- Updater macOS code paths

**No macOS runtime testing was performed.** Some issues require real hardware (Apple Silicon vs Intel, different macOS versions) to confirm.

---

## Bug #1 — `notarize-macos.sh` exits 0 on failure and missing TEAM_ID

**Severity:** HIGH
**Files:** `scripts/notarize-macos.sh`, `.github/workflows/release.yml:86`
**Root cause:**

The CI calls notarization with only 2 arguments:
```bash
bash scripts/notarize-macos.sh "$APPLE_NOTARIZATION_USERNAME" "$APPLE_NOTARIZATION_PASSWORD"
```

The script expects 4 positional parameters:
```bash
APPLE_ID_USERNAME="${1:-}"
APPLE_ID_PASSWORD="${2:-}"
BUNDLE_DIR="${3:-src-tauri/target/release/bundle}"
TEAM_ID="${4:-}"
```

The `TEAM_ID` is empty (never provided). The `notarytool submit` command at line 32-36 passes `--team-id ""` which will fail on modern Apple notary services. Apple's notarytool now requires team ID for all submissions.

Additionally, the script has no error handling:
- Line 12: `exit 0` when credentials are missing — should be `exit 1`
- Line 22: `exit 0` when no app bundle found — should be `exit 1`
- The `notarytool submit` return code is not checked; the script continues even on failure
- Line 43: `if [ -n "$SUBMISSION_ID" ]` — if notarization fails, `SUBMISSION_ID` is empty, script just exits 0 with no error
- No `| true` or error handling around the stapler command

**Impact:** Notarization silently fails. The app ships without a valid notarization ticket, triggering macOS Gatekeeper warnings for all users. End users see "ClickyX cannot be opened because the developer cannot be verified."

**Fix:**
1. Pass `${{ secrets.APPLE_TEAM_ID }}` as a 4th argument in `release.yml`
2. Add `set -e` properly or check return codes after `notarytool submit`
3. Exit with error code on failure instead of silently continuing
4. Validate that `SUBMISSION_ID` is non-empty before proceeding

---

## Bug #2 — `sign-macos.sh` uses deprecated `codesign --deep` and missing `--timestamp`

**Severity:** HIGH
**File:** `scripts/sign-macos.sh:14`
**Root cause:**
```bash
codesign --deep --force --verify --verbose \
  --sign "$IDENTITY" \
  --options runtime \
  --entitlements src-tauri/entitlements.plist \
  "$app"
```

Two issues:
1. **`--deep` is deprecated by Apple** (WWDC 2023, `man codesign`). It may produce incorrect signatures on nested bundles that have already been individually signed. Apple recommends signing each component individually or not using `--deep`.
2. **Missing `--timestamp`**: Without the `--timestamp` flag, the signature lacks a trusted timestamp. Apple's notarization service may reject such signatures. The command should include `--timestamp` (or `--timestamp=none` explicitly if not wanted).

**Impact:** Signed apps may fail notarization or exhibit signature verification warnings on macOS 14+.

**Fix:**
```bash
codesign --force --verify --verbose --timestamp \
  --sign "$IDENTITY" \
  --options runtime \
  --entitlements src-tauri/entitlements.plist \
  "$app"
```
And remove `--deep`.

---

## Bug #3 — `screencapture -x` flag removed in macOS 14 Sonoma

**Severity:** MEDIUM
**File:** `src-tauri/src/permissions.rs:165-167`
**Root cause:**
```rust
let out = Command::new("screencapture")
    .args(["-x", "-t", "png", tmp])
    .output();
```

The `-x` flag (suppress capture sound) existed in older macOS but was **removed in macOS 14 Sonoma** and later. On macOS 14+, `screencapture -x` exits with an error:

```
screencapture: unrecognized option `-x'
```

This causes `check_screen_recording()` to return `false` on all macOS 14+ systems, even when screen recording permission is granted.

**Impact:** Screen recording permission check always returns "not granted" on macOS 14+, causing the app to report incorrect permission status and potentially deny screen capture features.

**Fix:** Remove the `-x` flag. The sound suppression behavior is the default in modern macOS for command-line `screencapture`:
```rust
args(["-t", "png", tmp])
```

---

## Bug #4 — TCC SQLite database schema changes between macOS versions

**Severity:** MEDIUM
**File:** `src-tauri/src/permissions.rs:134-159`
**Root cause:**
```rust
fn check_tcc_permission(service: &str) -> bool {
    let query = format!(
        "SELECT auth_value FROM access WHERE service='{}' AND auth_value=2 LIMIT 1;",
        service
    );
```
The TCC database at `~/Library/Application Support/com.apple.TCC/TCC.db` has changed schema across macOS versions:

| macOS | Schema changes |
|-------|---------------|
| 10.14-10.15 | Original schema, `auth_value=2` = allowed |
| 11-13 | Added `last_modified`, `auth_value` still 2=allowed |
| 14+ (Sonoma) | New columns, `auth_value` may have different semantics, new `TCC.db` hardening |
| 15+ (Sequoia) | Further TCC protections, some data moved to encrypted storage |

The SQLite query is fragile:
1. Column names or table structure may change in future macOS versions
2. The database is not designed for direct querying — Apple reserves the right to change the format
3. SIP (System Integrity Protection) may prevent reading the system TCC DB on newer macOS
4. MDS (Mobile Device Supervision) may encrypt parts of the TCC DB
5. No handling for `auth_value=3` (limited access) or other values

**Impact:** Permission status reports may return incorrect results (false negatives or false positives) on newer macOS versions, causing features to be incorrectly enabled/disabled.

**Fix:**
1. Use `tccutil` (Apple's supported API) instead of raw SQLite querying
2. Or use AVFoundation/`AVCaptureDevice` authorization status for camera/mic (more portable)
3. Add error-tolerant parsing with fallback to `screencapture` test for screen recording
4. Log the TCC schema version and query errors for debugging

---

## Bug #5 — No privacy usage descriptions in Info.plist

**Severity:** HIGH
**File:** `src-tauri/tauri.conf.json` (entire file)
**Root cause:** macOS requires `Info.plist` entries for privacy-sensitive APIs:

| Required Key | Purpose | Present? |
|-------------|---------|----------|
| `NSMicrophoneUsageDescription` | Microphone access via `cpal` | **MISSING** |
| `NSCameraUsageDescription` | Camera access | **MISSING** |
| `NSScreenCaptureUsageDescription` | Screen recording (macOS 14+) | **MISSING** |
| `NSAppleEventsUsageDescription` | `osascript` System Events control | **MISSING** |
| `NSDesktopFolderUsageDescription` | Filesystem access | **MISSING** |

Tauri v2 allows setting these via `tauri.conf.json` under `bundle.macOS.privacyDescriptions` or as raw `Info.plist` properties. Without these, the app may **crash on launch** or **fail silently** when trying to access camera/microphone/screen on macOS. Starting with macOS 14, apps that use these APIs without descriptions are **rejected by notarization**.

**Impact:** Hard crash on macOS when accessing camera/microphone. Notarization rejection for macOS 14+.

**Fix:** Add to `tauri.conf.json`:
```json
"bundle": {
  "macOS": {
    "minimumSystemVersion": "12.0",
    "privacyDescriptions": {
      "NSCameraUsageDescription": "ClickyX needs camera access for capture and analysis",
      "NSMicrophoneUsageDescription": "ClickyX needs microphone access for voice commands and audio features",
      "NSScreenCaptureUsageDescription": "ClickyX needs screen recording for screen context and automation",
      "NSAppleEventsUsageDescription": "ClickyX needs accessibility access to control other applications"
    }
  }
}
```

---

## Bug #6 — `accessibility/macos.rs` silences all osascript errors

**Severity:** MEDIUM
**File:** `src-tauri/src/accessibility/macos.rs:17-28`
**Root cause:**
```rust
fn osascript(script: &str) -> Option<String> {
    let out = Command::new("osascript")
        .args(["-e", script])
        .output()
        .ok()?;
    if out.status.success() {
        // ...
    } else {
        None
    }
}
```

Every failure — permission denied, script syntax error, app not responding — produces `None`. The caller then uses `.unwrap_or()` or `.unwrap_or_default()`. Examples:
- `frontmost_window_bounds()` returns `(0, 0, 800, 600)` on failure (line 56-67)
- `get_element_at_point()` silently falls back to frontmost window (line 170)
- `get_children()` returns empty `Vec` on failure (line 291)
- `perform_action("click")` is silently ignored if both cliclick and osascript fail

**Nowhere is the user warned** that Accessibility permission is needed for these features. The failures are invisible.

**Impact:** Users don't know they need to enable Accessibility permission. All accessibility features silently return stubs or defaults. This is worse than the Linux behavior (which at least returns clear errors on Wayland).

**Fix:** Log warnings when osascript fails, and add a `check_os_permission(Permission::Accessibility)` call:
1. In `osascript()` helper: log warning with stderr on failure
2. In each public method: check Accessibility permission first and return `Err` if not granted
3. Add user-facing guidance messages

---

## Bug #7 — `open -W` for DMG updates is a non-interactive no-op

**Severity:** MEDIUM
**File:** `src-tauri/src/updater.rs:197-199`
**Root cause:**
```rust
std::process::Command::new("open")
    .args(["-W", &path_str])
    .spawn()
    .map_err(|e| format!("failed to open DMG: {e}"))?;
```

`open -W <path>` on a `.dmg` file:
1. Mounts the DMG (opens in Finder)
2. **Immediately returns** `-W` waits for the application to close, not the Finder window
3. User must manually open the mounted volume, drag the app to Applications, then close Finder

This is **not an automatic update**. The user must manually complete the installation. The app never detects when the user has finished. Compare with Sparkle (the standard macOS update framework) which handles:
- DMG download
- Verification (signature + notarization check)
- Automatic mount
- App replacement with relaunch
- Cleanup

**Impact:** macOS updates are manual despite the user seeing a "downloading" progress bar. Users expect the app to update automatically (as Sparkle apps do).

**Fix:**
1. Replace with a proper update mechanism: download `.app` zip, verify signature, replace in `/Applications`, relaunch
2. Or use Tauri's built-in updater plugin (which handles platform-appropriate installs)
3. At minimum: provide clear on-screen instructions for manual DMG installation

---

## Bug #8 — `entitlements.plist` over-broad permissions

**Severity:** MEDIUM
**File:** `src-tauri/entitlements.plist`
**Root cause:**

```xml
<key>com.apple.security.network.server</key><true/>
<key>com.apple.security.automation.apple-events</key><true/>
```

Two problematic entitlements:
1. **`com.apple.security.network.server`** (true): Allows the app to accept incoming network connections. This is not needed for a local-only HTTP bridge on `127.0.0.1` (loopback connections don't require this entitlement). Having this enabled may trigger additional macOS firewall prompts and invites security review scrutiny.
2. **`com.apple.security.automation.apple-events`** (true): Allows controlling **any** application via Apple Events. This is overly broad. The app only needs to control the currently focused application or a specific set. Apple recommends using `com.apple.security.automation.apple-events` with an array of specific bundle identifiers.

Duplicates/overlaps:
- `com.apple.security.device.audio-input` covers microphone (line 7)
- `com.apple.security.device.camera` covers camera (line 8)
- These are correct and necessary for cpal/xcap

**Impact:** The app requests more permissions than needed, which may increase user suspicion during first launch and potentially slow App Store / notarization review.

**Fix:** 
1. Remove `com.apple.security.network.server` (not needed for localhost bridge)
2. Scope `com.apple.security.automation.apple-events` to specific bundle IDs if possible, or use `com.apple.security.automation.apple-events` with `bool` (hard to scope, but acceptable)
3. Add a comment explaining why each entitlement is needed

---

## Bug #9 — `cliclick` dependency is implicit and unverified

**Severity:** LOW
**File:** `src-tauri/src/accessibility/macos.rs:89, 376-380`
**Root cause:**
```rust
if let Ok(out) = Command::new("cliclick").arg("p:.").output() {
```

`cliclick` is a third-party tool that is **not installed by default on macOS**. It must be installed via Homebrew (`brew install cliclick`), MacPorts, or manual download. The app never checks for its presence before calling it.

In `perform_action("click")` (line 376-380):
```rust
if Command::new("cliclick")
    .args([&format!("c:{},{}", cx, cy)])
    .output()
    .map(|o| o.status.success())
    .unwrap_or(false)
{
    return Ok(());
}
// Fallback: AppleScript click at coords
```

The osascript fallback is always slower, and may fail if Accessibility is not granted. The failure of both paths is silently ignored.

**Impact:** The cliclick path is essentially dead code on most macOS systems (unless the user has installed it). Users who install the app on a fresh Mac will always fall through to the slower osascript path.

**Fix:**
1. Document cliclick as recommended dependency in `docs/SETUP.md`
2. Consider shipping a minimal pre-built binary for mouse control, or use only osascript
3. Add a startup check/warning if cliclick is not installed but would improve performance

---

## Bug #10 — `macOSPrivateApi` + `cs.allow-jit` combination increases review friction

**Severity:** LOW
**Files:** `src-tauri/tauri.conf.json:15`, `src-tauri/entitlements.plist:5`, `src-tauri/Cargo.toml:18`
**Root cause:**
```json
// tauri.conf.json
"macOSPrivateApi": true
```
```xml
<!-- entitlements.plist -->
<key>com.apple.security.cs.allow-jit</key><true/>
```
```toml
# Cargo.toml
tauri = { version = "2", features = ["tray-icon", "macos-private-api"] }
```

The `macos-private-api` feature enables private CoreGraphics APIs for transparent, click-through overlay windows. This requires `com.apple.security.cs.allow-jit` **and** `com.apple.security.cs.allow-unsigned-executable-memory` entitlements.

Apple's review guidelines:
- JIT entitlement is designed for JavaScript JIT compilers in web browsers, not for general use
- Apps with `allow-unsigned-executable-memory` get **extra scrutiny** during notarization
- Combination of `macOSPrivateApi` + JIT + unsigned memory may be flagged by automated notarization checks

**Impact:** Potential notarization rejection or manual review delay. If Apple's automated scanning detects private API usage, the app may be rejected outright.

**Fix:** This is a known trade-off for transparent overlay windows on macOS. Document in `docs/PROJECT_SPEC.md`:
1. Why these entitlements are needed (transparent overlay via private CoreGraphics APIs)
2. That notarization may require manual review
3. Alternative: implement overlay using `NSPanel` (level-based) which doesn't need private APIs but has visual limitations

---

## Bug #11 — CI `--bundles app` vs `--bundles dmg,app` inconsistency

**Severity:** LOW
**Files:** `.github/workflows/ci.yml:112`, `.github/workflows/release.yml:51`, `.github/workflows/nightly.yml:56`
**Root cause:**

- **Release CI** (release.yml:51): `--bundles dmg,app` — produces both DMG and .app
- **Nightly CI** (nightly.yml:56): `--bundles app` — produces only .app
- **PR CI** (ci.yml:112): `--bundles dmg,app` — produces both

The nightly workflow skips DMG. But the release upload step still looks for `artifacts/**/*.dmg`:
```yaml
# nightly.yml:120
files: |
  ...
  artifacts/**/*.dmg    # will be empty on macOS nightly
```

This will cause the nightly's `gh release upload` to fail or skip macOS artifacts entirely if no DMG exists.

Also, the CI macOS zip fallback (ci.yml:148-153) creates a `.app.zip` and moves it into the `dmg/` directory. This is fragile:
```bash
cd src-tauri/target/release/bundle/macos 2>/dev/null || true
zip -r ClickyX.app.zip ClickyX.app 2>/dev/null || true
mv ClickyX.app.zip ../dmg/ 2>/dev/null || true
```
If the `macos` directory doesn't exist or `ClickyX.app` doesn't exist, `zip` fails silently and the `dmg/` directory may contain a `.app.zip` that was already there from a previous build.

**Impact:** Nightly builds may not include macOS artifacts due to DMG/zip mismatch. CI zip creation is fragile and may silently fail.

**Fix:**
1. Use `--bundles dmg,app` consistently across all workflows
2. Or use `--bundles app` consistently with `.app.zip` upload
3. Fix nightly upload to handle `.app.zip` if DMG is not produced
4. Add explicit error checking in the zip creation step

---

## Bug #12 — `iconAsTemplate` deprecated on modern macOS

**Severity:** COSMETIC
**File:** `src-tauri/tauri.conf.json:35`
**Root cause:**
```json
"trayIcon": {
  "iconAsTemplate": true,
}
```

`iconAsTemplate` was the legacy way to indicate a monochrome template icon for the macOS menu bar. As of macOS 11+ (Big Sur), Apple's menu bar icons are template images by default, and the `iconAsTemplate` property is deprecated. Modern macOS handles this automatically.

This doesn't cause a runtime error but may produce visual artifacts (icon appearing darker than expected) on macOS 14+.

**Impact:** Cosmetic — tray icon may appear slightly off on modern macOS.

**Fix:** Either remove `iconAsTemplate` (disabling auto-template on older macOS) or keep it (no effect on modern macOS). Document that it's retained for older macOS compatibility.

---

## Bug #13 — Screen Recording check via `screencapture` creates files in `/tmp`

**Severity:** LOW
**File:** `src-tauri/src/permissions.rs:163-177`
**Root cause:**
```rust
fn check_screen_recording() -> bool {
    let tmp = "/tmp/clickyx_cap_test.png";
    let out = Command::new("screencapture")
        .args(["-x", "-t", "png", tmp])
        .output();
```

Three minor issues:
1. **`/tmp/clickyx_cap_test.png`** is a shared, predictable temp file path. If two instances of the app check screen recording simultaneously, they clobber each other's test file.
2. **No cleanup on failure** (line 172 `remove_file` is only called on success). If `screencapture` fails, the old `.png` from a previous run remains.
3. **The test capture might capture something unintended** — it takes an actual screenshot of the user's screen just to check permission.

**Impact:** Minimal — orphaned temp file, potential race condition.

**Fix:**
1. Use `std::env::temp_dir()` (which is per-user) instead of hardcoded `/tmp`
2. Use `NamedTempFile` from `tempfile` crate (already in dev-dependencies)
3. Consider `mktemp`-style approach for unique filenames

---

## Bug #14 — osascript background click is slow and blocking

**Severity:** MEDIUM
**File:** `src-tauri/src/cua.rs:281-303`
**Root cause:**
```rust
// macOS: use osascript to send a click at the coordinates via System Events.
let script = format!(
    "tell application \"System Events\" to click at {{{}, {}}}",
    cx, cy
);
let output = std::process::Command::new("osascript")
    .args(["-e", &script])
    .output()
    .map_err(|e| format!("osascript launch failed: {e}"))?;
```

The osascript click path:
1. Requires **Accessibility permission** — if not granted, the click silently fails
2. Takes **0.5-3 seconds** per call — osascript startup overhead is significant
3. On macOS 14+, repeated osascript calls may trigger **permission re-prompting** each time the app is relaunched
4. No timeout — if System Events is hung, this blocks indefinitely

**Impact:** Background clicks are slow and may fail silently. The `cliclick` alternative (Bug #9) may help but is not installed by default.

**Fix:**
1. Add a `check_os_permission(Permission::Accessibility)` check before attempting the click
2. Add a 2-second timeout to the osascript command
3. Use `CGEventCreate` / `CGEventPost` via Core Graphics if Rust FFI is acceptable (fastest, but requires reversing the no-Foundation policy)
4. At minimum: log warnings and return clear errors when Accessibility permission is not granted

---

## Bug #15 — No check for Apple Silicon vs Intel architecture differences

**Severity:** LOW
**Files:** `.github/workflows/ci.yml`, `src-tauri/src/updater.rs`
**Root cause:** The CI builds on `macos-latest` (which is currently macOS 14/15 on Apple Silicon). The updater returns the arch as `current_platform_key()`:
```rust
let arch = if cfg!(target_arch = "aarch64") {
    "aarch64"
} else if cfg!(target_arch = "x86_64") {
    "x86_64"
} else {
    "x86"
};
```

This is correct for runtime, but:
1. `macos-latest` GitHub runner is **Apple Silicon** — the CI only builds ARM64 binaries
2. Intel Mac users get no updates because the release only contains `darwin-aarch64` assets
3. There's no CI job to build for `x86_64-apple-darwin`
4. The update server URL scheme at `releases.clickyx.app/<platform>/<version>` assumes a single platform per architecture — there's no universal binary or multi-arch support

**Impact:** Intel Mac users cannot run ClickyX (or get incorrect/broken updates) if only Apple Silicon builds are produced.

**Fix:** Either:
1. Add a second macOS build with `--target x86_64-apple-darwin` in CI
2. Produce a universal binary using `lipo` after building both architectures
3. Or document that ClickyX requires Apple Silicon

---

## Bug #16 — `request_os_permission` uses `x-apple.systempreferences:` URLs that change per macOS version

**Severity:** LOW
**File:** `src-tauri/src/permissions.rs:182-198`
**Root cause:**
```rust
let url = match perm {
    Permission::Microphone =>
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    Permission::ScreenRecording =>
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    Permission::Notifications =>
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Notifications",
    Permission::Camera =>
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
    Permission::Accessibility =>
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
};
```

Apple System Preferences URL schemes change with every macOS version:
- **macOS 12 Monterey**: `x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone` — works
- **macOS 13 Ventura**: System Settings was rewritten (SwiftUI); URLs changed to `x-apple.systempreferences:com.apple.settings.PrivacySecurity.Protected` or similar
- **macOS 14 Sonoma**: URLs changed again to `x-apple.system-settings:...`
- **macOS 15 Sequoia**: URLs may have changed again

The macOS 14+ URL for microphone is now:
`x-apple.system-settings:com.apple.settings.PrivacySecurity.Protected?Microphone`
(speculative, exact URL requires testing)

**Impact:** On macOS 14+, `open -W URL` opens System Settings but **does not navigate to the correct pane**. Users see the wrong screen or the default Security overview, requiring them to manually navigate. This is a frustrating UX issue.

**Fix:**
1. Check `sw_vers -productVersion` at runtime and construct the appropriate URL per macOS version
2. Or open System Settings to the general Security pane (which always works) with a descriptive message
3. Or use `tccutil` reset/request pattern

---

## Bug #17 — No sanitization of AppleScript strings in osascript calls

**Severity:** MEDIUM
**File:** `src-tauri/src/accessibility/macos.rs`, `src-tauri/src/cua.rs`
**Root cause:** Multiple osascript calls embed app names or other user-provided strings directly into AppleScript without escaping:
```rust
// macos.rs:134-137
let script = format!(
    "tell application \"System Events\" to tell application process \"{}\" \
     to return {{name of front window, position of front window, size of front window}}",
    app
);
```
```rust
// macos.rs:262-263
let script = format!(
    "tell application \"System Events\" to return name of every menu item of menu bar 1 of \
     application process \"{}\"",
    element.name
);
```
```rust
// macos.rs:368
let script = format!("tell application \"{}\" to activate", app_name);
```

If an app name contains a double-quote character (e.g., `App"Name` from a corner case or malicious software), the AppleScript will **fail to compile** or **execute arbitrary AppleScript commands** (injection).

Similarly, in `cua.rs:287-289`, the coordinates are integers so injection is not possible there.

**Impact:** Low probability (app names rarely contain `"`), but if triggered it's a script injection vulnerability. At minimum, `osascript` returns a non-zero exit code and the operation silently fails.

**Fix:** Escape double quotes in all strings embedded in AppleScript:
```rust
fn escape_applescript(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}
```

Apply to all `format!(...)` calls that produce osascript commands.

---

## Summary

| # | Severity | Subsystem | Issue |
|---|----------|-----------|-------|
| 1 | **HIGH** | `notarize-macos.sh` | Exits 0 on failure; missing TEAM_ID in CI |
| 2 | **HIGH** | `sign-macos.sh` | Deprecated `--deep`; missing `--timestamp` |
| 3 | MEDIUM | `permissions.rs` | `screencapture -x` flag removed in macOS 14 |
| 4 | MEDIUM | `permissions.rs` | TCC DB query fragile across macOS versions |
| 5 | **HIGH** | `tauri.conf.json` | No privacy usage descriptions in Info.plist |
| 6 | MEDIUM | `accessibility/macos.rs` | All osascript errors silently swallowed |
| 7 | MEDIUM | `updater.rs` | `open -W` DMG update is manual, not automatic |
| 8 | MEDIUM | `entitlements.plist` | Over-broad network.server + automation |
| 9 | LOW | `accessibility/macos.rs` | `cliclick` not installed by default |
| 10 | LOW | `entitlements.plist` | macosPrivateApi + JIT = review friction |
| 11 | LOW | CI workflows | `--bundles` inconsistency; fragile zip fallback |
| 12 | COSMETIC | `tauri.conf.json` | `iconAsTemplate` deprecated on modern macOS |
| 13 | LOW | `permissions.rs` | `/tmp` file path shared; no cleanup on failure |
| 14 | MEDIUM | `cua.rs` | osascript click slow, blocking, no permission check |
| 15 | LOW | CI + updater | No Intel Mac (x86_64) build in CI |
| 16 | LOW | `permissions.rs` | System Settings URLs change per macOS version |
| 17 | MEDIUM | `accessibility/macos.rs` + `cua.rs` | No AppleScript string escaping — injection risk |

## Key Takeaways

1. **Notarization pipeline is broken (Bugs #1, #2):** The notarization script always exits 0, missing TEAM_ID, and uses deprecated `codesign --deep`. The macOS app will likely ship without a valid notarization ticket, triggering Gatekeeper warnings for all users.

2. **Missing Info.plist privacy descriptions (Bug #5):** macOS 14+ requires `NSMicrophoneUsageDescription`, `NSCameraUsageDescription`, `NSScreenCaptureUsageDescription`, and `NSAppleEventsUsageDescription`. Without them, the app may crash on launch or be rejected by notarization.

3. **macOS 14+ Sonoma compatibility (Bugs #3, #4, #16):** The `screencapture -x` flag (removed), TCC DB schema changes, and System Settings URL changes all mean the permission system is partially broken on the latest macOS.

4. **Accessibility/osascript fragility (Bugs #6, #14, #17):** All macOS accessibility features depend on osascript, which is slow, error-prone, and has potential injection vulnerabilities. There's no alternative backend (unlike Linux which has xdotool/ydotool fallbacks).

5. **Update mechanism is manual (Bug #7):** Unlike Sparkle-based apps, ClickyX downloads a DMG and expects the user to manually drag to Applications. This should use Tauri's built-in updater or a custom .app-in-zip replacement.

6. **No Intel Mac support (Bug #15):** CI only builds for ARM64. Intel Mac users cannot run the app.

**Most impactful single fix:** Fix the notarization pipeline (Bugs #1, #2) and add privacy descriptions (Bug #5). Without these, the app cannot ship to macOS users at all.
