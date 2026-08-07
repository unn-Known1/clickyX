# ClickyX — Efficiency & Smart-Improvement Audit

> **Date:** 2026-08-07
> **Scope:** Full codebase — Rust backend (`src-tauri/src/`, ~15.2k LOC) + React frontend (`src/`, ~23.4k LOC)
> **Method:** Read-through of all major subsystems; claims in section 1 were individually verified in source.
> **Status:** Findings only — no code changes made.

---

## 0. Executive Summary

ClickyX has a solid architecture (event-driven design intent, react-query usage, per-screen overlays), but the implementation has drifted from its own event-driven design. The single biggest theme: **the app was designed to be push-driven (Tauri events), but a large share of runtime paths are pull-driven (polling, busy loops, per-call I/O)**. Several findings are correctness bugs that also burn resources.

### Top 10 quick wins (impact ÷ effort)

| # | Fix | Impact | Location |
|---|-----|--------|----------|
| 1 | Make always-on VAD transcription actually run (runtime handle capture) | Core feature dead + all VAD work wasted | `pipeline.rs:534` |
| 2 | Fix PTT capture (ring buffer only holds last 64 ms) | Core PTT feature broken | `capture.rs:246` / `config.rs:67` |
| 3 | Create overlay windows at startup (they're only created on hotplug today) | Cursor overlays never appear until monitor change | `overlay/mod.rs:413` / `window_manager.rs:53` |
| 4 | Emit `audio-level-update` from Rust (or cap the 60 fps fallback RAF) | Permanent 60 fps re-render on always-on-top overlay | `bridge.rs` vs `OverlayApp.tsx:140` |
| 5 | Cron dedupe: fire once per matched minute (currently ~60×/minute) | 59 duplicate agent runs + 60 disk writes per minute | `automation/mod.rs:115` / `lib.rs:253` |
| 6 | Add in-memory config cache (config re-read from disk ~50 call sites) | ~100–500 µs–1 ms per command, 3× per agent run | `config.rs:297` |
| 7 | `memo(MessageBubble)` + cache markdown parse | Worst streaming-frame cost (O(n²) markdown re-parse per token) | `ChatTab.tsx:21` |
| 8 | Kill `refetchInterval` on agents/status; rely on existing Rust events | Removes the ~6-invoke-per-5s IPC floor | `useAgents.ts:22` / `StatusBar.tsx` |
| 9 | Share one `reqwest::Client` + reuse `Enigo` instances | ~50% latency on STT/TTS/CUA calls | `stt.rs:92` / `cua.rs:108` |
| 10 | Replace 3s monitor-enumeration hotplug poll with OS hotplug events | Constant background CPU, process never idles | `overlay/mod.rs:429` |

---

## 1. Verified Critical Findings

These were confirmed directly in source (not just flagged by static review).

### 1.1 Always-on auto-transcription silently never runs
`src-tauri/src/audio/pipeline.rs:461-463, 534`

The VAD loop spawns a plain `std::thread` (line 461). Tokio's runtime handle is thread-local — `Handle::try_current()` (line 534) returns `Err` on a raw OS thread, so the entire transcription branch (`rt.spawn(...)`) is skipped on **every** detected utterance. No error is logged (`if let Ok(rt) = ...` swallows the failure).

**Impact:** In always-on mode, every utterance is detected, buffered, and then discarded. Users see a "listening" pipeline that never produces transcripts. The wake word, handoff, and agent dock never fire from voice.

**Fix:** Capture `Handle::current()` (or `tauri::async_runtime::handle()`) *before* spawning the thread and use it inside, or push completed utterances into a bounded channel consumed by the async runtime.

### 1.2 PTT transcription only receives the last 64 ms of audio
`src-tauri/src/audio/capture.rs:138-150, 246-269` + `src-tauri/src/config.rs:67` (`buffer_size: 1024`)

`RingBuffer` capacity is 1024 samples = **64 ms at 16 kHz**. `stop_ptt_and_transcribe` (`pipeline.rs:170`) calls `stop_recording()` → `get_all()` which returns only the *tail* of the ring. Unlike the VAD path, PTT never accumulates samples during `Listening` — so every PTT "recording" handed to STT is the final 64 ms tail of whatever was said (plus a full STT network round-trip wasted).

**Fix:** Accumulate samples in a pipeline-owned linear buffer during `Listening` (VAD-style), or give `RingBuffer` a session-capture mode. The ring should only serve the VU-meter window.

### 1.3 Overlay windows are never created at startup
`src-tauri/src/overlay/mod.rs:413-458` + `src-tauri/src/overlay/window_manager.rs:53-77, 111-152`

`create_per_screen_windows` (window_manager.rs:53) has **zero callers**. The only creation path is `refresh_windows`, which is called exclusively from the hotplug poller when the monitor list *changes*. At startup the poller seeds `last_count`/`last_geoms` with the current state (mod.rs:418-427) so no mismatch is ever detected.

**Impact:** On a fresh boot, `show_overlay` / `show_cursor` (mod.rs:141-169, 403-411) emit to `overlay-N` labels that don't exist → guidance annotations, cursor companion, rectangles, and captions silently fail until the user unplugs/plugs a monitor.

**Fix:** Call `wm.refresh_windows(&app, &url)` once before the poll loop starts.

### 1.4 Overlay waveform: real-data event never emitted → permanent 60 fps fallback
`src/overlay/OverlayApp.tsx:108-157` vs. Rust emit sites

`Waveform` subscribes to `audio-level-update`, but **zero Rust code emits that event** (verified: 0 hits in `src-tauri/`; only an HTTP route `/audio-level` exists in `bridge.rs:1385`). `lastRealDataRef` stays 0, so `checkFallback()` re-schedules a RAF every frame — a 60 fps `Math.random()` + `setBars` React re-render on a transparent always-on-top WebView, whenever the waveform is active.

**Fix:** (a) Emit `audio-level-update` ~10 Hz from the VAD loop (the pipeline already holds `app_handle`), or (b) cap the fallback at ~10 fps via `setTimeout`, or (c) drive it with CSS animations only.

### 1.5 Cron automations fire ~60× per matched minute
`src-tauri/src/automation/mod.rs:115-153` + `src-tauri/src/lib.rs:253` (1 s tick)

`Schedule::Cron` matches on the 5-field expression **without checking `last_run`** (only the interval branch does, mod.rs:126-132). The engine ticks every second, so `0 9 * * *` stays "matched" for all 60 ticks of the 09:00 minute → ~59 duplicate runs and 59 synchronous `save()` disk writes (mod.rs:149-151).

**Fix:** Dedupe on `(expression, current_minute)` — fire at most once per minute; store `last_fired_minute`.

### 1.6 Dead event listeners for `auto-capture-status` and `audio-status`
`src/components/StatusBar.tsx:21-27` + `src/components/SettingsSections/CaptureSettings.tsx:30-39` + `src/hooks/useAgents.ts:28-34`

- Frontend `listen("auto-capture-status", ...)` — Rust only ever emits `auto-capture-frame` (`lib.rs:319`). Listener never fires → both StatusBar and CaptureSettings fall back to independent 5 s polls of the same backend.
- `useAgents` polls `listAgents` every 5 s (`refetchInterval: 5000`) **despite** listening to `agent-state-changed` and invalidating the cache on it — the poll adds a full-transcript IPC serialization every 5 s for nothing.
- `AgentHUD.tsx:48-53` polls the same full agent list every 3 s in a second WebView.

**Fix:** Drop the polls; drive caches from `agent-state-changed` / `auto-capture-frame`; add per-agent `get_agent(slug)` for the HUD.

### 1.7 Audio ring: mutex lock inside the cpal real-time callback + per-sample modulo
`src-tauri/src/audio/capture.rs:100-105, 224-228`

The audio device thread locks a shared `std::sync::Mutex` on every callback and does per-sample `% capacity`. Any contention with the VAD loop / VU-meter readers can stall the audio thread → dropouts.

**Fix:** Lock-free SPSC ring (single writer = callback, single reader = consumer); chunked copies with `copy_from_slice` instead of per-sample modulo.

---

## 2. Backend (Rust) — Efficiency Findings

### 2.1 Audio pipeline

| # | Finding | Location | Suggestion |
|---|---------|----------|------------|
| A1 | `tokio::runtime::Runtime::new().block_on()` created per PTT release and per TTS reply (a full multi-threaded runtime per interaction; caller blocks for the whole network round-trip) | `pipeline.rs:179, 231` | Use Tauri's async runtime once; make the methods `async` |
| A2 | VAD loop copies the full 1024-sample ring every 50 ms (`get_buffer_samples`), re-sums energy over overlapping windows (~80% overlap between ticks), then re-appends the same samples into `audio_buffer` (~20–25% duplicated audio sent to STT = inflated cost) | `pipeline.rs:472-519` | Track a consumer read-cursor; compute only *new* samples; incremental running sum-of-squares |
| A3 | No VAD hysteresis: one fixed threshold (`0.008`) for enter *and* exit → noise flapping re-clears/re-extends the buffer | `pipeline.rs:497-498` | Dual thresholds (enter > exit) + hangover counter |
| A4 | No noise-floor adaptation anywhere; `sensitivity` is hardcoded (`0.01 + sensitivity*0.19`) and `WakeWordDetector`/`check_wake_word` (pipeline.rs:350) is **dead code** (only called from a unit test) | `audio/wake_word.rs:29-60` | Adaptive floor via exponential decay on silence RMS; merge detector into VAD |
| A5 | `auto_submit` config flag never consulted — always-on transcripts fire regardless | `pipeline.rs:526-528` | Gate transcription on `ao_config.auto_submit` |
| A6 | `audio_buffer` trimmed with `Vec::drain(0..n)` — O(n) memmove every 50 ms while idle | `pipeline.rs:595-597` | `VecDeque` or read-offset strategy |
| A7 | `rms()` + `peak()` each scan the full ring with per-element modulo (two full passes per meter read) | `capture.rs:107-136` | One pass for both; or O(1) running sums updated in `push` |
| A8 | Fresh `reqwest::Client` per STT/TTS call — TLS handshake + no keep-alive on every interaction | `stt.rs:92,143,193`, `tts.rs:83,124,163` | One shared `LazyLock<Client>` |
| A9 | WAV payload re-cloned per retry attempt; AssemblyAI path base64-encodes the entire file into an unused `_b64` binding | `stt.rs:104,148,195-196` | `bytes::Bytes` refcount clone; delete dead encode |
| A10 | Bridge `/transcribe` decodes base64→i16→f32→(STT re-encodes f32→i16 WAV) — double conversion round-trip | `bridge.rs:269-280, 358-374` | Pass original WAV bytes through to STT directly |
| A11 | `speak_system` busy-waits `tts.is_speaking()` at 20 Hz for the whole utterance | `tts.rs:200-212` | Poll at 100–250 ms; or completion callback |
| A12 | No TTS caching — repeated phrases re-synthesized over network every time | `tts.rs` | LRU keyed `(provider, voice, text)` |
| A13 | `Enigo::new()` per keystroke in type-mode; Linux Wayland spawns a `wtype` subprocess per call | `type_mode.rs:123-145` | Lazily-created single `Enigo`; batch wtype per text block |
| A14 | `get_voice_by_id` rebuilds all 6 provider voice tables on every lookup | `voices.rs:355-364` | `LazyLock<HashMap>` |

### 2.2 Screen capture & auto-capture

| # | Finding | Location | Suggestion |
|---|---------|----------|------------|
| S1 | Diff is computed *after* full capture + full-res JPEG encode + decode — static screens pay full cost every tick, forever | `auto_capture.rs:118-155, 236-342` | Downscale to a 32×32 luma signature *before* encode; diff the signature; encode only when changed |
| S2 | `last_time` only updated when diff > threshold → unchanged screens never throttle and re-encode at full rate indefinitely | `auto_capture.rs:132-147` | Always touch `last_time` (or compute exact next-wake) |
| S3 | Auto-capture loop busy-waits at 20 wakeups/sec (`sleep(50ms)` clock-check) | `auto_capture.rs:101-109, 157` | `sleep(remaining)` in one call |
| S4 | `ScreenConfig { max_dimension: 1280, jpeg_quality: 80, cache_ttl_secs: 3 }` is defined but **never read** — capture hardcodes quality 85, never downscales, no cache | `config.rs:125-141` | Wire it: downscale to 1280, quality 80, TTL cache for bridge |
| S5 | `capture_all_jpeg` stitches a virtual-desktop buffer (e.g., 7680×1080) and **misplaces negative-offset monitors** (`max(0)` clamp) | `auto_capture.rs:285-309` | Encode per-monitor; offset by `virtual_bounds()` min |
| S6 | Frame bytes cloned 2–3× per tick; `Vec::remove(0)` O(n) eviction | `auto_capture.rs:135-146` | `Arc<Vec<u8>>` + `VecDeque` |
| S7 | `get_latest_data_url` re-base64-encodes ~300 KB on every call | `auto_capture.rs:174-179` | Cache data URL with the frame |
| S8 | Hotplug: full `xcap::Monitor::all()` enumeration every 3 s forever (process never idles) | `overlay/mod.rs:413-458` | OS hotplug events (`WM_DISPLAYCHANGE`, `CGDisplayRegisterReconfigurationCallback`, XRandR); else count-only check + 10 s backoff |
| S9 | Annotation lifecycle sweep: 1 Hz unconditional wake; emits IPC **while holding the manager mutex** | `overlay/mod.rs:112-134` | Expiry min-heap + wake-on-insert; collect IDs, drop lock, then emit |
| S10 | `show_overlay/hide_overlay` do linear label walks of the Tauri window registry per call | `overlay/mod.rs:141-169` | Keep a cached window map |
| S11 | `emit_all_screens` clones payload per window (Scribble = hundreds of points × N monitors) | `window_manager.rs:103-109` | `Arc` payloads |
| S12 | `screen/coordinate.rs` is dead code (not declared in `screen/mod.rs`); live guidance tags skip Y-flip (macOS) and DPI scaling entirely | `screen/coordinate.rs`, `commands.rs:263-296` | Consolidate normalization; apply `scale_factor` + Y-flip before `enigo` clicks |
| S13 | Overlay keeps one full WebView + React app per monitor alive (hidden but resident) | `window_manager.rs:53-77` | Lazy-create on first annotation; or one webview spanning virtual bounds |

### 2.3 Bridge, agents, automation, config

| # | Finding | Location | Suggestion |
|---|---------|----------|------------|
| B1 | Config re-read from disk on ~50 call sites (43× in `commands.rs`, 7× in `bridge.rs`) — full `read_to_string` + `serde_json` parse per IPC; `run_agent` reads it 3× | `config.rs:297-342` | In-memory `RwLock<Arc<AppConfig>>` state + debounced writer |
| B2 | Config-micro commands (`set_cursor_accent`, `set_accent_preset`, `select_voice`, `set_ptt_hotkey`, …) each do full load→mutate→save (whole config incl. `api_keys` re-serialized); any config change also triggers full hotkey re-registration | `commands.rs:1118-1380, 128-129` | Patch API + debounce; hotkey re-register only on hotkey-relevant changes |
| B3 | Hand-rolled cron math (chrono reimplementation), evaluated in **UTC** (local-TZ jobs fire at wrong time), expression re-parsed every second | `automation/mod.rs:181-283` | Add `chrono`/`cron` crate; parse once, cache; local TZ |
| B4 | No overlap protection: interval automation re-triggers while its agent is still `Running` (no state check in trigger path); laptop-sleep → immediate burst, no catch-up/drift logic | `lib.rs:270-302` | Skip if `session.state == Running`; recompute next-run instants |
| B5 | `AutomationEngine::start_ticking` is dead code competing with lib.rs loop; `automations.json` saved with non-atomic `fs::write` (config.rs uses tmp+rename — automation doesn't) | `automation/mod.rs:155-177, 78-81` | Delete dead loop; atomic write + debounce |
| B6 | MCP: process-per-call — every `tools/list`/`tools/call` re-spawns the server, re-runs `initialize`, then kills it; no `initialized` notification; read loop caps at 100 lines with **no timeout** (hung server = leaked blocking thread) | `bridge.rs:747-944` | Per-server keep-alive client pool, timeout, cached `tools/list` |
| B7 | Blocking work inline in async actix handlers: screenshots, enigo clicks, osascript/PowerShell subprocess spawns, base64 decode — with `.workers(1)` one slow call freezes all bridge routes | `bridge.rs:135-144, 146-221, 703-726, 1226-1261` | `spawn_blocking` (already used for MCP); sync handlers |
| B8 | AI proxy (`/v1/messages`, `/v1/responses`): fresh `reqwest::Client` per request, `.text().await` buffers whole generation, `stream:false` hardcoded — no SSE pass-through | `bridge.rs:450-638` | Shared client; stream body to client; honor `stream:true` |
| B9 | SSE: no keepalive heartbeat (idle connections die behind proxies); broadcast builds formatted string per event; all clients get everything | `bridge.rs:13-31, 684-701` | `: heartbeat` every 15–30 s; format at edge; typed channels |
| B10 | `/agent/{slug}/run` (bridge) marks session `Running` but **never executes anything** — returns `ok:true` with no agent run | `bridge.rs:1103-1150` | Route into shared `run_agent` executor; return 202 |
| B11 | `transcribe_audio` command does `tokio::block_on` inside a sync IPC command (up to 30 s network wait on a Tauri thread) | `commands.rs:587-597` | Async command / `spawn_blocking` |
| B12 | `get_models` hits the network on every call, no cache/TTL/offline fallback; `load_skills` re-scans + re-parses the whole skills tree per call | `commands.rs:353`, `agent/skills.rs:18-80` | 5-min TTL catalog cache; mtime-invalidated skills cache |
| B13 | `save_conversations` re-encodes (AES-256-GCM) the entire corpus per message; agent store re-encrypts the full transcript per append — O(n²) across a session | `commands.rs:468-520`, `agent/session.rs:99-123` | Append-only journal + periodic compaction; per-row saves |
| B14 | Codex `send_rpc` is dead code and broken (new `BufReader` per call discards read-ahead; no timeout; no exit watch → stuck "Codex not running") | `agent/codex.rs:60-127` | Persistent reader thread + auto-state-clear on exit; or delete |
| B15 | Updater: streams download to temp, then reads the **entire file back into memory**, then writes again (3× memory for a 1–2 GB update); no ETag/Range resume; duplicate check functions | `updater.rs:108-130, 434-467, 169-190` | Keep the streamed temp file; install from path; `If-None-Match` |
| B16 | gen3d: fixed 2 s poll × 150 (no backoff); task-id+prompt chars used as filename (Windows-illegal chars possible); fresh client per status call | `gen3d.rs:58-124` | Exponential backoff (2 s→10 s cap); sanitized/hashed filename |
| B17 | Bridge logs every request via `Logger::default()` (UI polls spam log); no rate-limit on the unauthenticated localhost port (comment admits it) | `bridge.rs:1324-1327, 1396-1399` | Debug-level logging; token-bucket per-IP |

---

## 3. Frontend Findings

| # | Finding | Location | Suggestion |
|---|---------|----------|------------|
| F1 | Streaming: every token re-renders every bubble; `MessageBubble` not memoized; assistant bubble re-parses **full accumulated markdown** per delta (O(n²) with highlight.js) — zero `useMemo`/`memo`/`useDeferredValue` in `src/` | `ChatTab.tsx:21, 387-403`, `useChat.ts:77-79` | `memo` + cached markdown per message; render streaming bubble as plain text; `useDeferredValue` on stream |
| F2 | StatusBar polls audio (2 queries × 2 s) + capture (5 s) + stats (30 s); each locks the audio pipeline mutex | `StatusBar.tsx:30-46` | Push events (`audio-state-changed`); level only while listening |
| F3 | Tab switching unmounts tabs (chat state, scroll, images lost; full remount + IPC burst on return); 100 ms `setTimeout` before every switch | `App.tsx:278-312`, `AppContext.tsx:55-61` | Keep mounted + `display:none`; CSS transitions |
| F4 | Conversation persistence: full snapshot (≤50 convos × 200 msgs) serialized per message change; also writes data back right after loading it | `useConversations.ts:45-51, 80-90`, `ChatTab.tsx:217-221` | Debounce ~1 s + flush on unmount; skip replace-originated writes |
| F5 | Duplicate AI-config query keys (`["ai-config"]` vs `["ai_config"]`) → concurrent `get_ai_config` invokes; updates via one key never invalidate the other | `ChatTab.tsx:177-181`, `ModelSelector.tsx:15-19` | One shared key constant |
| F6 | Draft `sessionStorage.setItem` on every keystroke (sync disk-backed I/O) | `ChatTab.tsx:207-209` | Debounce 300 ms / persist on blur |
| F7 | Smooth `scrollIntoView` per stream delta (queued smooth animations interrupt each other) | `ChatTab.tsx:212-214`, `AgentHUD.tsx:94-98` | `behavior:"auto"`; only when near bottom |
| F8 | No memoization anywhere; search inputs re-filter + re-render whole lists per keystroke; `CommandPalette` does `indexOf` inside map (O(n²)); sidebar re-reverses + `toLocaleDateString` per render | `AgentsTab.tsx:304-327`, `ConnectionsTab.tsx:491-663`, `ChatTab.tsx:133-156`, `CommandPalette.tsx:110` | `memo` rows, `useDeferredValue`, precomputed indices |
| F9 | VoiceDiscovery re-renders orbit + 50-item list on every `pointermove`; provider/voice fetches bypass react-query | `VoiceDiscovery.tsx:109-165, 226-259` | CSS `transform` on container; `useQuery` + `staleTime` |
| F10 | ThreeModelViewer: 60 fps RAF while hidden; GLTF scene graph never disposed (GPU leak per model) | `ThreeModelViewer.tsx:84-109` | Pause on hidden; traverse-dispose |
| F11 | `useStore()` with **no selector** subscribes StatusBar to every slice; `setAgents` never called (store slice dead; error-attention UI silently broken); attention logic duplicated in ConnectionsTab | `StatusBar.tsx:11`, `appStore.ts:31-97`, `ConnectionsTab.tsx:384-388` | Selectors; shared `useAttentionItems` hook |
| F12 | Vision images stored as unbounded full-size base64 data URLs (cannot revoke; memory grows) | `useVision.ts:12-25`, `ChatTab.tsx:235-239` | Cap at 4; object URLs; client-side downscale |
| F13 | highlight.js bundles all ~190 languages into the first tab chunk; no `manualChunks`; `@react-three/fiber`/`drei` unused deps | `ChatTab.tsx:2-5`, `vite.config.ts:21-29` | `rehypeHighlight({ subset })`; vendor chunking; drop unused deps |
| F14 | AgentHUD rebuilds timeline per poll, no dedup, `at(-1)` scan per poll | `AgentHUD.tsx:61-91` | Diff in query `select`; cap timeline at 100 |
| F15 | `Sounds.preloadSounds` dead export — first agent-launch stalls on audio fetch | `utils/sounds.ts:34-44` | Call in `main.tsx` |
| F16 | `voice-selected` listener only `console.log`s; HomeTab suggestions are sessionStorage behind react-query | `App.tsx:210-217`, `HomeTab.tsx:112-128` | Wire or remove; plain memo |
| F17 | ModelGeneratorTab fixed 2 s poll | `ModelGeneratorTab.tsx:25-32` | Backoff 2→5 s; react-query `refetchInterval` |
| F18 | AppContext value object recreated per render (all consumers re-render on any toast) | `AppContext.tsx` | `useMemo` / split contexts |

---

## 4. Smart-Feature Opportunities (product-level)

Beyond bug-fixing, these make the app behave *smartly* — all aligned with the existing spec's intent:

1. **Adaptive auto-capture** — rate scales with diff magnitude: 10 s when static, 1 s when moving; pause entirely when the focused app is a video/IDE fullscreen or during agent runs that don't need vision. (Engine exists at `auto_capture.rs`; only the policy is missing.)
2. **Adaptive VAD** — running noise-floor estimate (min-RMS with exponential decay) makes wake sensitivity work in noisy rooms; voiced-band energy check (80–1200 Hz) rejects fan/typing false triggers. This is the real "smart wake word" the dead `wake_word.rs` was meant to be.
3. **PTT session capture + silence auto-stop** — hold-to-talk becomes click-to-talk with automatic end-pointing using the same VAD logic; no 64 ms tail bug, no manual release.
4. **TTS cache** — LRU `(provider, voice, text) → bytes`; instant replies for repeated phrases; offline replay.
5. **Agent handoff cooldown** — after a voice-agent handoff, suppress further handoffs for N seconds so the agent can answer without re-triggering.
6. **MCP keep-alive pool** — first call spawns, subsequent calls reuse the live stdio connection (huge for agent loops over MCP tools); `tools/list` cached per server.
7. **Automation overlap guard + catch-up** — skip if agent still running; after sleep, run at most one missed execution (configurable), not a burst of N.
8. **Screenshot staging** — hold the last unchanged JPEG with a TTL (the unused `cache_ttl_secs`); vision requests reuse it when nothing changed — cuts token/bandwidth cost of every AI call that attaches the screen.
9. **Model catalog TTL cache** — `get_models` cached 5 min with Etag; offline fallback to static base catalog (dropdown must not depend on live network).
10. **Per-agent transcript diffing** — HUD/status updates via `agent-state-changed` payloads instead of full-transcript polls (smaller payloads, event-driven).
11. **Energy-aware hotplug polling** — prefer OS hotplug callbacks; the process should sleep at OS level when idle (battery/notebook benefit).
12. **Streaming bridge proxy** — honor `stream:true` on `/v1/messages` so external tools get incremental tokens, not full buffered responses.
13. **Screen-lock / screensaver detection** — pause auto-capture, VAD, and overlay RAF when locked or no display — the current code keeps burning CPU at the login screen.
14. **Bridge rate limiting** — token-bucket on the localhost port (defense against rogue local processes hammering `click`/`speak`).
15. **AI cost guard** — cap auto-capture JPEG bytes per request and downscale before encode (the intended-but-unwired `max_dimension: 1280`); document tokens saved per capture mode.

---

## 5. Prioritized Roadmap

### Phase 1 — Correctness (do first; each is a bug + resource waste)
1. Overlay windows at startup (§1.3)
2. Always-on transcription runtime handle (§1.1)
3. PTT session buffer (§1.2)
4. Cron minute-dedupe (§1.5)
5. Bridge `/agent/run` actually runs (§B10)
6. Coordinate Y-flip/DPI for guidance tags (§S12)

### Phase 2 — Kill the idle CPU floor (biggest battery/CPU win)
7. Emit `audio-level-update` or cap waveform fallback (§1.4)
8. Diff-before-encode in auto-capture + always-touch `last_time` (§S1/S2)
9. Exact-sleep in auto-capture loop (§S3)
10. OS hotplug events / count-only poll (§S8)
11. Sleep-aware sweep task (expiry heap) (§S9)

### Phase 3 — Remove the IPC floor (push over pull)
12. Drop `refetchInterval` in useAgents/StatusBar/CaptureSettings; event-driven (§1.6, F2)
13. In-memory config cache + debounced atomic writes (§B1/B2)
14. Shared `reqwest::Client` (STT/TTS/bridge proxy) (§A8)
15. Persistent `Enigo` (§A13)

### Phase 4 — Perf engineering
16. memo + cached markdown for streaming chat (F1)
17. Keep tabs mounted (F3)
18. highlight.js subset + chunking (F13)
19. Debounced conversation persistence (F4)
20. MCP keep-alive pool (B6), model/skills caches (B12), updater memory (B15), gen3d backoff (B16)

### Phase 5 — Smart features (§4)

---

> **Decommissioned:** `docs/WINDOWS_BUGS.md` and `docs/MACOS_BUGS.md` were removed after their findings were applied/verified (the reports referenced the stale commit `e2fa9c2`). The following is the consolidated list of the ~8 items from those reports that remain **unfixed or partial** in the current code.

---

## 7. Remaining Platform Items (from decommissioned WINDOWS_BUGS.md / MACOS_BUGS.md)

Kept here so nothing is lost. Items not listed were verified as fixed in code.

| # | Platform | Severity | Status | Issue | Current state / suggestion |
|---|----------|----------|--------|-------|-----------------------------|
| W5 | Windows | Med | Partial | Dual tokio runtimes (actix `System::new` separate from Tauri's) | `bridge.rs:1344-1350` now single-threaded on Windows with an explanatory comment; still separate runtimes. Preferred: run the bridge on Tauri's runtime. |
| W6 | Windows | Med | Open | PowerShell dependency in 3+ modules | `accessibility/windows.rs` (11 uses), `permissions.rs` (3), `cua.rs` (3). Design trade-off for background clicks/CUIA; a Win32 `sendInput`/COM rewrite (via `windows-rs`) is the long-term fix. Subprocess latency ~100–500 ms per call remains. |
| W7 | Windows | Low | Partial | Permission consent read via PowerShell | Now reads the registry `ConsentStore` (the correct location) but still through `Get-ItemProperty`; direct registry read would remove the `powershell.exe` dependency. |
| W11 | Windows | Low | Open | WebView2 version not pinned | No `minimumWebView2Version` in `tauri.conf.json`. Pin a minimum to guarantee overlay transparency / DOM APIs. |
| W13 | Windows | Low | Open | CI assumes WebView2 on runner | `windows-latest` ships it today; add a runtime check or pin installer to harden. |
| M4 | macOS | Med | Open | TCC DB queried directly via `sqlite3` | `permissions.rs:50-56` still reads `com.apple.TCC/TCC.db` (`auth_value=2`). Fragile across macOS versions and SIP; preferred: `AVCaptureDevice` auth status or `tccutil`-based probe with graceful fallback. |
| M8 | macOS | Low | Partial | Broad `apple-events` entitlement | `network.server` was removed; `com.apple.security.automation.apple-events` remains `true` (`entitlements.plist:15`). Acceptable for system-level iOS control; document why. |
| M10 | macOS | Low | No | `macOSPrivateApi` + JIT review friction | Known trade-off for transparent overlays; document in `PROJECT_SPEC.md` (see `AGENTS.md` "macOS private API" note). |
| M12 | macOS | Cosmetic | No | `iconAsTemplate: true` deprecated | `tauri.conf.json:35`; retain for older macOS, no runtime effect on modern. |
| M15 | macOS | Low | No | No Intel (`x86_64-apple-darwin`) CI build | Only `macos-latest` (ARM) is built. Add a second target or a `lipo` universal binary; otherwise document "Apple Silicon required". |
| M16 | macOS | — | Fixed | Settings URLs per version | Resolved: `permission_settings_url` branches on macOS 13+ vs legacy (`permissions.rs:215-240`). |

> Note: `docs/WINDOWS_BUGS.md` and `docs/MACOS_BUGS.md` were removed from the repo on 2026-08-07. Item numbering above references their original report numbering to keep traceability.

---

## 8. Verification Notes

- `cargo check`, `npm run build`, `npm test` all pass locally — none of the findings above are build-breaking; they are behavioral/perf.
- Claims §1.1–§1.7 were verified by direct source reads (`pipeline.rs:534`, `capture.rs:246`, `overlay/mod.rs:413`, `OverlayApp.tsx:140`, `automation/mod.rs:115`, `useAgents.ts:22`, `capture.rs:224`).
- The "audio-level-update" event, "auto-capture-status" event, and `setAgents` store write were confirmed absent via repository-wide grep.
