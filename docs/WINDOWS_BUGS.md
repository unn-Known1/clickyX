# Windows Build Bug Report

> All findings from static analysis of commit `e2fa9c2`

---

## CRITICAL

### 1. Silent Crashes: `panic = "abort"` + `windows_subsystem = "windows"`

| **File** | `Cargo.toml:60`, `main.rs:2` |
|----------|-----------------------------|
| **Root cause** | `src-tauri/Cargo.toml` sets `panic = "abort"` in release profile. `src-tauri/src/main.rs` sets `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`. Combined: on Windows release builds, any Rust panic terminates the process silently — no console, no crash dialog, no log output if logging isn't initialized yet. |
| **Impact** | Every unhandled `unwrap()`, `.expect()`, or `panic!()` causes a silent disappearance of the app. The user sees nothing. |
| **Fix** | (a) Remove `panic = "abort"` or set to `unwind`; OR (b) install a `std::panic::set_hook` that writes a crash dump / shows a `MessageBoxW` before aborting. |

**All `expect()`/`unwrap()` call sites that can fire before logging exists:**

| Call site | File | Line |
|-----------|------|------|
| `dirs::config_dir().expect("could not find config directory")` | `config.rs` | 269 |
| `dirs::data_dir().expect(...)` (via AppConfig paths) | `config.rs` | multiple |
| `.build().expect("error while building ClickyX")` | `lib.rs` | 461 |
| `app.default_window_icon().ok_or("no default window icon")?.clone()` | `tray.rs` | 22 |

---

### 2. `xcap` + `cpal` + `enigo` — 3 Native Crates with Windows-Specific UB

These three crates form the backbone of screen capture, audio, and input. Each has severe Windows-specific failure modes.

| Crate | Version | Windows Dependency | Failure mode |
|-------|---------|-------------------|--------------|
| `xcap` | 0.4 | DXGI / D3D | Silent crash if DWM disabled, RDP session, or VM without GPU |
| `cpal` | 0.15 | WASAPI | Stream constructor can panic; `!Send` stream wrapped with `unsafe impl Send` ([`audio/capture.rs:42`](src-tauri/src/audio/capture.rs)) is undefined behavior on Windows |
| `enigo` | 0.2 | COM (SendInput) | Requires COM initialized on calling thread — will fail silently otherwise |

**`cpal` `!Send` UB detail:**
```rust
// audio/capture.rs:4-11
struct StreamWrapper(Option<cpal::Stream>);  // cpal::Stream is !Send on Windows

// Safety comment claims stream is paused before drop/move across threads,
// but nothing in the AudioPipeline proves this invariant holds for all paths.
unsafe impl Send for StreamWrapper {}
```
The `StreamWrapper` wraps `Option<cpal::Stream>` in a `Mutex` in `AudioPipeline` (`pipeline.rs:44`). On the surface this is safe because the `Mutex` serializes access, but `unsafe impl Send` is still required because `Mutex<StreamWrapper>` itself would be `!Send` on Windows. The real risk: if `StreamWrapper` is moved to a different thread (e.g., during `stop_recording` → `stream.take()` → drop), the `cpal::Stream` destructor runs on that thread, but the stream was *built* on the audio thread. On Windows WASAPI, the stream's COM objects are bound to the apartment of the creating thread. Destroying them from a different thread is UB.

**`enigo` may need COM initialization on Windows:**
`cua.rs` calls `Enigo::new(&Settings::default())` on any thread. On Windows, `enigo` 0.2 internally calls Win32 `SendInput` for mouse/keyboard simulation. Under certain Windows configurations (especially when called from worker threads rather than the main UI thread), `SendInput` can silently fail depending on the calling thread's COM apartment state. The code never calls `CoInitializeEx`. Additionally, `enigo` 0.2's `Enigo::new()` can return `Err` if keyboard layout initialization fails — this error is caught and logged, but the caller gets a silent no-op instead of input.

---

### 3. Overlay Window: `tauri.conf.json` "overlay" vs Per-Screen "overlay-N" Windows

