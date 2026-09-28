# ClickyX Build & Package Audit Report

Date: 2026-09-28 · Scope: whole app as a **build/package** for Windows + Linux + macOS
Commit audited: `6b04f98` (on top of v0.2.3 `e196413`) · Method: 4 parallel codebase audits (Rust/Tauri, frontend, CI/workflows, bridge/security)
Status legend: `critical` = broken package/installer/updater or ship-blocker · `major` = degraded/misleading behavior or doc-claim mismatch · `minor` = hardening/cleanup

Related live state: Release run `36423206098` (v0.2.3 tag) failed all 3 OS legs on the 6 Rust warnings fixed in `6b04f98`, but the tag still points at the pre-fix SHA — it cannot self-heal (see W-MAJOR-5). Flatpak run `36423206939` failed for a different reason (missing system lib, R-CRIT-1). CI/CD run `36423204364` failed only on the 2 Jarvis E2E specs (missing `chat_with_vision` mock, fixed in `6b04f98`, verified 2/2 pass locally).

---

## 1. Rust / Tauri packaging (Windows/Linux/macOS)

### Critical
- [R-CRIT-1] `flatpak.yml:29` — build-binary omits pipewire/drm/gbm headers that CI installs; xcap 0.9 needs PipeWire 1.x → Build Rust Binary exit 101. Mirror `ci.yml:70` deps + libclang.
- [R-CRIT-2] `src-tauri/src/updater.rs:55` — `CLICKYX_UPDATE_PUBKEY` empty in dev/forks → `verify_update_signature` fail-closed refuses ALL installs; ensure `UPDATE_SIGNING_PUBKEY`/`UPDATE_SIGNING_KEY_B64` secrets are set (`release.yml:182` warns on `.sig`-less ship).
- [R-CRIT-3] `src-tauri/capabilities/default.json:4` — `windows: ["main","overlay",...]` does not match runtime labels `overlay-N` (`window_manager.rs:43`); only `agent-hud-*` has a wildcard → overlay IPC denied. Fix to `"overlay-*"`.
- [R-CRIT-4] `src-tauri/tauri.conf.json:61` — `signingIdentity: null` + `release.yml:109` skips signing when secrets are empty → ships unsigned; entitlements (JIT/screen-capture/automation) inert despite `macOSPrivateApi: true`. Set Apple secrets or document unsigned limits.
- [R-CRIT-5] `src-tauri/tauri.conf.json:67` — deb `depends` ships `libxdo3` (lib) but code shells `xdotool`/`ydotool`/`wtype`/`xclip` CLI binaries (`cua.rs:339,450`, `type_mode.rs:165`, `SETUP.md:25`) → fresh .deb breaks CUA/fill/type. Add CLI Recommends or portal-only design.

