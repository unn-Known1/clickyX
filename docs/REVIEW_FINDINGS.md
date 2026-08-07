# ClickyX Functional Review — Findings Report

**Date:** 2026-08-07
**Scope:** Full read-through of `src-tauri/src` (Rust backend, ~12k LOC) and `src/` (React/TS frontend, ~5k LOC), plus contract cross-checks between `bindings.ts`, Tauri commands, bridge HTTP endpoints, and emitted/listened events.
**Method:** Each subsystem was reviewed in depth and every high-impact finding below was re-verified directly against source. Items are severity-ordered.

**Legend:**
- 🟥 **CRITICAL** — feature dead-on-arrival, data loss, panic, or persistent-wrong behavior.
- 🟧 **HIGH** — clear functional bug or gap with real user impact.
- 🟨 **MEDIUM** — incorrect under realistic conditions; degraded behavior.
- 🟩 **LOW** — edge case / robustness / polish.

---

## TL;DR — the three biggest systemic problems

1. **The microphone→transcript pipeline is dead.** All three input paths (the always-on VAD loop, PTT, and `transcribe_audio`) are each broken in a different way, so always-on voice, wake word, handoff, and ducking events can never actually fire.
2. **The overlay feature group is mostly unwired.** Per-screen overlay windows are never created at startup, annotation lifecycle is never connected, and the frontend listens to ~14 events the Rust backend never emits.
3. **The bridge agent API and automations only "pretend" to run agents.** `POST /agent/*/run` and cron automations flip a session to `Running` and never execute anything, persist nothing, and emit nothing.

---

# 🟥 CRITICAL

## 1. Always-on voice → transcript pipeline is unreachable (dead code)

`src-tauri/src/audio/pipeline.rs:461` spawns the VAD loop on a **plain `std::thread`**, then at `pipeline.rs:534` gates the transcription/handoff on:

```rust
if let Ok(rt) = tokio::runtime::Handle::try_current() { ... rt.spawn(...) }
```

A `std::thread` has no tokio context, so `try_current()` **always fails**, and the entire STT + handoff + `on_transcript` block (`pipeline.rs:534-569`) is unreachable. Every caller (`lib.rs:224`, `commands.rs:770`, `commands.rs:885`) spawns the same threads. Net effect: always-on mode "runs" but can never produce a transcript, wake-word trigger, or handoff.

Fix: pass an explicit runtime handle into the thread (e.g. `tauri::async_runtime`) instead of `try_current`.

## 2. Overlay windows are never created at startup

- `overlay/window_manager.rs:53` `create_per_screen_windows`, `:83` `show_all`, `:89` `hide_all` have **zero callers** in the crate.
- The only creation path is `refresh_windows` (`window_manager.rs:113`), called solely from the hotplug watcher `overlay/mod.rs:449` **when display geometry changes**; the poll seeds `last_geoms` with the initial snapshot (`overlay/mod.rs:444-447`) so it does nothing on a stable display.
- The comment at `window_manager.rs:25-27` claims "initial overlay windows created elsewhere in the setup path" — that path does not exist.

Consequence: with a stable monitor setup, `overlay-0` is never created; `show_overlay` (`overlay/mod.rs:150`) errors "no overlay windows found", and cursor/rectangle/scribble/caption overlays never appear. Additionally, windows created by `refresh_windows` are `.visible(false)` and never `.show()`-n afterward (`window_manager.rs:133`), so even hotplug-created windows stay invisible.

## 3. Annotation lifecycle & auto-expiry are never wired

- `show_cursor` / `show_rect` / `show_scribble` / `show_caption` (`overlay/mod.rs:175-411`) only emit webview events; **nothing calls** `AnnotationManager::add_cursor/add_rect/add_scribble/add_caption` (`overlay/manager.rs:45-67` — test-only).
- The sweep task (`overlay/mod.rs:112-134`) iterates an always-empty manager, so armed→completed→missed transitions never fire and annotations never auto-expire.
- `CursorPayload` isn't `duration_ms` (`overlay/mod.rs:48-65`), so the frontend can't expire cursors either — they linger forever until an explicit `/clear`.

## 5. Bridge agent lifecycle endpoints are stub