| **File** | `tauri.conf.json:12-21`, `overlay/window_manager.rs`, `overlay/mod.rs` |
|----------|-----------------------------------------|
| **Root cause** | `tauri.conf.json` declares a window with label `"overlay"` that loads `/src/overlay/index.html` at app startup. Separately, `window_manager.rs:create_per_screen_windows` creates windows with labels `"overlay-0"`, `"overlay-1"`, etc. Functions in `mod.rs` access both: `show_overlay`/`hide_overlay` use `app.get_webview_window("overlay")`, while `show_cursor`, `show_rect`, etc. use `app.get_webview_window("overlay-N")`. |
| **Impact** | **On Windows**, the tauri.conf.json "overlay" window consumes a WebView2 process that is **never used** by any overlay feature function. The per-screen "overlay-N" windows are the ones actually used. The "overlay" window wastes ~80-120 MB of WebView2 process memory on Windows. The `show_overlay`/`hide_overlay` functions toggle a window that nobody sees. |

---

### 4. Hotplug Poll Loop Creates New WindowManager Each Time

| **File** | `overlay/mod.rs:384-420` |
|----------|--------------------------|
| **Root cause** | `start_hotplug_poll` creates a *new* `OverlayWindowManager<R>` inside the `if` block (line 410) every time monitors change, discarding the old one. But `OverlayWindowManager` windows persist in Tauri's global window registry (dropping the Rust `WebviewWindow` handle does **not** close the native window — only `.close()` does). So on the 2nd display change, `refresh_windows` calls `WebviewWindowBuilder::build()` with labels that already exist → **fails** with "window label already in use". The error is logged but the event `display-config-changed` is suppressed. Old windows stay in their original positions/sizes, never updated for the new display layout. |
| **Impact** | After the first display configuration change (e.g., plugging in an external monitor, changing resolution), overlay windows are frozen in their original positions. New monitors don't get overlay windows. Removed monitors' overlays aren't cleaned up. On Windows, this means partial or misplaced overlay rendering. |
| **Fix** | Move `OverlayWindowManager` outside the loop (persist via `Arc<Mutex<>>`). Only call `refresh_windows` inside. Never discard and recreate. |

---

### 5. actix-web Bridge on Its Own tokio Runtime

| **File** | `bridge.rs:1254-1255` |
|----------|------------------|
| **Root cause** | The HTTP bridge starts its own `actix_rt::System` inside a `std::thread::spawn`. This creates a new tokio runtime with its own IOCP (I/O Completion Port) on Windows. Tauri already has a tokio runtime. Two runtimes on Windows sharing the same process can conflict on the I/O completion port backend. |
| **Impact** | Intermittent hangs in HTTP server, delayed responses, or complete I/O stall. Hard to reproduce but real on Windows with high I/O load. |
| **Fix** | Use Tauri's existing tokio runtime for the HTTP server instead of creating a new one, or ensure the bridge thread doesn't share I/O handles with the main runtime. |

---

## HIGH

### 6. PowerShell Dependency Everywhere (3+ Modules)

| **File** | **Dependency** |
|----------|---------------|
| `accessibility/windows.rs` | Whole module is PowerShell-based |
| `permissions.rs:286` | `Command::new("powershell")` for mic/camera/notifications registry checks |
| `cua.rs:210` | `Command::new("powershell")` for background clicks |
| `cua.rs:177` | `Command::new("powershell")` for FindWindow pinvoke |

**Problems:**
- `powershell.exe` may not be in `%PATH%` on minimal Windows installations (Windows Server Core, Nano Server, LTSC)
- Execution policy (`Set-ExecutionPolicy`) can block PowerShell scripts
- `Add-Type` compilation in `accessibility/windows.rs` requires .NET Framework full profile; fails on .NET Core / .NET 5+
- Each subprocess spawn is **slow** (~100-500ms per invocation) — the `get_cursor_position` fallback blocks for this long

---

### 7. Permission Module Relies on PowerShell for OS Consent Checks

| **File** | `permissions.rs:217-276` |
|----------|--------------------------|
| **Root cause** | `check_os_permission` on Windows is **not** empty — it queries the Windows Capability Access Manager registry via **PowerShell** for microphone, camera, and notifications. ScreenRecording and Accessibility always return `true` (by design — desktop apps can use DXGI/UIA without explicit permission gates). The real issue: if PowerShell fails (execution policy, missing binary), all consent checks fall back to `"Allow"` (regardless of actual setting). |
| **Impact** | Microphone privacy blocked in Windows Settings → PowerShell query fails → permission reports allowed → `cpal` fails at stream creation with a confusing error. The user sees a capture failure instead of a permission prompt. |
| **✅ Partial fix (2026-06-06)** | `request_os_permission` now uses `powershell -WindowStyle Hidden -NonInteractive -NoProfile -Command Start-Process` with the `CREATE_NO_WINDOW` Win32 flag instead of `cmd /C start`. This eliminates the blank CMD terminal windows that flashed on screen when clicking "Grant Permission". The underlying PowerShell dependency for _checking_ permission status remains; see action item #5 below for the full Win32 replacement. |