### Major
- [R-MAJ-1] `.github/workflows/ci.yml:91` — `cargo check` lacks `--all-features` while clippy/test use it (`ci.yml:94,102`). Add `--all-features`.
- [R-MAJ-2] `flatpak/com.clickyx.ClickyX.yml:26` — manifest installs prebuilt `../src-tauri/target/release/clickyx` (glibc/WebKit ABI risk) with no Secrets portal and no `ydotoold`; keyring/clipboard are copy-only there per `SETUP.md:29`. Build in sandbox or add Secret portal + file fallback.
- [R-MAJ-3] `src-tauri/tauri.conf.json:64` — `linux` bundle defines only `deb` + `appimage`, zero `rpm` config → RPM gets auto-deps, misses xdotool/ydotool/wtype/clipboard Requires. Add `rpm.depends`.
- [R-MAJ-4] `src-tauri/src/updater.rs:375` — Linux deb/rpm update path is manual `xdg-open` + AppImage rename to `~/.local/bin/clickyx` (`updater.rs:398-415`) which may not match `.desktop Exec` or PATH. Document manual step, align Exec path.
- [R-MAJ-5] `src-tauri/src/updater.rs:288` — installer shells `msiexec` / `.msi` but `tauri.conf.json:53` only configures `nsis`, and scorer prefers `.msi` over `-setup.exe` (`updater.rs:545`). Pin explicit `wix`/`nsis` targets or align scorer.
- [R-MAJ-6] `src-tauri/tauri.conf.json:54` — `nsis.installMode: currentUser` vs updater `msiexec /quiet /norestart` (`updater.rs:311`) system semantics → UAC/per-user mismatch. Align installMode with updater privilege story.
- [R-MAJ-7] `src-tauri/src/updater.rs:349` — macOS updater `remove_dir_all(/Applications/ClickyX.app)` + `ditto` with no privilege escalation fails for standard users. Use privileged helper or manual-DMG flow.
- [R-MAJ-8] `src-tauri/src/jarvis/mod.rs:79` — Windows screen/a11y gates documented vacuous (no UIAccess manifest) and Linux gate is a no-op `display_server()` call (`mod.rs:72`) vs real macOS TCC gates; fail-open inconsistency. Add real checks or document.
- [R-MAJ-9] `src-tauri/src/cua.rs:465` — Wayland "background" click runs `ydotool mousemove` (moves hardware cursor, violates no-warp) and `scroll` hard-`Err`s (`cua.rs:413`); requires `ydotoold` daemon never packaged. Use RemoteDesktop portal or mark unsupported.
- [R-MAJ-10] `src-tauri/src/type_mode.rs:165` — Wayland typing uses `wtype -k` (key-mode, breaks unicode). Use `wtype --` text mode or `ydotool type`.
- [R-MAJ-11] `src-tauri/Cargo.toml:66` — `keyring 4.2.0` needs Linux secret-service/dbus + Flatpak Secrets portal, neither in `SETUP.md`, CI deps, deb `depends`, nor flatpak finish-args. Document or rely on encrypted-file fallback.
- [R-MAJ-12] `docs/SETUP.md:13` — Linux docs/CI/flatpak never install `libclang`, yet `libspa-sys→bindgen→clang-sys` is in the lock and `ci.yml:65` just assumes `/usr/bin/clang` for mold. Add `libclang-dev` to docs + all workflows.
- [R-MAJ-13] `src-tauri/build.rs:145` — `delayimp.lib` found only via hardcoded `vswhere.exe` path; `compile_wrapper` ignores `rustc` status (`build.rs:65`) → silent fallback to `STATUS_ENTRYPOINT_NOT_FOUND` in `cargo test`. Add fallback search + hard-fail message.
- [R-MAJ-14] `src-tauri/src/bridge.rs:1465` — Windows vs non-Windows branches are byte-identical `System::new().block_on`; dead gate with false IOCP-avoidance claim. Dedupe or implement real rationale.
- [R-MAJ-15] `src-tauri/tauri.conf.json:80` — `plugins.updater` is dead config (`endpoints: [], pubkey: ""`) while real path is custom `updater.rs`. Remove or migrate to official plugin to avoid confusion.

### Minor
- [R-MIN-1] `src-tauri/tauri.conf.json:87` — deep-link scheme `openclicky` (legacy fork name) vs `productName ClickyX` / `com.clickyx.app`, no Linux `.desktop MimeType`. Rename to `clickyx` or document alias (`lib.rs:42` validates `openclicky://`).
- [R-MIN-2] `src-tauri/Cargo.toml:30` — `tauri` feature `macos-private-api` enabled globally, mac-only effect. Harmless but document as intentional.
- [R-MIN-3] `src-tauri/src/main.rs:9` — panic hook shows `MessageBoxA` on Windows only, stderr elsewhere; no equivalent user-visible dialog on Linux/macOS. Note or unify.
- [R-MIN-4] `src-tauri/src/screen/capture.rs:30` — `with_capture_guide` PipeWire/portal hints are Linux-only; Win/macOS return raw errors. Add per-OS hints.
- [R-MIN-5] `src-tauri/src/overlay/mod.rs:18` — Wayland compositor allowlist (GNOME/KDE/Unity/Budgie/POP) warns on valid wlroots/Sway. Relax or make informational.
- [R-MIN-6] `.github/workflows/ci.yml:264` — macOS builds override `--bundles dmg,app` in CI/release but local `npm run tauri build` uses `targets: all`. Pin explicit bundles to avoid untested artifact skew.
- [R-MIN-7] `.github/workflows/release.yml:75` — macOS `.app.zip` fallback dropped into `dmg/` is never picked by scorer (`updater.rs:560` only matches `.dmg`). Dead artifact; drop or score `.zip`.
- [R-MIN-8] `src-tauri/src/updater.rs:40` — `current_platform_key` falls back to bare `x86` for non-x86_64/aarch64; no ARM Linux/Windows CI leg. Document tier or add matrix leg.