`src-tauri/src/bridge.rs`:
- `bridge_create_agent` (`:1064-1101`) — no `store.save`, no event.
- `bridge_run_agent` (`:1103-1150`) — flips state to `Running`, pushes the prompt, returns `{ok:true}` **but never executes** the AI provider (unlike the Tauri command `run_agent`), never emits `agent-state-changed`, never saves disk. Sessions stay `Running` forever.
- `bridge_stop_agent` (`:1152-1183`) — sets `Paused`, no save, no event, and nothing can ever unpause it.

Advertised "Bridge agent lifecycle (create/run/stop/status)" functionality does not exist beyond state soup in memory.

## 6. Agent file attach panics on large multibyte files

`src-tauri/src/commands.rs:1898-1899`:

```rust
if content.len() > 10000 {
    format!("{}... [truncated]", &content[..10000])
}
```

Slicing a `String` at byte 10000 panics when byte 10000 is not a char boundary (accents/CJK/emoji). Use `floor_char_boundary(10000)` or `char_indices().nth(10000)`.

## 7. Saving AI settings wipes all voice/STT API keys

`src/components/SettingsSections/AiProviderSettings.tsx:76-83`: `newApiKeys` is rebuilt only from the four currently-populated fields, then `updateAppConfig({ api_keys: newApiKeys })` **replaces the entire `api_keys` array**. Saving *any* AI setting (e.g. only changing the default provider) with empty voice fields erases previously saved ElevenLabs/Cartesia/Deepgram/AssemblyAI keys. Must merge with existing `appConfig.api_keys`.

## 8. Frontend invokes three Rust commands that don't exist

`src/bindings.ts:454-456` — `getAppUsageLog`, `clearAppUsageLog`, `getAutomationRuns` invoke `get_app_usage_log`, `clear_app_usage_log`, `get_automation_runs`; **none of these commands exist in Rust** (grep-verified). Consequences:
- App Usage Log always shows "No app usage data collected" (`ConnectionsTab.tsx:72` swallows the rejection with `.catch(() => [])`).
- "Clear Log" always fails.
- Automation run history always shows "No runs yet" (`ConnectionsTab.tsx:321-325`).

## 9. Overlay webview listens to 14 events Rust never emits (feature deficit)

`src/overlay/OverlayApp.tsx` subscribes to: `audio-level-update` (:121), `show-glow`/`hide-glow` (:494/501), `calibration-start`/`-end` (:508/515), `show/hide-agent-dock` (:522/529), `processing-start`/`-end` (:543/546), `waveform-start`/`-end` (:550/553), `always-on-state-changed` (:569), `show/hide-highlight` (:576/583), `show/hide-shape` (:590/597). **None of these are emitted anywhere in `src-tauri`** (full `emit("...")` inventory below). Effect: the "real-amplitude" waveform falls back to random fake bars (`OverlayApp.tsx:135-146`), and the glow, calibration UI, processing spinner, always-listening pill, HIGHLIGHT and SHAPE renderers are permanently dead.

### Wire inventory (what Rust actually emits)

| Emitted (`src-tauri`) | Listened by frontend |
|---|---|
| `show-cursor`, `show-rect`, `show-scribble`, `show-caption`, `clear-overlays` | OverlayApp ✅ |
| `lifecycle-event` | OverlayApp ✅ |
| `agent-state-changed`, `voice-transcript`, `voice-selected` | App/UI ✅ |
| `stream-event`, `type-mode-changed`, `accent-changed`, `update-available`, `deep-link-opened`, `auto-capture-frame`, `bridge-notification` | ✅ |
| `audio-ducking-changed`, `voice-agent-handoff` (pipeline.rs:262,552) | **dead — `set_app_handle` never called; `app_handle` stays `None`** |
| — (never emitted) | `waveform-*`, `processing-*`, `calibration-*`, `*glow`, `*highlight`, `*shape`, `always-on-state-changed`, `audio-level-update` — **dead listeners** |

---

## 🟧 HIGH

## 10. Installed audio meter never lights (scale bug)

`src/components/StatusBar.tsx:54` divides by 100: `fetchedAudioLevel.rms / 100`, but the backend clamps `rms` to `0..1` (`src-tauri/src/audio/capture.rs:277`). Level is always ≈0.01, so the meter `filled = round(level*5)` is always 0. UI/back contract mismatch (should be `rms` directly or `*100` in backend).