---

### 8. Tauri Updater Plugin with Empty Configuration

| **File** | `tauri.conf.json:84-87`, `lib.rs:159` |
|----------|---------------------------------------|
| **Code** | `"updater": { "endpoints": [], "pubkey": "" }` + `.plugin(tauri_plugin_updater::Builder::new().build())` |
| **Root cause** | The updater plugin is registered with empty endpoints. **This does not cause a crash** — the plugin silently skips update checks when endpoints is empty. However, the custom `check_for_updates` in `updater.rs` uses a hardcoded URL (`https://releases.clickyx.app/...`) not the configured endpoints, meaning the tauri.conf.json updater config is unused dead config. |
| **Impact** | Dead config (no crash risk). Minor: if someone configures non-empty endpoints, the **built-in** plugin and the **custom** `check_for_updates` will both try to check for updates independently. |
| **Fix** | Either use the Tauri updater plugin (remove custom `check_for_updates`) or remove the plugin and keep only the custom code. Don't keep both. |

---

### 9. Hotkeys Skipped on Windows — No PTT

| **File** | `lib.rs:174-175` |
|----------|------------------|
| **Code** | `#[cfg(not(target_os = "windows"))] register_hotkeys(&handle)?;` |
| **Reason (comment)** | "the Windows backend can crash the release app on invalid persisted shortcuts" |
| **Impact** | Push-to-Talk (PTT) hotkey is completely disabled on Windows. A core feature of the app (voice agent trigger) doesn't work. |
| **✅ Fixed (v0.1.3)** | Hotkey registration is now unconditional on all platforms. Per-binding error logging (`log::warn`) prevents a single bad shortcut from blocking startup. Invalid persisted hotkeys are now skipped with a warning instead of crashing. |
| **Fix** | Implement proper error handling and key validation instead of disabling the feature entirely. |

---

### 10. type_mode.rs — Enigo Keyboard Simulation May Fail on Windows