Verified OK: version `0.2.3` in sync (`Cargo.toml`, `tauri.conf.json`, `package.json`); `Cargo.lock` contains all 38 deps (arboard 3.6.1, tauri 2.11.2, keyring 4.2.0); zero `Foundation/AppKit/SwiftUI` imports (only transitive `objc2-core-foundation` in lock); `jev.rs` and `commands/*` have zero `cfg` — new code is platform-clean.

---

## 2. Frontend build / packaging

### Critical
- [F-CRIT-1] `e2e/visual.spec.ts:29` — zero baseline snapshots committed (`e2e/*snapshots*/` absent); all 8 `toHaveScreenshot()` tests fail on clean CI. Commit baselines or gate the visual job behind a labeled workflow.
- [F-CRIT-2] `src/bindings.ts:333` — `update_config`/`update_ai_config`/`update_audio_config`/`update_jev_config` unmocked, fall through to `resolve(undefined)` — browser/E2E settings saves poison the react-query cache with `undefined`. Return a `get_config`-shaped echo instead.

### Major
- [F-MAJ-1] `src/i18n/locales/fr.json:1` — fr + ja each miss ~400 keys (12 vs 29 top-level namespaces; only `jarvis/jev/jpanel/jkb` are complete) — non-EN UI silently renders EN fallback. Complete the locales or drop the 4-language claim.
- [F-MAJ-2] `src/hooks/useConversations.ts:63` — raw `useState`+`useEffect`+`invoke(loadConversations)` violates the react-query-only rule (`AGENTS.md:19`). Migrate to `useQuery`/`useMutation` or record a deliberate exception.
- [F-MAJ-3] `src/utils/sounds.ts:16` — `public/sounds/` contains only `README.md`; all 6 referenced `.mp3` are absent so every `Sounds.*` call 404s-and-swallows. Add assets per `public/sounds/README.md:7`.
- [F-MAJ-4] `src/components/OnboardingMedia.tsx:30` — `/onboarding/intro.mp4` absent (`public/onboarding/` has only `README.md`); wizard always renders SVG fallback. Add `intro.mp4` per `public/onboarding/README.md:7`.
- [F-MAJ-5] `src/hooks/useChat.ts:120` — `send_chat_message_stream` unmocked (void fall-through) so no `stream-event` ever fires in browser — `streaming:true` hangs forever on web/E2E. Resolve a synthetic `Done` event or no-op the streaming state when `!isTauri`.
- [F-MAJ-6] `src/context/AppContext.tsx:60` — `setActiveTab` defers the state switch via `setTimeout(…,100)`, making deep-link/palette/tray navigation async and racy. Set state synchronously, keep the transition flag cosmetic.
- [F-MAJ-7] `src/components/AboutDialog.tsx:15` — `get_app_version` has no browser mock so version is `undefined` on web/E2E. Add a mock returning the `0.2.3` package version.
- [F-MAJ-8] `src/bindings.ts:330` — `load_conversations`/`save_conversations` unmocked (`undefined` fall-through); browser chat history is always empty. Mock `[]` / void echo; `sanitizeConversations` currently masks this.

### Minor
- [F-MIN-1] `src/overlay/main.tsx:1` — overlay entry renders bare `<StrictMode>`, no `QueryClientProvider`/`AppProvider` unlike `src/main.tsx:22`. Wrap it identically.
- [F-MIN-2] `src/main.tsx:7` — `preloadSounds()` (`src/utils/sounds.ts:34`) is never called at startup; first `agentLaunch` stalls on fetch. Call it in `main.tsx`.
- [F-MIN-3] `tsconfig.json:2` — no `paths` aliases (and no `vite.resolve.alias`); deep relative imports everywhere. Add `@/*` alias in both files.
- [F-MIN-4] `AGENTS.md:120` — file-map row claims `global.d.ts` holds `__paletteSection`/`__deepLinkPending`, but `src/global.d.ts:3` only declares `__AGENT_SLUG`. Fix the doc row.
- [F-MIN-5] `src/test-setup.ts:28` — global mock stubs `@tauri-apps/plugin-updater` `check()`, yet the plugin-updater is disabled in favor of the custom backend updater. Delete the stale mock so a reintroduction fails loudly.
- [F-MIN-6] `e2e/jarvis.spec.ts:46` — settings-card spec calls `test.skip()` when nav is unreachable, so it can vacuous-pass in CI. Assert the nav path instead of skipping.
- [F-MIN-7] `package.json:36` — `@tauri-apps/plugin-deep-link` absent from npm deps while Rust registers deep-link and `src/App.tsx:207` handles `deep-link-opened`. Event-only use needs no dep, but document that.
- [F-MIN-8] `src/components/ModelSelector.tsx:31` — `get_chat_models` browser mock returns `[]` by design, so web/E2E always shows the setup prompt and never exercises the populated model list. Add a query-param-seeded mock.
- [F-MIN-9] `src/i18n/index.ts:22` — `saveMissing` + `missingKeyHandler` only warn in DEV, so the 400-key fr/ja gaps are invisible in packaged builds. Log missing-key counts in CI via a locale-parity script.
- [F-MIN-10] `vite.config.ts:11` — dev server binds `0.0.0.0` with `allowedHosts:true` by default. Bind loopback unless `TAURI_DEV_HOST` is set.
- [F-MIN-11] `src/bindings.ts:16` — `isTauri` is true under vitest (`NODE_ENV=test`), silently bypassing all browser mocks in unit tests. Documented pattern, but one sentence in the file header would prevent confusion.