## 11. VAD ring buffer appends non-draining audio (garbled / repeating transcriptions)

`src-tauri/src/audio/capture_thread.rs:97` `get_buffer_samples()` returns the full 1024-sample ring buffer without consuming; VAD loop appends it every poll (`pipeline.rs:487-537`). At 16kHz ~800 new samples per 50ms poll, so ~224 old samples are re-appended per iteration (≈25% duplicated audio; unbounded growth for long speech). STT then receives repeated/hallucinated segments. PTT path clears the buffer via `stop_recording`; the VAD path does not.

## 12. Agent "stop"/"archive" doesn't actually stop; in-flight run overwrites user's state

`src-tauri/src/commands.rs:1484` spawns the provider call detached; `stop_agent`/`archive_agent` only flip state. When the in-flight request completes, `run_agent` writes `session.state = Completed` unconditionally (`commands.rs:1537-1539`). No cancellation token, no "was it stopped?" check — an archived/stopped agent silently resurfaces as Completed with a full transcript.

## 13. OpenAI-compatible streaming double-`/v1` → 404 for most self-hosted endpoints

- `src-tauri/src/ai/openai.rs:191` (streaming path) hardcodes `format!("{}/v1/chat/completions", base_url)` with no duplicate-v1 guard, unlike the non-stream `api_url()` helper (`openai.rs:21-29`). For any providers configured as `https://api.example.com/v1` (Ollama/LM Studio etc.), streaming posts to `/v1/v1/chat/completions` → 404, while non-stream chat works.
- Same pattern in `ai/catalog.rs:74`: `{base}/v1/models` — and it **silently returns an empty list** on 404/error (catalog.rs:91-94 `_ => return vec![]`), so the model picker shows blank with no error.

## 14. Cron automations re-fire every second for a minute

`src-tauri/src/automation/mod.rs:135-137`: the `Schedule::Cron` branch only checks `matches_cron(expression, dt)` and **never consults `last_run`** (unlike the `Interval` branch at 124-133). The engine ticks once/sec (`lib.rs:257`). `"0 9 * * *"` matches the entire minute 09:00 → fires ~60×/minute.

## 15. Automation-triggered agents are never actually run

`src-tauri/src/lib.rs:255-299`: tick loop sets `session.state = Running`, pushes a `[Automation Trigger]` message, emits `agent-state-changed` — but **never calls the provider/execution path** and never `store.save`. The agent sits `Running` forever; the run is lost on restart; stats never register.

## 16. `get_today_stats` doesn't filter by day (all historical sessions counted)

`src-tauri/src/commands.rs:708-733`: counts every `Completed`/`Failed` session and every user message in every session's transcript across all history — no date filter. Today-pill numbers in the StatusBar are inflated by entire history.

## 17. `transcribe_audio` (sync command) can never resolve a tokio handle

`src-tauri/src/commands.rs:736-749` is a **sync** command (main thread), yet calls `tokio::runtime::Handle::try_current()` → always `Err("No tokio runtime")` on the main thread → the command always errors before ever calling the STT. If it somehow resolved, `rt.block_on` would also block the main thread on a network call.

## 18. `ptt_hotkey` setting has no effect

`src-tauri/src/commands.rs:838-847` + `lib.rs` global-shortcut handler: only `toggle_panel` and `toggle_type_mode` are ever registered. `set_ptt_hotkey`/`update_audio_config` persist the config, but nothing binds the shortcut. Changing the PTT hotkey silently does nothing.

## 19. Skills are empty in installed builds

`src-tauri/src/agent/skills.rs:13-16`: `skills_dir()` = `CARGO_MANIFEST_DIR.parent()/skills` (a compile-time path). Packaged/installed builds don't have that path → `load_skills()` returns `[]`. Also `load_skill(path)` (44-67) only iterates subdirectories while `load_skills` (:36) also picks top-level files — top-level skills are discoverable but not loadable.

## 20. Vision images are attached to *every* user message

`src-tauri/src/ai/anthropic.rs:44` / `src-tauri/src/ai/openai.rs:63`: the same `images` slice is merged into every `user` message for the whole thread, re-sending screenshots on every user turn of a vision thread (cost/latency), not just the message that owns the image.

---

## 🟨 MEDIUM