| **File** | `type_mode.rs:107-121` |
|----------|------------------------|
| **Root cause** | `type_mode.rs` uses `enigo` for keyboard simulation (`type_text` at line 107, `key_press` at line 115). On Windows, `Enigo::text()` uses `SendInput` which can silently fail depending on the calling thread's state (see bug #2 enigo note). The double-tap Ctrl **detection** is done via frontend JavaScript keyboard events + Tauri command `activate_type_mode` (reliable on all platforms) — the bug is only in the keyboard output path. |
| **Impact** | When type mode is active and the user types, `Enigo::text()` and `Enigo::key()` may silently produce no output on certain Windows configurations. Characters are not typed. |
| **Fix** | Ensure Windows threading invariants are met before calling enigo (same as bug #2). |

---

## MEDIUM

### 11. WebView2 Version Not Pinned

| **File** | `tauri.conf.json` (implicit) |
|----------|------------------------------|
| **Root cause** | Tauri v2 on Windows requires WebView2 runtime. The config does not pin a minimum WebView2 version. If the user's WebView2 is outdated, overlay transparency, HMR, or certain DOM APIs may not work. There is no `minimumWebView2Version` specified. |

---

### 12. NSIS Installer Has No `installerIcon`

| **File** | `tauri.conf.json:66-68` |
|----------|--------------------------|
| **Code** | `"nsis": { "installMode": "currentUser" }` |
| **Root cause** | Only `installMode` is configured. Missing: `installerIcon`, `displayIcon`, `languages`, `headerImage`, `welcomeImage`, no MSI/WiX alternative. |
| **Impact** | Installer has a default icon, non-localized, and no branding. Not a crash bug but poor UX. |

---

### 13. CI/CD — No Windows Pre-Build System Dependency Step

| **File** | `.github/workflows/ci.yml` |
|----------|-----------------------------|
| **Root cause** | The "Install system deps (Linux)" step is correctly `if: matrix.os == 'ubuntu-latest'`. But there is no Windows step to install WebView2 (it _happens_ to be pre-installed on `windows-latest` GitHub runner). If the runner image changes, the build could fail. Should pin WebView2 or at least verify. |

---

### 14. Release Profile = `opt-level 3` May Mask UB

| **File** | `Cargo.toml:58` |
|----------|-----------------|
| **Code** | `opt-level = 3` in release |
| **Impact** | High optimization can mask UB from `unsafe impl Send` on `cpal::Stream` (bug #2). The UB may only manifest on certain Windows configurations with specific compiler flags. |

---

### 15. Build Script (`build.rs`) — No Windows Resource File

| **File** | `src-tauri/build.rs` |
|----------|-----------------------|
| **Code** | `fn main() { tauri_build::build() }` |
| **Root cause** | No `.rc` resource file for embedding version info, file description, icon, or manifest. Tauri's own build script may handle the icon, but there's no explicit `.rs` resource definition. Windows expects proper VERSIONINFO resources for `FileVersionInfo` lookups. |
| **Impact** | Right-click → Properties → Details shows no version info. Also, missing requestedExecutionLevel in manifest (might be handled by Tauri's bundler but not explicit). |

---

## SUMMARY TABLE

| # | Severity | Bug | Module | Root Cause |
|---|----------|-----|--------|-----------|
| 1 | **CRITICAL** | Silent crash on panic | Global | `panic = "abort"` + `windows_subsystem` |
| 2 | **CRITICAL** | `cpal::Stream` UB on Windows | Audio | `unsafe impl Send` on `!Send` stream |
| 3 | **CRITICAL** | Overlay window duplication | Overlay | `tauri.conf.json` hardcodes overlay; runtime creates per-screen windows |
| 4 | **CRITICAL** | Window manager leak in hotplug loop | Overlay | `OverlayWindowManager` created per iteration, not persistent |
| 5 | **CRITICAL** | Dual tokio runtimes | Bridge | `actix_rt::System` conflicts with Tauri's runtime |
| 6 | **HIGH** | PowerShell everywhere | Acc/Perm/CUA | 5+ modules depend on PowerShell |
| 7 | **HIGH** | Permissions use PowerShell for OS consent | Permissions | `check_windows_capability` calls PowerShell; fails silently |
| 8 | **LOW** | Updater plugin config unused | Config | Empty endpoints + custom `check_for_updates` with hardcoded URL |
| 9 | **HIGH** | PTT hotkey disabled on Windows | lib.rs | `cfg(not(windows))` guard on hotkeys |
| 10 | **HIGH** | enigo keyboard sim may fail on Windows | type_mode | `Enigo::text()`/`key()` can silently fail on worker threads |
| 11 | **MEDIUM** | WebView2 version not pinned | Config | Missing minimumWebView2Version |
| 12 | **MEDIUM** | NSIS config minimal | Config | Missing installer icon, languages, branding |
| 13 | **MEDIUM** | CI lacks WebView2 verification | CI | No Windows build-dependency check |
| 14 | **LOW** | High opt-level masks UB | Build | `opt-level = 3` may mask `unsafe impl Send` UB |
| 15 | **LOW** | No Windows version resource | Build | No `.rc` file for VERSIONINFO |

---

## IMMEDIATE ACTION ITEMS

1. **Remove `panic = "abort"`** from `Cargo.toml` release profile. Install `std::panic::set_hook` in `main.rs` that writes a minidump or displays a `MessageBoxW`.
2. **Fix `cpal::Stream` Send**: Use a proper wrapper that ensures the stream stays on one thread, or use `thread_local!` for the stream handle.
3. **Fix `enigo` COM init**: Call `CoInitializeEx` in a Drop-guarded wrapper before using `enigo` in any Windows thread.
4. **Make overlay window manager persistent**: Move it out of the hotplug loop into shared state.
5. **Replace PowerShell in permission checks**: Use Win32 API directly (via `windows-rs` crate) instead of spawning `powershell.exe` to query the Capability Access Manager registry. The registry keys at `HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\` can be read directly.
6. **Add Win32 resource file**: Embed VERSIONINFO and icon via `.rc` file.
7. **Decide on update strategy**: Either use the Tauri updater plugin (configure real endpoints) or remove it and keep only the custom `check_for_updates`. Don't keep both.
8. **Replace PowerShell calls**: Use Win32 API (via `windows-rs` crate) for accessibility, permissions, and cursor position on Windows.