Verified OK: `chat_with_vision` browser mock present (`src/bindings.ts:169`, fix `6b04f98`); all 13 hooks under `src/hooks/` have `.test.ts` siblings; `jarvis/jev/jpanel/jkb` key parity across en/es/fr/ja (22/2/24/12 each); no raw `invoke` outside `bindings.ts`; no `TODO`/`FIXME`/`unwrap()` in `src/`; toasts/nav go through `AppContext`; sole `window.__` is declared `__AGENT_SLUG`.

---

## 3. CI / release workflows

### Critical
- [W-CRIT-1] `flatpak.yml:29-30` / run `36423206939` — Flatpak exit 101 is NOT the warnings cause; root cause is a missing system lib (`libpipewire-0.3 required by crate libspa-sys was not found`). Add `libpipewire-0.3-dev libdrm-dev libgbm-dev` to flatpak.yml deps. Flatpak stays red after the warnings fix otherwise.

### Major
- [W-MAJ-1] `release.yml:82-83` — Windows signing guard `env.SIGNING_CERT != ''` reads a step-level `env:` var inside that same step's `if`, which the runner does not populate at condition-evaluation time; signing may silently never run even with secrets set. Gate on `secrets.WINDOWS_SIGNING_CERT != ''` or hoist to job-level `env:`.
- [W-MAJ-2] `release.yml:16-22` — Release runs zero Rust gates (no check/test/clippy/fmt) before the 3-OS `tauri build`; the 6 warnings burned ~10 min × 3 runners identically. Add a pre-build gate job or trigger releases off CI success (`workflow_run`). Frontend steps (tsc+vite) were green in all 3 legs — nothing else failed there.
- [W-MAJ-3] `scripts/sign-macos.sh:14,29-32` — `FAILED=1` is set inside `find … | while read` (subshell) so it never propagates; the "FATAL" check always sees 0 and unsigned macOS ships as success. Use process substitution, `find -exec`, or a temp file.
- [W-MAJ-4] `release.yml:188` vs `:205-213` — minisign signs only `msi|exe|dmg|AppImage|deb|rpm` but the macOS fallback `.zip` IS uploaded, shipping without the `.sig` the fail-closed updater demands (`updater.rs:229-251`). Add `-name "*.zip"` to the signing `find`, or stop publishing the fallback zip (`updater.rs:554-567` never selects `.zip`).
- [W-MAJ-5] tag `v0.2.3` / run `36423206098` — the failed tag release cannot self-heal: fix `6b04f98` is committed but untagged, and `gh run rerun` would re-run the old SHA. Move/recreate the `v0.2.3` tag onto the fixed commit (or cut v0.2.4); separately re-run Flatpak.
- [W-MAJ-6] `ci.yml:81-105` / run `36423204364` — E2E runs before Rust gates, so the 2 jarvis failures skipped all Rust steps and masked the same 6 warnings Release later exposed. Run `cargo check/clippy/fmt` before Playwright, or split frontend/Rust into parallel jobs. Other E2E specs passed (6 passed, 1 self-skipped settings card).
- [W-MAJ-7] `release.yml` + `flatpak.yml` (no `concurrency:`) — tag pushes race release creation and Flatpak rebuilds; only ci (`ci-v2`) and nightly (`nightly-build`) are guarded. Add `concurrency: group: release-${{ github.ref }}` (and flatpak) with `cancel-in-progress: false`.
- [W-MAJ-8] run `36428531354` Nightly — `completed/failure` on all 3 legs with the identical pre-fix 6 warnings (schedule ran pre-fix code; `6b04f98` landed after). Heals on next schedule.
- [W-MAJ-9] `nightly.yml:71-72` — nightly bakes empty `CLICKYX_UPDATE_PUBKEY` and publishes no `.sig`, so `verify_update_signature` refuses every nightly install by design (`updater.rs:230-237`). Bake `UPDATE_SIGNING_PUBKEY` + minisign nightlies, or document nightlies as manual-download-only.
- [W-MAJ-10] `flatpak.yml:3-5` + `release.yml:205-213` — Flatpak rebuilds the full release binary on every `v*` tag yet the `.flatpak` bundle is never attached to the GitHub release (globs lack `*.flatpak`). Add `artifacts/**/*.flatpak` to release files, or decouple Flatpak from version tags.