| # | Area | Issue | Location |
|---|---|---|---|
| 19 | VAD | Automated config/STT/API keys cloned once at thread start — live `set_always_on_config`/`update_api_keys`/`update_config` mutate shared structs but do not update the running loop | pipeline.rs:449-454, 608, 633, 657 |
| 20 | VAD | `DuckingGuard` unconditionally sets state `Idle` on drop; TTS during a listening utterance stomps `Listening`, VAD never transitions back (only back jumps `WakeWordListening`), mic gets stuck, next `stop_ptt_and_transcribe` returns "not listening" | pipeline.rs:213-221, 506-508, 586 |
| 21 | Voice | `speak_response`/`stop_ptt_and_transcribe` call `tokio::runtime::Runtime::new().unwrap()` — panics when called inside an async/tokio context (exactly the bridge case, bridge.rs: boot), blocks threads up to ~90s on slow providers | pipeline.rs:145-183, 231-233 |
| 22 | STT | AssemblyAI poll has no per-request `.timeout()` — a hung connection blocks forever | stt.rs:255-267 |
| 23 | Codex | `is_running()` never clears child; `get_codex_status` reports `state.is_some()` so "already running" sticks after crash — only `stop_codex` unblocks; no stderr drain → potential pipe buffer deadlock; hardcoded JSON-RPC id `1` makes matches ambiguous | codex.rs:121-127, 43, 71, 102 |
| 24 | TTS | `speak_edge` and OpenAI-Realtime were inert (return `Err` immediately) yet advertised in the voice catalog with `requires_api_key` false; selecting them breaks every `/speak` | tts.rs:157-160, 76-79; voices.rs:219-337 |
| 25 | Bridge | Blocking the pipeline `Mutex<VoicePipeline>` across synchronous provider HTTP calls + `.workers(1)` = one slow `/speak`/`/transcribe` stalls **all** bridge endpoints (incl. `/health`, `/events`) | bridge.rs:284-309, 392-416, 1399 |
| 26 | Bridge | Auth middleware (`.wrap(Auth)`) wraps **before** CORS and covers `/health` — token-configured: preflight OPTIONS (no auth header) 401 first, no CORS headers; /health not exempt (spec FR6.5 explicitly wants it token-free) | bridge_auth.rs:77-90; bridge.rs:1358-1367 |
| 27 | Bridge | MCP subprocess calls have no timeout; `mcp_call_tool_sync` re-spawns server per call, reads one line for `initialize` without validating id/error, never sends `notifications/initialized`, and kills-without-draining stdio (pipe-buffer deadlock risk) | bridge.rs:775-944 |
| 28 | Screen | Auto-capture interval is defeated on static screens: `last_time` only updates when a frame passes diff, so the thread re-captures + JPEG-encodes every 50ms; `compute_diff` decodes 2 full JPEGs each attempt | auto_capture.rs:101-147, 311-323 |
| 29 | Screen | "all"-monitor capture is wrong off(0,0): canvas uses first monitor size and clamps offsets at `.max(0)`, so left-of-primary monitors overlap and extents are truncated | auto_capture.rs:285-308 |
| 30 | CUA | ydotool invocation is malformed (`ydotool mousemove -- x y click 0xC0` as one command) → Wayland clicks never work; should be two invocations | cua.rs:158-160, 320-322 |
| 31 | CUA | Rate limiting is dead: every call builds a fresh `InputSimulator` (resets `last_click_ms`), `min_click_interval_ms` ignored; `double_click` bypasses it too | cua.rs:73-80, 405-417; commands.rs:273 |
| 32 | CUA | Linux background click geometry-matches ALL visible windows including our own overlay (`xdotool search --onlyvisible` reverse order) and xdotool hit topmost; with ignore-cursor-events failing, click self-targets | cua.rs:332-377; window_manager.rs:72,136 |
| 33 | CUA/accessibility | Windows `WM_LBUTTONDOWN` sends screen (not client) coords + physical px while app is DPI-scaled; macOS points-vs-pixels mismatch (System Events returns points, cliclick operates pixels) | cua.rs:246-255; macos.rs:79-132 |
| 34 | Permissions | macOS TCC read: first query returns granted if ANY client has auth_value=2 (not this bundle); `COUNT(*)` returns true for any row (denied app also has a row); `kTCCServiceUserNotification` isn't a TCC service | permissions.rs:82, 147-180 |
| 35 | Permissions | Linux checks conflate "daemon present" with "granted" (Mic = audio server up, Screen = pipewire/portal running, Camera = /dev/video* exists) | permissions.rs:455-550 |
| 36 | Overlay/DPI | window_manager mixes logical `.position/inner_size` (builder) with physical `PhysicalPosition/PhysicalSize` (hotplug refresh) — HiDPI mismatch; plus monitor index ordering is unstable after hotplug | window_manager.rs:61-62, 126-137; mod.rs:462-475 |
| 37 | Accessibility | No widget-level tree: all 3 backends model only window/app level (xdotool geometry / AppleScript AXWindow / a single UIAutomation FromPoint); every call spawns an OS process (0.5-1s) | linux.rs, macos.rs, windows.rs |