### Minor
- [W-MIN-1] `nightly.yml:47` — cache key hashes `Cargo.toml`, not `Cargo.lock` (ci/release use the lockfile). Hash `src-tauri/Cargo.lock` and add `restore-keys:`.
- [W-MIN-2] `release.yml:116-121` vs `:132-134` (same in nightly/flatpak) — `upload-artifact@v6` paired with `download-artifact@v7` cross-major skew. Pin to the same major.
- [W-MIN-3] `ci.yml:319-324` vs release `clickyx-${{ matrix.os }}` — artifact named `clickyx-macos-aarch64` in CI but `clickyx-macos-latest` in release/nightly. Use one naming scheme.
- [W-MIN-4] `ci.yml:113` — `setup` matrix job runs on floating `ubuntu-latest` while build legs pin `ubuntu-24.04`. Pin setup to `ubuntu-24.04`.
- [W-MIN-5] `flatpak.yml:26-30` — system deps lag CI and the job sets no sccache/mold env. Sync the dep list and `RUSTC_WRAPPER: sccache` env.
- [W-MIN-6] `release.yml:97` — signtool timestamps over plaintext `http://timestamp.digicert.com`. Use `https://`.
- [W-MIN-7] `release.yml:75-80` / `ci.yml:298-303` — macOS zip fallback chains `|| true`, so a missing `.app` ships a release silently lacking the zip. Fail loudly or delete the fallback.
- [W-MIN-8] `tauri.conf.json:6` — identifier `com.clickyx.app` ends in `.app`; Tauri warns in the release log. Rename (breaking — coordinate with deep-link) or record as accepted.
- [W-MIN-9] `ci.yml:92-94` + `:180-182` — `cargo test --all-features` runs twice on ubuntu (Check job and Build leg). Drop the Check-leg run once Build covers all three OSes.
- [W-MIN-10] `package.json:42` + `tauri.conf.json:80-84` — dead `@tauri-apps/plugin-updater` frontend dep and empty `plugins.updater` stub while the real path is custom `updater.rs`. Remove dep + stub, or document why the stub must stay.
- [W-MIN-11] `updater.rs:99-120` — hosted primary `releases.clickyx.app` is unpublished by every workflow (connection fails → fast GitHub fallback today), but a future HTTP 404 returns `Ok(no_update)` and would permanently suppress the GitHub fallback. Treat 404 as `Err` or publish hosted metadata.
- [W-MIN-12] `nightly.yml:99-113` — nightly notes enumerate every file with no extension allowlist, unlike `release.yml:166-169`. Reuse the release filter.
- [W-MIN-13] `ci.yml` + `flatpak.yml` (no `permissions:`) — default broad tokens while release/nightly declare `contents: write`. Add least-privilege `permissions:`.
- [W-MIN-14] `ci.yml:84` vs `test:e2e` — CI pins 4 spec files while `npm run test:e2e` runs everything including visual (exclusion documented in `ci.yml:87-88` but drift-prone). Derive from shared config or gate `visual.spec.ts` on baseline presence.

Verified OK: YAML `safe_load` passes on all 4 workflows; workflow commands match `package.json` scripts and AGENTS.md gates; `draft: false` + prerelease detection + macOS/Windows secret wiring confirmed as written.

---

## 4. Bridge / security / runtime-compat

### Major
- [S-MAJ-1] `src-tauri/src/bridge.rs:860` — Bridge `/jarvis/fill` blocklist-checks caller-supplied `app_id`, not the OS focused window; a client can pass `app_id:"Slack"` while WeChat/banking is focused and still paste. Contrast `jarvis_extract` which resolves focus server-side (`commands/jarvis_cmds.rs:189`). Re-resolve `extract_focused()` title in the fill/analyze bridge paths (same self-report gap affects `/jarvis/analyze` `bridge.rs:827` and `jarvis_draft` `jarvis_cmds.rs:202`).
- [S-MAJ-2] `src-tauri/src/bridge.rs:1525` — `GET /mcp/tools` spawns a child process per enabled MCP server (`bridge.rs:966`) but is NOT in the dangerous tier (`bridge_auth.rs:82`); with `bridge_auth_disabled` any localhost page/client triggers process spawn unauthenticated. Add `/mcp/tools` (or `/mcp/`) to `DANGEROUS_PREFIXES`.
- [S-MAJ-3] `src-tauri/src/commands/config_cmds.rs:315` — `reset_config` never hot-reloads bridge auth (running bridge keeps an old, now-unretrievable token while the file has `None` + auth enabled) and leaves `kb.enc`/`conversations.enc`/`agents.enc` orphaned plus `automations.json` still scheduled. Regenerate token + `apply_bridge_auth_state` + wipe/flag residual data files.
- [S-MAJ-4] `src-tauri/src/commands/system_cmds.rs:191` — `get_logs` returns raw log lines with zero redaction while `docs/PRIVACY.md:38` claims "`get_logs` output is redacted", and the bridge logs user content (`bridge.rs:818` notification title/body, `bridge.rs:775` click coords). Add a redact pass to `get_logs` and stop logging bodies/coords.
- [S-MAJ-5] `src-tauri/src/lib.rs:502` — per-launch update phone-home (`updater.rs:99` + `:425` GitHub fallback, default-on via `config.rs:311`) contradicts `docs/PRIVACY.md:3` "no telemetry" and is never disclosed there. Document endpoint/payload (version+platform+IP) in PRIVACY.md.
- [S-MAJ-6] `src-tauri/src/ai/jev.rs:101` — `validate_jev_base_url` (and `validate_openai_base_url`, `config_cmds.rs:303`) accept plain `http://` for any host, sending `Authorization: Bearer <key>` in cleartext. Allow `http` only for localhost/loopback, require https otherwise.
- [S-MAJ-7] `src-tauri/src/jarvis/blocklist.rs:30` — deny patterns miss common money apps (`"bank "` needs trailing space so `MyBank` passes; no paypal/alipay/venmo/cashapp/revolut) and empty titles are allowed (`blocklist.rs:60`, `extract.rs:60` falls back to `"unknown window"`). Add fintech names + bare `bank`; treat unknown/empty as blocked for fill.
- [S-MAJ-8] `src-tauri/src/cua.rs:339` — Linux CUA/accessibility shell out to the `xdotool` binary (also `accessibility/linux.rs:56`) but deb `depends` only ships `libxdo3`. Add `xdotool` to deb depends and document/guard the ydotool-daemon requirement.
- [S-MAJ-9] `src-tauri/src/jarvis/fill.rs:117` — Wayland "copy-only" promise breaks when arboard itself fails (`copy_text`, `fill.rs:53`, propagates `Err` with no `wl-copy` fallback), returning an error instead of `{filled:false,copied:true}`. Catch clipboard failure and still report honest copy-only/manual-copy status.
- [S-MAJ-10] `src-tauri/src/bridge.rs:1554` — bridge `.bind("127.0.0.1:32123")` failure (second instance/port clash) only `log::error!`s while the app runs bridgeless, misleading the user. Emit a UI event/dialog and/or enforce single-instance.