---

## 🟩 LOW

| # | Issue | Where |
|---|---|---|
| 38 | `get_logs` parses `" | "` separators the logger never produces (env_logger with default format) → timestamps/levels always blank in the in-app log viewer | commands.rs:1251-1272 vs lib.rs init |
| 39 | `clear_logs` delete fails on Windows while the file writer holds an open handle; on POSIX the logger keeps writing to the unlinked inode | lib.rs:54-70; commands.rs:1283-1299 |
| 40 | `/health` returning 401 when a token is configured breaks monitoring/uptime | bridge_auth.rs (see #26) |
| 41 | `check_for_updates` returns `available:true` + `download_url:None` when the platform key is missing; UI offers an update it can't download | updater.rs:96-105 |
| 42 | `install_update` parses but never verifies `signature`; Linux `deb`/`rpm` just `xdg-open`s the file and reports success | updater.rs:169-301 |
| 43 | Delta-update + progress-streaming code (`check_for_update_with_delta`, `download_update_with_progress`, `AutomationEngine::start/stop/start_ticking`) has zero callers — dead feature | updater.rs:325-407, 411-467; automation/mod.rs:155-178 |
| 44 | Bridge emits events with `let _` on the send to a 1024-capacity broadcast channel — dropped payloads are silent | bridge.rs:28-31, 684-701 |
| 45 | Bridge default is unauthenticated (`bridge_token: None`) with mouse/screen control + no rate-limiting; and there is **no UI command to enable the token** | config.rs:255; bridge.rs:1326-1349; commands.rs |
| 47 | SSE parser never flushes a trailing partial line without `\n` → last text segment dropped | anthropic.rs:236-274, openai.rs:219-254 |
| 48 | `guidance.rs` runs each tag regex over the whole text and `unwrap_or(0.0)` coords → nested labels produce phantom POINTs; `[^\]]*` strip leaves `]` residue | guidance.rs:61-131 |
| 49 | `gen3d.rs` forms the filename from raw prompt chars (`formFileName`) — `/`, `..` escape the models dir; transient HTTP errors quit the poll with no retry; 4xx surfaced as "parse failed" | gen3d.rs:44-53, 95-101 |
| 50 | `handoff.rs:47-48` slices `transcript` on byte indices computed from the lowercased copy — misboundaries on non-ASCII | handoff.rs:47-48 |
| 51 | `session.rs` timestamps are second-granularity → sorted "recent first" unstable for same-second sessions | session.rs:129-136 |
| 52 | Frontend: `UseChat` doesn't `unlisten` on stream error; `TextDone` doesn't update `accumulated`; vision cancel no-op; regenerate duplicates assistant reply | useChat.ts:80-81,102-108,171-179; ChatTab.tsx:287-291 |
| 53 | Frontend: conversations never load message history on select/tab switch (comment admits it's a "future enhancement") — they turn blank | ChatTab.tsx:307-314 |
| 54 | Frontend: agent mutations via `mutateAsync` without `.await`/`.catch` → unhandled rejections; file drop uses Tauri-v2-removed `f.path` so Rust `exists()` fails | AgentsTab.tsx:254, 307-309, 336-337 |
| 55 | Frontend: `__paletteSection` is both a string slot (App.tsx:229) and a setter function (SettingsTab/CommandPalette) — settings deep-links dead | App.tsx:229; SettingsTab.tsx:59; CommandPalette.tsx:27-31 |
| 56 | Internal `max_depth` of agents in `appStore` never populated → StatusBar attention/error pill always empty | appStore.ts:39,72; StatusBar.tsx:67-75 |
| 57 | Duplicate react-query cache keys for same AI config (`["ai-config"]` vs `["ai_config"]`) → stale default model | ChatTab.tsx:189; ModelSelector.tsx:16 |
| 58 | `saveSnapshot` disk writes inside `useState` updaters — double-invoked in StrictMode/dev | useConversations.ts:55-98 |
| 59 | i18n is non-functional: only SystemSettings calls `useTranslation` (changeLanguage); all UI strings hardcoded English; locale not persisted | i18n/index.ts; SystemSettings.tsx:128 |
| 60 | `UpdateBanner` stuck on "Installing…" (only catch sets false) | UpdateBanner.tsx:26-38 |
| 61 | `capture.rs:71` uses `mem::forget` on a Windows off-thread stream drop to keep the stream alive — documented intentional workaround | capture.rs:71 |

---

## Functional-gap matrix (advertised ≠ working)

| Feature (per README/AGENTS) | Status | Root cause |
|---|---|---|
| "Voice–agent handoff" (`voice-agent-handoff` event) | **Dead** | `set_app_handle` never called (findings #1/#9) |
| "Audio ducking changes" (`audio-ducking-changed`) | **Dead** | same |
| Always-on transcription | **Dead** | #1 |
| Wake word / wake-word detection | **Dead** | `check_wake_word()` has no production caller; front bindings contain no wake-word invoke (commands get_wake_word_config / start/stop_wake_word_detection are the only exposure) |
| Overlay cursor/rect/scribble/caption | Broken on cold start | windows never created (#2) |
| Annotation expiry / lifecycle events | **Dead** | overlay manager never plugged in (#4) |
| PTT hotkey | **Dead** | nothing binds it (#18) |
| Global caption/highlight/shape/glow/calibration/waveform overlays | **Dead** | events never emitted (#9) |
| App Usage Log, automation run history | **Broken** | commands don't exist (#8) |
| Bridge agent create/run/stop | **Stub** | never execute, never save (#5) |
| Cron automations | **Broken/repeat-fire** | fires per-second, never actually runs agent (#14/15) |
| "Today" stats | **Wrong** | counts all history (#16) |
| Delta updates / progress events | **Unimplemented** | dead code only (#43) |
| macOS screen-recording & mic live checks | **Unreliable** | TCC detection errors (#34/35) |
| Edge & OpenAI-Realtime TTS | **Broken** | stubbed to `Err` (#24) |
| Multi-monitor capture "all screens" | **Broken** off (0,0) | #29 |
| Wayland mouse/scroll | **Partially broken** | #30 |
| MCP server tool calls | **Fragile** | #27 |

---

## Test-coverage gaps

- Rust unit tests exist for: skills, app_contexts, guidance, pipeline, voices, automation, config, bridge, cua, gen3d, lifecycle, manager, screen_router, type_mode. **No Rust tests** for `commands.rs`, `bridge_auth.rs`, `overlay/window_manager`, `audio/capture_thread`, `audio/handoff`, `audio/wake_word`, `agent/session` execution, `updater.rs` core install paths, `permissions.rs`.
- Frontend unit tests cover only: CommandPalette, AppContext, and the hooks + agentStatus util. **No component tests** for AgentsTab, ChatTab, SettingsTab, StatusBar (the meter-scale bug #10 is testable), ModelSelector, OverlayApp, OnboardingWizard.
- No test asserts the bindings↔Rust-commands contract (this missed the three phantom commands #8).
- e2e tests hit the 4 tabs + palette (pure UI chrome) — no e2e for the bridge (`localhost:32123`), annotations, auto-capture, or automation.

## Verified-OK (worth preserving)

- Bridge auth uses constant-time compare, strips `Bearer ` prefix, supports `x-openclicky-token` header (bridge_auth.rs:64-72).
- Bridge overlay calls fall back to the global overlay for out-of-range screen indices (no panic — overlay/mod.rs:286-291).
- Slug collisions auto-suffix in `session.rs:71-83`.
- Run/agent `run_agent` drops the `MutexGuard` before `await` (no lock held across await on that path).
- All files under `src/hooks/` have `.test.ts` siblings (AGENTS rule respected).
- No `todo!()`/`unimplemented!()`/`panic!()` left in any runtime path (only tests).