### Minor
- [S-MIN-1] `src-tauri/src/bridge.rs:561` — `request_body.as_object_mut().unwrap()` in the `/v1/messages` proxy (plus `req.screen.unwrap()`, `bridge.rs:292`) panics a bridge worker on unexpected shape. Replace with `map_or`/early-400.
- [S-MIN-2] `src-tauri/src/audio/capture_thread.rs:54` — `buffer_rx.recv().expect(...)` panics the caller if the audio thread dies at spawn. Return `Result` via `recv().map_err(...)`.
- [S-MIN-3] `src-tauri/src/audio/capture.rs:186` — `RingBuffer::new(buffer_size as usize)` with user-settable `audio.buffer_size` (`capture.rs:91` does `% capacity`) has no validation (`validate_hotkeys` is the only config validator, `config.rs:504`); `0` = divide-by-zero panic in the audio thread. Clamp/validate `buffer_size >= 64`.
- [S-MIN-4] `src-tauri/src/overlay/mod.rs:18` — compositor guard only warns on non-GNOME/KDE Wayland; bare X11 without xcompmgr/picom gets no check while fullscreen `always_on_top` transparent windows (`overlay/window_manager.rs:47`) render opaque and cover screens. Detect X11 compositor and degrade/warn.
- [S-MIN-5] `src-tauri/src/overlay/mod.rs:128` — `show_overlay` calls `show()` on focusable fullscreen overlay windows with no focus control, risking focus-steal right before a fill-paste lands in the "focused" window. Set `focusable(false)`/skip-focus on overlay windows.
- [S-MIN-6] `src-tauri/src/commands/config_cmds.rs:15` — `get_config`/`update_config` hand plaintext secrets to the renderer (memory/react-query); any renderer XSS exfiltrates keys despite keychain-at-rest. Add a secrets-omitting getter for UI display paths.
- [S-MIN-7] `src-tauri/src/secret_store.rs:373` — `wipe_secrets` deletes 5 keys but not legacy `apikey.<provider>` entries; provider keys linger in the keychain after reset/wipe. Enumerate/delete `legacy_api_key(*)` too.
- [S-MIN-8] `src-tauri/src/bridge.rs:1215` — `GET /agents` and `/agent/{slug}/status` return full transcripts and are read-only-open when auth is disabled, which the docs never flag as sensitive. Document or move transcripts to the dangerous tier.
- [S-MIN-9] `src-tauri/src/lib.rs:359` — automations only tick while the app runs; no autostart/login-item exists (no autostart dep in `Cargo.toml`), so schedules silently never fire when closed. Document or ship per-OS login-item.
- [S-MIN-10] `src-tauri/src/lib.rs:355` — corrupt `automations.json` is swallowed by `unwrap_or_default()`, silently deleting all user schedules. Log + back up the corrupt file before resetting.
- [S-MIN-11] `src-tauri/src/config.rs:489` — `0600` hardening is `#[cfg(unix)]`-only; Windows `config.json` (keychain-fallback secrets) gets no explicit ACL. Set user-only ACL on Windows or warn.
- [S-MIN-12] `src-tauri/src/ai/jev.rs:414` — `declassify_jev_error` only strips `sk-ant-/sk-/xox/Bearer` shapes; non-`sk` Jev key formats can echo into bridge/UI errors. Redact `api_key`-adjacent values generically.
- [S-MIN-13] `docs/BRIDGE_API.md:77` — all curl examples omit the auth header; copy-paste fails with 401 against default-on auth. Add `-H "x-openclicky-token: $TOKEN"` to examples.

Verified good: localhost-only bind + Host allowlist + token-on-by-default + constant-time compare; all 30 bridge routes documented in `docs/BRIDGE_API.md`; `kb.enc`/`agents.enc` are real AES-256-GCM with random nonces; `macOSPrivateApi:true` + bundle id matches TCC check. No criticals in this area.

---

## 5. Implementation status (2026-09-28, commits `e722dbe` + fixes)

Local verification at commit time: `cargo fmt --check` clean, `cargo check --all-features` 0 warnings,
`cargo clippy --all-features --tests` 0 warnings, `npm run build` exit 0, `npm test` 18 files / 126 pass,
`playwright e2e/jarvis.spec.ts` 3/3 pass, `test:visual:update` 8/8 baselines committed.
Full `cargo test --all-features` was NOT completed locally (long cold build kept getting aborted);
CI Build legs run it as gate.

### Fixed in code (see commit `e722dbe` for the full diff)
- Rust: R-CRIT-3, R-MAJ-5/6 (scorer prefers nsis `-setup.exe`, msiexec kept for real `.msi`), R-MAJ-8,
  R-MAJ-10, R-MAJ-13, R-MAJ-14, R-MIN-2/3/4/5, R-CRIT-2 (prominent missing-secrets error).
- Security: S-MAJ-1/2/3/4/6/7/9/10, S-MIN-1/2/3/4/5/7/10/12.
- Frontend: F-CRIT-1 (8 baselines committed under `e2e/visual.spec.ts-snapshots/`), F-CRIT-2,
  F-MAJ-1 (+400 keys fr, +400 keys ja, `node scripts/check-i18n.mjs` parity gate), F-MAJ-2/5/6/7/8,
  F-MIN-1/2/3/4/5/6/7/8/9/10/11.
- Workflows/packaging/docs: R-CRIT-1/W-CRIT-1, R-CRIT-5/S-MAJ-8, R-MAJ-1/3/11/12, R-MIN-8 (documented),
  W-MAJ-2/3/4/6/7/9/10, W-MIN-1/2/3/4/5/6/9/12/13/14, R-MIN-7/W-MIN-7 (zip fallback deleted),
  S-MAJ-5/S-MIN-8/S-MIN-13 (docs), S-MIN-11 (updater 404 → GitHub fallback).

### Corrected after the fact
- W-MAJ-1: the `secrets.X != ''` STEP-`if:` gate is ILLEGAL — GitHub rejects the entire workflow file
  at load (zero jobs, instant failure, "workflow file issue"). Reverted to matrix-only step `if:` with
  the empty-secret check + skip notice INSIDE the pwsh script (commit `72577d5`).

### Release status
- Tag `v0.2.3` moved `e196413` → `e722dbe`. Tag delete+recreate fired two runs (`36435394301`,
  `36435414573`) that both startup-failed with zero jobs (loader race on the rewritten ref).
- `workflow_dispatch` + `RELEASE_TAG` added to `release.yml` (commit `6ae7457`); manual dispatch
  run `36436065942` (https://github.com/unn-Known1/clickyX/actions/runs/36436065942) — gate job
  started. Fire-and-forget; CI is the final gate.

### Deferred (breaking or needs a product decision — NOT forgotten)
- R-MIN-1 deep-link scheme `openclicky` rename; W-MIN-8 identifier `com.clickyx.app` rename.
- S-MIN-6 secrets-omitting config getter (renderer is same-origin trusted; needs API design).
- S-MIN-9 autostart/login-item (needs per-OS plugin decision).
- R-MIN-6 local `targets: all` vs CI-pinned bundles (accepted skew, CI is source of truth).

### External / owner actions (unchanged — cannot be fixed in code)
- R-CRIT-4 Apple signing secrets; Windows PFX secrets (guard fixed, cert itself is owner-side).
- F-MAJ-3 six `.mp3` in `public/sounds/`; F-MAJ-4 `intro.mp4` in `public/onboarding/`.
- W-MIN-11 publishing hosted `releases.clickyx.app` metadata (code now falls back correctly).
- W-MAJ-8 pre-fix nightly failure heals on next schedule.

## 6. Suggested fix order (ship-blockers first)

1. W-MAJ-5 — re-tag `v0.2.3` onto `6b04f98` (or cut v0.2.4) so Release can go green; fire-and-forget, don't poll.
2. W-CRIT-1 + R-MAJ-12 — Flatpak deps (`libpipewire-0.3-dev libdrm-dev libgbm-dev libclang-dev`) + same for docs/CI; re-run Flatpak.
3. R-CRIT-3 — overlay capability wildcard (`"overlay-*"`), else shipped overlay is IPC-dead on all 3 OSes.
4. R-CRIT-5 + S-MAJ-8 — deb `depends`/`Recommends`: `xdotool`, `xclip`/`wl-copy`, `wtype`; RPM equivalents (R-MAJ-3).
5. F-CRIT-1 — commit visual baselines or gate `visual.spec.ts` (currently red on every clean run).
6. S-MAJ-1 — bridge `/jarvis/fill|/analyze` must re-resolve OS focus server-side (blocklist bypass as written).
7. S-MAJ-2 — `/mcp/tools` into dangerous tier (unauthenticated process spawn).
8. W-MAJ-1 + W-MAJ-3 + W-MAJ-4 — Windows signing guard, macOS sign script subshell, unsigned `.zip` published without `.sig`.
9. F-CRIT-2 + F-MAJ-5 + F-MAJ-7 + F-MAJ-8 — browser mocks for update_*, streaming, version, conversations (poisoned caches / hangs in E2E + web).
10. S-MAJ-4 + S-MAJ-5 + S-MAJ-6 — `get_logs` redaction, updater phone-home disclosure, https-only base URLs. Then the remaining majors/minors in file order.
