# JEV + Jarvis Support — Implementation Report for ClickyX

> Status: report only, no code changed.
> Date: 2026-09-28 (rev.2 — 6-subagent gap-fix pass: backend, frontend, security, cross-platform, AI-API, QA/docs)
> Source of truth: `docs/PROJECT_SPEC.md`
> Constraints: `AGENTS.md` (cross-platform ×3, typed `bindings.ts`, react-query, `AppContext`, hook tests, bridge compat, fire-and-forget CI)

## 0. Executive Summary

"JEV Jarvis" trending in Sept 2026 is **two complementary things**:

| # | What it is | Signal (time-sensitive, motivation only) | What it does |
|---|---|---|---|
| **A. TypeSafe Jev** — System-One decision model (TypeSafe AI; Almeida, ex-OpenAI; $40M DCVC seed; Vercel "fastest day-1, ~13% paid teams") | ~70–500ms vendor claim; independent P50 ~687ms / P95 ~777ms; $0.042/1M input, output free | **Not an LLM.** `state + typed questions` → `choice / noul / score` (lowercase wire) with calibrated probabilities. Routing, safety checks, ranking, urgency. |
| **B. jev-chat/jev-chat-jarvis** — MIT "chat co-pilot" (Android ~6.9k★/1.2k forks in ~7d + `jev-chat-windows` ~636★ + mac sibling) | QQ / X / Lark verified; WeChat Android removed in v1.4 | Read-only screen → Jev judge → LLM drafts 3 → **fill-only, never auto-send**. |

**Jarvis = UX pattern, Jev = judge backend.**

ClickyX owns most primitives (`xcap` capture, per-screen overlay, `enigo` CUA, Anthropic/OpenAI chat, window-level a11y tree, diff-based auto-capture, `127.0.0.1:32123` bridge). Missing: typed-decision provider, judge-first fill-never-send mode, local KB scoping, messaging safety rails, clipboard-paste fill path.

**Scope:**

- **Track 1:** `Jev` as first-class decision provider (`src-tauri/src/ai/jev.rs`) — OpenRouter + TypeSafe-direct + custom. Standalone value without Jarvis UI.
- **Track 2:** **Jarvis Mode** — focused-window capture → extract → Jev judge → LLM draft-3 → overlay panel → fill-only paste. Reuse overlay/capture/CUA/a11y; no Python/Kotlin forks; no Android overlay; no hooks; no auto-send; no WeChat; no GPL deps.

---

## 1. Research Findings (corrected)

### 1.1 TypeSafe Jev API — build against this, not rev.1

| Surface | POST path (exact) | Model namespace | Notes |
|---|---|---|---|
| Direct | `https://api.typesafe.ai/v1/systemone` | bare: `jev-latest`, `jev-1.13.0`, `jev-preview` (`jev-1.13` w/o patch → 400) | Returns `{model, answers, usage:{input_tokens,output_tokens}}` — **no `cost`**. Pin `jev-1.13.0`; `jev-latest` moves. |
| OpenRouter Decisions | `https://openrouter.ai/api/alpha/decisions` (compat: `https://openrouter.ai/api/v1/systemone`) | `typesafe/jev-1.13`, `~typesafe/jev-latest` (request); `typesafe/jev-1.13-20260917` is **response-side** resolution to log | Returns `+ {id, provider, usage:{input_tokens,output_tokens,cost}}`. Do not hardcode the API-ref's doubled `…/api/v1/api/alpha/decisions` rendering bug. |
| Bocha (CN) | `https://jev.bocha.cn/v1/systemone` | `bocha-jev-v1` | Verified via preset docs. **Data-residency warning required** (chat text → CN endpoint) before connectivity test. |
| Vercel | `https://ai-gateway.vercel.sh/typesafe/v1/systemone` | `typesafe-ai/jev` | Verified. `POST /v1/evaluate` is a *different* Gateway format (`type:boolean, probability`) — "identical protocol" applies to `/typesafe/*` only. |
| OpenCode Zen | `https://opencode.ai/zen/v1/systemone` | `jev-1.13` (or limited-free `jev-1.13-free`, Zen only) | rev.1's bare `https://opencode.ai/zen` 404s. |
| Others | — | `typesafe-ai/jev` (Vercel only), `typesafe/jev` (Cloudflare), never `boolean` on TypeSafe path | Do not mix namespaces. Store **(provider, base_url, model) triple**, not one model string. |

Schema (enforce in `jev.rs`):

- `noul`: `{type:"noul", instructions, criteria?:{true,false}}` → `{type:"noul", noul:0..1}` (no `confidence`). `criteria` optional.
- `choice`: `{type:"choice", instructions, criteria:{k:desc…} (required, ≤255)}` → `{choice, probabilities, confidence}`. Always include an `other/none` escape hatch; never threshold a Choice like a Noul (vendor jaggedness: same ticket `noul 0.22` vs `choice:no 0.99` observed).
- `score`: `{type:"score", instructions, criteria:[l0…ln] (required, 2–10, ordered)}` → `{score: float weighted mean 0..n-1, probabilities:{"0"…}, confidence, legend:{"0":…}}`. Legend keys are strings. "Danger 1–9" = 9-entry array mapped `0→1…8→9`; gate on **bands** (`score≥6 ∧ confidence≥0.6 → warn`), never `==` (rev.1's `1.99` vs all-`2` sample was tutorial jitter, not an invariant).
- `questions: minProperties 1`; IDs are not sent to the model but validate echo/`type` match on return.
- `confidence ≈ (n·max−1)/(n−1)` concentration stat — **not** P(correct). All `0.6/0.7` thresholds are placeholders; calibrate on 100–200 labeled samples (English questions + native content is a heuristic with vendor support, not a proven finding).
- Limits: **64k `state+all-questions` total AND 32k `state+longest-single-question`** (rev.1 quoted only 32k).
- Cost math holds: 476 tok → $0.000019992; ~1k/judge ≈ $0.00004. Latency: quote P50/P95 + region, not single numbers (rev.1's `70–500ms` vs `~1s` conflict). Judge+rank = 2 calls = 2× cost/latency — batch all **independent** questions into one call; rank (dependent) stays second. `5–18× vs Luna-5.6` is unsourced — drop or cite.
- Error taxonomy (missing in rev.1): `401/403` no-retry (key), `400/422` fix-shape, `429/529` backoff + `Retry-After`, `max_tokens_exceeded` split-and-retry, low-confidence → human review, judge-fail → **default-deny (copy-only)** — never blind-draft-and-fill.

### 1.2 jev-chat-jarvis pattern (conceptual clone)

`Capture (per-app adapter) → Judge (~1s) → Draft (3) → Re-rank → Overlay (danger/intent/3 ranked) → Fill (SET_TEXT/clipboard, never send).`

Copy: 3 independently-tested API cards (judge/reply/vision, inherit-if-blank); ~7 judge Qs (intent, danger score, urgency/should-reply noul+score, best-action choice, need, + rank); adapter-per-app; fill-only; local KB (notes tag-match ≤5 + contacts title-match + opt-in history ~30 de-duped, header `KB N · History M`); injection fence + echo-drop + backfill (their v0.1.5); de-AI prompt (anti-template, 12× own ≤60ch samples, temp ~1.2, 400/4000 tokens, strip numbering/quotes/`me:`/trailing `。`); call only on new `her` message; thinking off. Exact Q wording/numbers are app choices — re-derive from upstream `questions.py`/`JudgeClient.kt` at a **pinned commit**, do not treat §4 as verbatim.

### 1.3 Licensing / compliance

- MIT core: preserve `LICENSE`+`NOTICE` at a **pinned revision**; attribute in About + docs (`Based on … https://github.com/jev-chat/…`); no name/domain endorsement. Record MIT hash before copying Q wording/prompts.
- **GPL ban:** never bundle `PySide6-Fluent-Widgets`; React overlay only. Add `cargo deny check licenses` + `cargo audit` to Phase 1 gates (new `arboard`/OCR deps need license + binary-size + sandbox eval; OCR model downloads = fetched artifacts needing provenance).
- Privacy template: their `PRIVACY.md` (on-device OCR, text-only egress to user endpoints, no relay, one-click wipe). ClickyX has no `PRIVACY.md` — create one; must not contradict root `SECURITY.md:41-66` (which is stale on key storage — fix both together, §6).
- WeChat/banking exclusion intentional (`FLAG_SECURE` is Android-only — map to desktop equivalents or drop the term; §6).

---

## 2. ClickyX Gap Analysis (corrected — every "✅ reuse" now carries its caveat)

| Needs | Has today | Gap / correction vs rev.1 |
|---|---|---|
| Focused-window screenshot | `capture_focused_window` (**snake_case Rust** in `commands/screen_cmds.rs:23`; `bindings.ts:483` is the TS alias — rev.1 inverted this), `capture_cursor_screen` (rev.1 omitted), `capture_screens`; JPEG base64 | Reuse, but: **`ScreenConfig` (`config.rs:115`) is dead** — `capture.rs:63,122` + `auto_capture.rs:252,272,293,327` hardcode quality `85`, no `max_dimension` resize. Wire config or stop citing `1280/80`. **Wayland:** `xcap` focused-window is silent-X11-only; Wayland needs portal ScreenCast picker (no `is_focused` semantics) + per-session consent — `capture.rs` never branches on `display_server()` (`platform.rs:6`). **Flatpak:** ScreenCast/RemoteDesktop granted but interactive consent per session blocks headless auto-trigger. **macOS denied-TCC:** blank image, not error — needs denied-image path. **DPI:** physical px vs display points (Windows scale, macOS points-vs-pixels, §5). |
| Auto-trigger | `AutoCaptureEngine` (`screen/auto_capture.rs:49`): diff threshold, `interval_ms`, `max_cache:10` (~1–3MB), `auto-capture-frame` events | Reuse engine (title-hash session + `her`-diff) instead of new poller. Throttle: `Window::all()` + per-window geometry/a11y spawns per frame = CPU/spawn storm; cache + `display_server()`-aware throttle. |
| Text extraction | **Window/app-level only** a11y (`accessibility/mod.rs:40`; cmds `get_element_at_point`/`get_focused_element`/`get_accessibility_tree_snapshot`/`perform_accessibility_action` in `commands/agent_cmds.rs:379-403`; 50–500ms/subprocess; **0 tests**): Linux `children:[] value:None` (`linux.rs:162`), macOS `value:None` (`macos.rs:257`), Windows UIA `FromPoint` w/ rect fallback; **Wayland: `None`/`[]`/`Err` stubs** (`linux.rs:53,146,213,269`) | **Ladder corrected: vision-LLM on cropped JPEG is the MVP extractor; a11y yields title/class/pid/geometry only, never bubble text.** Native AT-SPI2/UIA/AX FFI is the real fix, not more subprocess. |
| Typed judge | `ai/{anthropic,openai}.rs`, `catalog.rs`, `AiConfig` + `merge_ai_config` (`ai/mod.rs:140`), `chat_completions_url` normalization (`ai/openai.rs:9`) | New `ai/jev.rs` + `JevConfig` + `merge_jev_config` with **`!v.is_empty()` guard** (current `merge_ai_config` overwrites with `""` — do not clone). **Routing:** `resolve_provider_for_model` (`ai/mod.rs:92`) defaults unknown → `openai`; `create_provider_for_model`/`get_default_model` only know 2 arms — add explicit `jev` arm or every Jev model burns OpenAI quota. **No `ai/app_contexts.rs` exists** (`ai/mod.rs:1-5` lists 5 mods; 0 grep hits) — rev.1's "extend VS Code/Figma contexts" is invented; create the module + injection API first, then add messaging contexts. |
| Draft-3 | `send_chat_message`/`chat_with_vision` (`commands/chat_cmds.rs:41,199`) — **stateless single-turn** (one `ChatMessage{user}`; history/KB/style never enter); tag strip+execute (`:59`); vision attaches to last user msg (`ai/openai.rs:55`); streaming leaks raw tags (P4 residual) | New Jarvis draft entry accepting `messages×N + background + style_samples` (or extend `chat_with_vision` with history param). **Disable `POINT` execution for Jarvis drafts** (render highlight-only) — `execute_guidance_tags` (`:66`) auto-clicks model text today and `OFFER` parses but never executes (`guidance.rs:110`, `chat_cmds.rs:126`) — decide Offer's fate. Exclude Jarvis from streaming or fix the leak. Scope concurrency per window-session like `useChat.ts:34` `sessionIdRef`. |
| Rank-3 | None | `jev.rs` second (dependent) call; batch independents in call 1. |
| Co-pilot panel | `WebviewWindow` overlay, `OverlayApp.tsx`, `overlay_show_*` (`commands/overlay_cmds.rs`), lifecycle `Armed→Completed→Missed` + sweep (`overlay/lifecycle.rs:4`), per-screen routing + `CoordinateNormalizer` (`overlay/screen_router.rs:111`, `screen/coordinate.rs:34`) | **Y-flip is live** (rev.1 said dead) via `chat_cmds.rs:83`. But `show_highlight`/`show_shape` (`overlay/mod.rs:467,494`) **bypass `AnnotationManager`** (no register, 6s thread-sleep hide) and lack `_on_screen` variants (`overlay_cmds.rs:155`); `useOverlay.ts:4` exposes no highlight/shape; `OverlayApp.tsx:611` prunes only cursors/rects/glows. Extend manager + hook + pruning, or document Jarvis-owned timeouts. **Overlay entry (`overlay/main.tsx:1`) has no `QueryClientProvider`/`AppProvider`** — `useJarvis`/toasts can't run there; keep panel in main window, overlay event-driven only. **Wayland:** absolute `.position/.inner_size` ignored by all compositors (need layer-shell — "validate placement" understates). **Capability glob:** `capabilities/default.json` `overlay` ≠ runtime `overlay-0…` (`window_manager.rs:43,109`) — needs `overlay-*`. Creation mixes logical (`:49`) vs `Physical*` (`:112`) — HiDPI mismatch live. **Tauri CSP `connect-src` (`tauri.conf.json:39`)** allows only clickyx/openai/anthropic/deepgram/elevenlabs — Jev hosts blocked for WebView fetch; proxy via Rust or extend CSP. |
| Fill-only | `InputSimulator` click/scroll + `click_background_platform`; `enigo 0.2` (`Cargo.toml:55`); `type_text` gated on `Active` (`type_mode.rs:156`); **no `arboard`/clipboard crate**; `click()` hits any coords incl. send (`cua.rs:78`); `perform_accessibility_action` forwards any `action` incl. `"press"` on Send (`agent_cmds.rs:396`) | New `jarvis/fill.rs` + clipboard dep (`arboard` + `xclip/xsel/wl-paste` fallback is Node-skill code, not a Rust path; add deb/RPM/Flatpak runtime deps). Per-OS: Win `SetForegroundWindow + Ctrl+V + restore HWND`; mac `activate + Cmd+V + restore`; X11 `windowfocus + Ctrl+V + restore`; **Wayland = copy-only v1** (no programmatic focus). Enforce in Rust: deny `Enter`/`press|click|submit` during Jarvis, deny send-region clicks, never reuse `InputSimulator::click` for fill; unit-test refusal. Fix `accessibility/linux.rs:379` single-call ydotool (still bug-#30 pattern; `cua.rs:446` already fixed to two calls); `scroll()` Wayland hard-`Err` (`cua.rs:411`); `wtype -k` (`type_mode.rs:165`) is key-mode — verify before citing as text fallback. |
| Session state | `useConversations.ts` + `conversations.enc` AES (`chat_cmds.rs:14`) | Jarvis session = normalized title-hash (lowercase, strip counts/CJK/space) with collision tests; encrypt KB/history (specify `kb.enc` path + key: reuse agent key explicitly or `KDF(agent_key,"jarvis-kb")` + rotation); add `jarvis_wipe` (overwrite + delete + fsync + emit). No `sessionStorage` for KB (draft-only pattern). |
| KB/contacts | None | JSON store, tag/title match only; default-off history ~30 with no-reabsorb dedup rule. |
| Settings (3 cards) | `get/update_ai_config` + `validate_openai_base_url`-before-persist + `persist_config_secrets` (`commands/ai_cmds.rs:43`) | Add `get/update_jev_config` + `test_jev_judge/test_jev_reply` + **`validate_jev_base_url`** (explicit `http(s)`, deny `file:/gopher:/ftp:`) enforced in update + import + `/jarvis/test`. |
| Secrets | `keyring 4.2`, `secret_store.rs` move-model (`SERVICE_NAME="clickyx"`), `secrets_in_keychain` (`config.rs:252`) | Touch **all four** fns (`migrate:135`, `hydrate:198`, `persist:262`, `strip:313`) + `redact_config_value` (`config_cmds.rs:195`) + import-refusal (`:258`) + **`reset_config` (`:293`) keychain delete** (today orphans secrets) + decide **1 vs 3 keychain keys** for judge/reply/vision inherit-if-blank. `get_config`/`get_ai_config`/`get_agent_config` echo plaintext by design (same-principal webview) — state the boundary (export-to-disk redacted) and fix stale `SECURITY.md:57`. Windows file fallback has no ACL (unix-only `0600`, `config.rs:458`). |
| Config plumbing | `AppConfig` (`config.rs:227`) + `update_config` allowlist (`config_cmds.rs:20`) | Add `jev`/`jarvis` arms to `update_config` or writes silently drop (critical). `#[serde(default)]` + `Default` + load-migration + export/import round-trip tests. |
| Catalog/selector | `ModelCatalog` (6 chat, `catalog.rs:32`), `fetch_openai_compatible` hardcoded openai (`:88`), `get_models(provider?)` (`ai_cmds.rs:13`), bridge `/models` static (`bridge.rs:683`), `ModelSelector.tsx:41` fallback `return hasAnyProvider` | Jev caps `["decide","judge","rank"]` (NOT `chat`) + **capability-aware filter or `get_jev_models`** + explicit `provider==="jev"` exclusion (today any Jev entry leaks into chat as soon as any key exists); `capabilities` currently unread on frontend. Query keys presence-booleans only (rule `P0-T2/M-7`). Decide bridge `/models` static vs merged. |
| Bridge | `bridge.rs` + `bridge_auth.rs:82` dangerous prefixes, 600/60s/IP limiter, Host allowlist, `workers(2)` (`bridge.rs:1434` — rev.1 said 1), `spawn_blocking` only at `:1044,1102` | New `/jarvis/analyze|/fill|/status|/test` = **dangerous** (screen + AI spend + input injection, same tier as `/click /screenshot /v1/*`) — token-always even when `bridge_auth_disabled`, rate-limited, host-allowlisted. Add **prefix not glob** (`"/jarvis"` exact-or-slash like `"/agent/"`; `is_dangerous_path("/jarvis/*")` is not a valid call). Decide `GET /status` dangerous (safe: token polling) vs read-only counts-only. Add `x-openclicky-token, x-bridge-token` to CORS `allowed_headers` (`bridge.rs:1396` allows only `AUTHORIZATION, CONTENT_TYPE` → preflight fails → users disable auth). Wrap capture/OCR/provider calls in `spawn_blocking` (sync `/screenshot` `:143` already starves workers; Jarvis analyze is heavier). Re-tier or justify open `/caption /notify` (toast-spoof via `window.show()+set_focus`, `:780`). State `[::1]` (bind is `127.0.0.1:32123`). Extend `test_is_dangerous_path_unit` + service tests (16 exist — not 0-test) incl. `/clicky` trap. |
| Voice/hotkeys | PTT presets, VAD/ducking/wake-word/handoff, `HotkeyInput.tsx`, global-shortcut, double-Ctrl type-mode | Trigger = hotkey + overlay button first; voice later. **Four divergent registries, no normalizer:** `App.tsx:171` (`Ctrl/Cmd+K` palette), double-Ctrl, PTT lowercase (`VoiceSettings.tsx:19`) vs `HotkeyInput` caps (`:32`) + `Ctrl+Option+Space` preset, browser mocks (`Ctrl+Shift+V` vs `ctrl+space`). **Default `Ctrl+Option` never registers on Win/Linux by design** (`lib.rs:173`, non-macOS skip) — default panel toggle dead on 2/3 OS. Pick Jarvis default away from all four (e.g. `Ctrl+Shift+J`), normalize case, validate dup-with-PTT; Wayland globals may be swallowed — overlay button is primary fallback. Emit `jarvis-state-changed` → invalidation (pattern `useAgents.ts:37`), never `refetchInterval` (`StatusBar.tsx:59` anti-pattern). |
| App contexts | **Does not exist** (see above) | Create `ai/app_contexts.rs` + injection API, then add Slack/Discord/Telegram/Teams. |
| Permissions | `permissions.rs` (TCC sqlite fail-closed `:139` — FINDINGS #34 largely fixed; Win registry fail-closed `:356`; Linux `pactl/pgrep` = availability, not consent; a11y `pgrep -x at-spi-bus-laun` truncated never matches) | **Enforce in Rust, not UI:** `require_jarvis_gates()` (`screen_recording && accessibility && !paused && !blocklisted`) at top of every `jarvis_*` + reused capture/a11y/fill-with-Jarvis-flag paths; typed `permission_denied`. Win screen/a11y always-`true` (no UIAccess manifest) — don't gate on vacuous checks. Linux needs portal `Desktop` request + `org.a11y.Bus` name-owned, not `pactl/pgrep`. macOS needs `sqlite3` + bundle-ID + Ventura generic-pane caveat. Onboarding (`OnboardingWizard.tsx:16`, 4 hardcoded steps) needs per-OS step lists + Jarvis consent (per-app enable, pause, blocklist, KB opt-in, what-was-read); remove stale `NSCameraUsageDescription` (`Info.plist:5`) or restore justification. |
| Store/stats/palette/status | Zustand `appStore.ts:31` (`attentionItems` + setter, **no reader** — `StatusBar.tsx:115` derives locally), `TodayStats` (`bindings.ts:408`, no Jarvis fields), toasts capped 10 + 4s dismiss | One path only: extend local derivation (keeps arch) or revive store (+ `jarvisRuns/jarvisDanger` selectors per `H-8`); toasts via `showToast` only. Palette: builtin entry (`CommandPalette.tsx:39`) — `registerPaletteItems` has no production callers. `Tab` type unchanged (settings+panel only); add `SettingsTabId|"jarvis"` + `SETTINGS_TABS` + `NAV_GROUPS` + `settings.sections.jarvis` ×4 + deep-link case (`App.tsx:207`) + handle-or-reject unknown `pendingSection` (today stale-forever, `SettingsTab.tsx:63`, `AppContext.tsx:68`). |
| i18n | `i18n/index.ts:26` (`fallbackLng:en`, DEV-only `saveMissing`), `locales/`: en/es parity (25 top-level / ~468 keys) vs **fr/ja deficit (8 top-level / ~70 keys, 17 sections + ~400 keys missing)** + stale extras (`connections.googleWorkspace`, `nav.connections`, `settings.sections.{agents,automations}`) | Add `jarvis.*`/`jev.*`/`settings.sections.jarvis`/palette/status/about keys ×4; delete stale keys same commit; judge internals never `t()`; add key-parity check (no gate exists; `test-setup` resolves en only). Backfill-or-scope (en+es + fallback) explicitly — unbudgeted otherwise. |
| Logs | 5MB single-backup rotation at startup only (`lib.rs:71`), `get_logs` raw (`system_cmds.rs:191`), `Always-on transcript` info-log (`lib.rs:329`), `AiError::Api` verbatim to UI/bridge, automation/usage JSON plaintext w/ titles | Log `len+model+tokens+cost` only; `redact_log_line()` in `get_logs`; bounded retention (e.g. 2×5MB) or state single-backup honestly; `declassify_error()` for all AI/bridge/agent returns; encrypt or de-title `usage_log.json`/`automation_runs.json` (`record_app_usage` fires from capture path itself, `capture.rs:110`); gate log-copy-to-clipboard (`SystemSettings.tsx:101`) with confirm. Screenshots: `AutoCaptureStatus.last_capture` ships raw JPEG to frontend (`types.rs:58`, `screen_cmds.rs:54`) with `pop_front`/`clear` no-zeroize (`auto_capture.rs:162,205`) — zeroize (in `Cargo.lock` transitively), gate or drop raw bytes; note macOS probe PNG deleted immediately (`permissions.rs:173`). |
| KB/history | None (only `conversations.enc`/`agents.enc` analogues; no wipe cmd) | Spec `kb.enc` path + key + schema + `jarvis_wipe` + default-off + title-hash normalize + no-reabsorb dedup (§3). |
| Clipboard | Zero Rust clipboard; Node skill (`clipboard-manager.js`) = `read` fullclip + preview + URL/email detectors (`permission_class system`), `Set-Clipboard` via `execSync` interpolation (fragile), "Analyze clipboard" fallback = unconfirmed secret intake | Fill: save orig → set draft → paste → **restore orig within N s** (or clear); never log bytes; secret-scan (key/password regex, EN+CN) forces manual-confirm; `arboard` or `spawn`-args only. Scope skill `read`, cap preview. |
| Packaging | MSI/EXE, DMG/APP, DEB/AppImage, Flatpak (prebuilt binary, `yml:21`), RPM (binary+desktop only), deb `depends` has `libxdo3` (lib, not CLI), no `xdotool/wtype/ydotool/xclip/wl-clipboard`, Flatpak has ScreenCast/RemoteDesktop/a11y-Bus but **no Secrets portal** (keyring fails), no `ydotoold`, `signingIdentity:null`, external signing secrets unset | Add runtime deps (deb/RPM/Flatpak modules or portal-only design); Wayland fill = RemoteDesktop-with-consent or unsupported-in-Flatpak (decide); keyring Secret-portal path or encrypted-file fallback; signed-DMG + UIAccess story for capture/fill/overlay; E2E matrix signed-vs-unsigned, admin-vs-standard, X11/Wayland/Flatpak. |
| Deps | `image {default-features:false, features:["jpeg"]}` (`Cargo.toml:52`) | `imageops::crop` on `RgbaImage` OK; verify `crop_imm`/resize + **PNG portal screenshots fail jpeg-only decode** — keep as blocker check. `reqwest` per-request `Client::new()` (`bridge.rs:543,641`) vs builder+timeout (`ai/openai.rs:99`) — share one client with timeout/retry in `JevClient`. |

Verified absent: Jev/Jarvis code, OCR crate, clipboard crate, KB store, `PRIVACY.md`, Jarvis E2E/visual, `jarvis_cmds.rs`.

---

## 3. Proposed Architecture (with corrected wiring)

```text
┌─ Frontend ─────────────────────────────────────┐
│ JarvisSettings.tsx (3 cards + Test) │ JarvisPanel.tsx (main window) │
│ JarvisKnowledgeEditor.tsx (name locked) │ CommandPalette + StatusBar + HotkeyInput │
│ useJevConfig (exports JEV_CONFIG_KEY) + useJarvis (presence-booleans) │
└──────────────────────┬─────────────────────────┘
                       │ bindings.ts typed + deterministic browser fixtures
┌─ Rust ───────────────▼─────────────────────────┐
│ ai/jev.rs (JevClient judge/rank, shared reqwest client) │
│ ai/app_contexts.rs (NEW module + injection API) │
│ jarvis/{mod,questions,kb,extract,fill,blocklist}.rs │
│ commands/jarvis_cmds.rs (pub mod + re-export in commands/mod.rs:4 + generate_handler! lib.rs:537) │
│ bridge.rs /jarvis/* (dangerous prefix "/jarvis") │ config.rs JevConfig+JarvisConfig │
│ secret_store.rs (4 fns + redaction + reset-wipe) │ cua.rs fill (no click reuse) │
└────────────────────────────────────────────────┘
```

### 3.1 Data flow (fail-closed)

```text
1. Trigger: hotkey / overlay button (primary; Wayland-safe) → AutoCaptureEngine title-hash diff (second) →
   voice-handoff (later). Emit jarvis-state-changed → invalidation, no polling.
2. Gate (Rust): require_jarvis_gates() = permissions && !paused && !blocklisted(blocklist.rs:
   lowercase/strip-counts/CJK/space; WECHAT|微信|wechat.exe|banking|*payment* + user list; redact refusal,
   never log title) else permission_denied. Check BEFORE capture in capture_focused_window + extract.rs.
3. Extract: a11y title/geometry (free, never bubble text) → focused-window JPEG crop → vision-LLM
   [{side,text}] (MVP) → OCR crate later. Title-hash → session. Denied-TCC blank-image path included.
4. Judge: ONE batched call (independent Qs) → {intent, danger 0-8→1-9 bands, should_reply, best_action, need}.
5. Draft: Jarvis entry (messages×N + background + 12×≤60ch style) with fence
   <<<untrusted-screen>>>…<<<end>>>, money-ban, POINT-execution disabled (highlight-only), tags stripped
   for display; streaming excluded.
6. Rank: second call (dependent) → sorted % + winner. detect_injection()==true → copy-only.
7. Display: lifecycle-managed annotation (Armed+timeout+sweep, per-screen, Physical/logical units
   declared per boundary; primary-only assumption removed) + panel (danger, intent, 3×%, KB N·History M,
   what-was-read expander).
8. Fill (Rust-enforced): focus + clipboard-save → set draft → Ctrl/Cmd+V → restore orig (or clear) +
   focus restore. Refuse on: money-noul indeterminate/judge-down (copy-only), injection flag, blocklisted
   window, secret-scan hit w/o confirm. NEVER Enter / NEVER send-click / NEVER a11y press|click|submit.
```

Fallbacks (fail-closed): judge-down → copy-only (no blind-fill); rank-down → draft order + Recommended; <2 → skip rank; extract-down → manual "Analyze once"; fill-down → copy + redacted error.

### 3.2 File checklist (names locked)

- New Rust: `ai/jev.rs`, `ai/app_contexts.rs`, `jarvis/{mod,questions,kb,extract,fill,blocklist}.rs`, `commands/jarvis_cmds.rs`.
- Edit Rust: `ai/mod.rs` (`pub mod` ×2 + jev arm + guarded merge), `ai/catalog.rs` (Jev entries + cap filter or `get_jev_models`), `config.rs` (structs + migration + redaction list), `secret_store.rs` (4 fns + reset-wipe), `commands/{mod,config_cmds(ai/jev validators + allowlist arms + redaction + reset),chat_cmds(history draft entry + POINT-off),cua_cmds,agent_cmds,overlay_cmds(_on_screen)}`, `lib.rs:537` handler, `bridge.rs` (4 routes + CORS headers + `spawn_blocking` + workers note) + `bridge_auth.rs` (`"/jarvis"` prefix + tests), `screen/capture.rs` (config wiring or field removal + denied path), `overlay/*` (manager+router+capability `overlay-*` + unit declaration), `permissions.rs` (portal/a11y-name checks; no vacuous gates), `Cargo.toml` (clipboard + image-feature verify + shared client), `tauri.conf.json` (`connect-src` Jev hosts).
- New frontend: `hooks/useJevConfig.ts` (+`JEV_CONFIG_KEY`), `hooks/useJarvis.ts` (+ tests for both), `components/SettingsSections/JarvisSettings.tsx`, `components/JarvisPanel.tsx`, `components/JarvisKnowledgeEditor.tsx`, `e2e/jarvis.spec.ts` (mocked-panel only).
- Edit frontend: `bindings.ts` (types + 7 wrappers + fixtures for `jarvis_analyze/fill/status/test_judge/test_reply` + `get/update_jev_config`), `AppContext.tsx` (toasts only), `SettingsTab.tsx` (`"jarvis"` id + tab + group + unknown-section reject), `App.tsx` (deep-link case), `CommandPalette.tsx` (builtin entries), `StatusBar.tsx` (one derivation path), `HotkeyInput` usage (dedicated row + dup validation), `ModelSelector.tsx` (chat-cap allowlist, deny-default, bool keys), `useOverlay.ts` (+highlight/shape + tests), `AboutDialog.tsx` (MIT attribution + `about.*` keys), `global.d.ts` (no ad-hoc `__JARVIS_*`), 4 locales (add + delete stale + parity check), `overlay` event listeners (prune highlights/shapes).
- Docs: `BRIDGE_API.md`, `CONFIGURATION.md`, `SETUP.md`, `CHANGELOG.md` (one `[Unreleased]`), `AGENTS.md` (file map + tests + build status re-baselined), `PROJECT_SPEC.md:349` (counts), `SECURITY.md` (keychain-first + `get_*` echo boundary + tiers + clipboard + KB), new `PRIVACY.md`.

---

## 4. API & Prompt Design (verify-then-build)

Presets (connectivity-test before save; residency warning for Bocha):

| Preset | POST | Model | Key |
|---|---|---|---|
| OpenRouter | `…/api/alpha/decisions` (compat `…/api/v1/systemone`) | `typesafe/jev-1.13` | OpenRouter |
| TypeSafe | `…/v1/systemone` | `jev-1.13.0` / `jev-latest` | TypeSafe |
| Bocha | `https://jev.bocha.cn/v1/systemone` | `bocha-jev-v1` | Bocha (+ CN warning) |
| Vercel | `…/typesafe/v1/systemone` | `typesafe-ai/jev` | Gateway (`/v1/evaluate` ≠ same format) |
| Zen | `https://opencode.ai/zen/v1/systemone` | `jev-1.13` (`-free` limited) | Zen |
| Custom | user (`validate_jev_base_url`) | user | user |

Reply via existing providers (DeepSeek-compat through `openai_base_url` normalization, not hardcoded URLs).

Questions (draft — pin upstream commit, then calibrate 100–200 samples; never port Noul thresholds to Choice; always `other/none` hatch):

1. `intent` (choice) 2. `danger` (score×9, `0→1…8→9` bands) 3. `need` (choice) 4. `should_reply` (noul bands `>0.7/>0.4`) 5. `best_action` (choice: reply/wait/deflect/escalate/ignore) 6. `tension` (score) 7. `rank` (choice over 3, call 2).

State: `{messages×10, background{relationship, ≤5 notes, contact}, history(30, deduped, no-reabsorb)}`. Draft: anti-template, `12×≤60ch` samples, `1.2/400 (4000 thinking)`, money-ban, fence, echo-drop, tag-strip.

---

## 5. Cross-Platform Plan (no silent-parity claims)

| Piece | Windows | macOS | Linux |
|---|---|---|---|
| Capture | xcap focused (DPI px declared) | xcap + TCC gate + denied-blank path; signed DMG for TCC sanity | X11 silent; **Wayland = picker/token only** (branch `display_server()`); Flatpak consent UX |
| Extract | a11y title/geom → vision MVP | same (N×osascript cost; `cliclick` optional) | same (X11; Wayland stubs until FFI) |
| Fill | `SetForegroundWindow + Ctrl+V + restore` (UIAccess caveat for elevated wins) | `activate + Cmd+V + restore` (notarization+TCC hardest combo) | X11 `windowfocus + Ctrl+V + restore`; **Wayland copy-only v1** |
| Overlay | WebviewWindow | +`macOSPrivateApi`, entitlements, signing-gated E2E | best-effort centered (no layer-shell); `overlay-*` perms; compositor-tested |
| Permissions | registry (mic/cam fail-closed); screen/a11y always-true → don't gate on them | TCC fail-closed + `sqlite3` + bundle-ID + generic-pane request | portal `Desktop` + `org.a11y.Bus` owned (not `pactl/pgrep`); per-DE request |
| Deps | — | — | deb/RPM `Requires` + Flatpak modules: `xdotool|wtype|ydotool|wl-clipboard|pipewire|portal` (`libxdo3` ≠ CLI); `ydotoold` story; Secrets-portal or file fallback |

Hotkeys: per-OS defaults (no `Option` off-mac); Jarvis `Ctrl+Shift+J` candidate (away from `Ctrl+K`, double-Ctrl, PTT); normalize case; dup-check; overlay button primary on Wayland. CSP: extend `connect-src` or Rust-proxy only. Enumeration: throttle + cache, never spawn/frame.

---

## 6. Privacy & Safety (runtime-enforced, not prose)

1. **Fill:** dedicated `fill.rs` (focus+paste+restore); hard-deny `Enter`, send-region clicks, a11y `press/click/submit` during Jarvis; unit-test refusal; never `InputSimulator::click` for fill. Fix `linux.rs:379` ydotool + `cua` scroll + `wtype -k` before citing them.
2. **Injection:** fence delimiters in `questions.rs`/`extract.rs`; `detect_injection()` → copy-only; strip screen-derived tags before `execute_guidance_tags`; Jarvis excluded from streaming until leak fixed.
3. **Money:** `noul` + keyword/regex (EN+CN) + blocklist in `fill.rs` (not prompt-only); judge-down/indeterminate → copy-only (fail-closed; rev.1's blind-draft-fill was fail-open).
4. **Blocklist:** `jarvis/blocklist.rs` before capture (normalize + hardcode `WECHAT|微信|wechat.exe|banking|*payment*` + user list; redact refusal); stop `record_app_usage` title logging on match; drop/map `FLAG_SECURE` honestly per OS.
5. **Gates:** `require_jarvis_gates()` in Rust for all `jarvis_*` + Jarvis-flagged capture/a11y/fill; UI gate is UX only.
6. **Secrets/logs:** keychain-first + `SECURITY.md` fix + Windows ACL/file-fallback doc + KB key plan + `wipe_secrets`; `redact_log_line()` + `declassify_error()`; transcript/content out of logs; bounded rotation honestly stated; `usage_log`/`automation_runs` encrypted or de-titled; clipboard save/restore + secret-scan + no-`execSync`.
7. **KB:** `kb.enc` + schema + `jarvis_wipe` + default-off + hash-normalize + dedup (all specified, none "future-tense").
8. **Supply chain/attribution:** pinned MIT + `cargo deny/audit` gates + per-preset residency + About/`LICENSE`/`NOTICE`, no GPL.

---

## 7. Phased Delivery (re-estimated — prior plan ~1.5–2× optimistic)

**Phase 0 — Confirm (this report).** §9 decisions.

**Phase 1 — Jev provider (M, not S–M):** `ai/jev.rs` + triple config + keyring (4 fns + reset) + catalog/cap-filter + `ModelSelector` exclusion + `resolve_provider` arm + `update_config` arms + `validate_jev_base_url` + `test_judge` + Settings card + command tests + `cargo check/test --all-features` + `clippy --all-features --tests -D warnings` + `fmt --check` (in `src-tauri/`) + `npm run build/lint/test` + `cargo deny/audit` + CSP decision. Exit includes all lint gates (rev.1 omitted them here).

**Phase 2 — Jarvis manual (L, 10–15d, not 5–8d):** extract ladder (a11y-title → vision) + batched judge + draft-3 + rank + lifecycle panel + Fill/Copy + KB v1 (encrypted + wipe) + 4 `/jarvis/*` dangerous routes + `useJevConfig/useJarvis` + i18n (backfill-or-scope decision) + `e2e/jarvis.spec.ts` **mocked-panel only** (open/3-cards/%/copy/pause/refusal with stubbed bindings) + `ci.yml:84` edit to include it (or mark manual-only like visual) + 6-config manual matrix (X11/Wayland, TCC allow/deny, Win focus-restore) + invalid-`update_config` round-trip tests.

**Phase 3 — Auto + polish (3–4wk if calibration stays):** `AutoCaptureEngine` title-hash trigger, rank-% UI, style samples, injection/money gates, attention/stats/palette/status/About/i18n-parity, `test:visual:update` baselines first (7 missing baselines committed before Jarvis snapshots; chromium-only, threshold `0.002`), full docs (`BRIDGE_API/CONFIGURATION/SETUP/CHANGELOG(one Unreleased)/AGENTS/PROJECT_SPEC:349/SECURITY/PRIVACY`), permissions/onboarding per-OS steps, packaging deps, signing matrix.

**Phase 4 — Deferred:** Rust OCR eval, per-app adapters (Slack/Discord/Telegram/Teams; never WeChat), AT-SPI2/UIA/AX FFI, calibration harness (`tools/jev/` equiv), Tauri WebDriver real-capture E2E, Wayland layer-shell overlay.

---

## 8. Test & Verification Plan (commands that actually gate)

- Rust (in `src-tauri/`): `cargo check`, `cargo test --all-features` (re-baseline: ~171 `fn test_` lines vs 139 claim; 15 frontend test files vs 12 claimed; `PROJECT_SPEC:349` "30+ cases" stale), `cargo clippy --all-features --tests -- -D warnings` (`ci.yml:102`; report's bare `clippy -- -D warnings` wrong), `cargo fmt --check`, `cargo deny check licenses`, `cargo audit`. New: Jev parse/legend/bands/builders, KB match/wipe/hash, fill refusal, `is_dangerous_path` **extended** (`/jarvis/analyze|/fill|/status|/test` + `/clicky` trap — harness exists, ~16 tests, not 0-test), command validate-persist-redaction, `generate_handler!` registration (`lib.rs:537`, not `:600`), CORS headers, `spawn_blocking` for new routes. Highest-risk 0-test area is **`commands/` (all 13 files)** + `accessibility/` — where the 5 new commands land.
- Frontend: `npm run build` (tsc+vite), `npm test` (re-baseline case count; `vitest: not found` without install), `npm run lint`, `useJarvis.test.ts` + `useJevConfig.test.ts` (bool keys, mutations incl. empty-key/error/refusal/fill→copy, `jarvis-state-changed` via `useTauriEvent`, no `useState+useEffect+invoke`, no `refetchInterval`), `useOverlay` highlight/shape cases, `test-setup.ts` per-test Tauri stubs, `global.d.ts` for overlay params, i18n parity check.
- E2E/visual: `npm run test:e2e` (all) vs hardcoded `ci.yml:84` trio (edit or mark manual); `e2e/jarvis.spec.ts` mocked-only (browser E2E **cannot** reach xcap/enigo/clipboard/second `WebviewWindow` — "E2E on all 3 OSes for capture/fill" infeasible; real capture = manual matrix + WebDriver follow-up); `npm run test:visual:update` to commit 7 missing baselines, then Jarvis snapshots (name file: `visual.spec.ts` vs new file explicitly; `package.json:14-16`).
- Manual: OpenRouter + direct keys; CN+EN; danger bands; `usage.cost` (OR-only) + tokens; X11/Wayland, TCC allow/deny, Win admin/standard, Flatpak, signed-vs-unsigned DMG.
- CI: fire-and-forget — full matrix for Rust+frontend+E2E (`gh workflow run "CI/CD" --ref master` full, not `-f skip-check/skip-linux` fast-path), `ci-v2` wedge/bump note (`ci.yml:20`), `pip install pyyaml` before YAML validation, single squashed commit.

---

## 9. Open Questions (expanded — need calls before build)

1. Scope: Track 1 / Track 2 / both (recommended)?
2. Reply default: Claude/GPT-4o or DeepSeek-compat preset?
3. Extract: a11y-title → vision MVP (recommended, zero deps) vs Rust OCR now?
4. Clipboard: `arboard` + CLI fallback (recommended) vs CLI-only? Wayland copy-only v1 accepted?
5. Trigger: manual hotkey+button MVP (recommended) vs auto-engine day one?
6. Allowlist: Slack/Discord/Telegram/Teams first; WeChat/banking hard-excluded — confirmed?
7. Secrets: 1 keychain key (judge-inherit) vs 3 (judge/reply/vision)? KB key: reuse agent key vs `KDF(agent_key,"jarvis-kb")`?
8. Bridge: `GET /jarvis/status` dangerous (token polling) vs read-only counts-only?
9. i18n: backfill fr/ja 17 sections now vs en+es + fallback + follow-up?
10. Privacy/attribution: new `PRIVACY.md` + About + README + settings footer OK? Bocha CN-residency warning accepted?
11. Quality gates: `cargo deny/audit`, visual-baseline commit, `ci.yml:84` edit, `CHANGELOG` dedup — all approved?

---

## 10. Effort Estimate (revised — do not use rev.1 numbers)

| Track | Touched | Risk | Estimate |
|---|---|---|---|
| Jev provider | ~10 Rust + 4 frontend + keyring/redaction/CSP/docs | Low-Med (HTTPS JSON + routing/selector/config surgery) | **M** |
| Jarvis manual | ~14 Rust + 9 frontend + bridge/auth + i18n + mocked-E2E + 6-config matrix | Medium-High (extract→judge→fill, clipboard dep, permissions, packaging) | **L (10–15d)** |
| Auto + polish + calibration | diff trigger, guards, store/palette/status, baselines, full docs, per-OS onboarding, hardening | High (matrix + calibration + sandbox) | **L–XL (3–4wk)** |

No cloud/telemetry/lock-in. Bridge additive, dangerous-tier only.

---

## Appendix A — Gaps fixed in rev.1 (kept)

A11y ladder, clipboard dep, keyring model, `ModelSelector` guard, `/jarvis/*` dangerous, score 0-index + pinning, unverified paths + batching, lifecycle/`AutoCaptureEngine`/contexts/tags/voice/collisions/store/permissions/packaging/redaction/lint/docs/estimates.

## Appendix B — Gaps fixed in rev.2 by 6 subagents (all points of view)

- **Backend:** `ai/app_contexts.rs` phantom (create, don't "extend"); `capture_focused_window` snake_case + cursor variant; `ScreenConfig` dead (hardcoded 85); clipboard needs real dep; `resolve_provider` misroutes to OpenAI; `update_config` allowlist drops new fields; secret-store 4-fns + redaction + reset-wipe; CORS token headers; `workers(2)`; Y-flip live but highlight/shape bypass manager + no `_on_screen`; `merge_ai_config` empty-overwrite; a11y window-only/`value:None`; `linux.rs:379` ydotool single-call; chat single-turn; catalog/`get_models`/bridge-`/models` divergence; `lib.rs:537` + `commands/mod.rs`; `validate_jev_base_url`; `reset_config` orphans; `image`-crop nuance; TCC #34 largely fixed (re-verify); `wtype -k` suspicion; shared `reqwest` client.
- **Frontend:** `ModelSelector` deny-default + cap-gate + bool keys; 3× `["ai_config"]` copies → exported `JEV_CONFIG_KEY` + invalidation chain; `pendingSection` stale + deep-link allowlist + `SettingsTabId|"jarvis"` + builtin palette (registry unused in prod); `useOverlay` +highlight/shape + lifecycle prune + tests; overlay entry has no providers (panel in main window, overlay events only); `bindings.ts` `undefined` fallthrough → deterministic fixtures + `test-setup` stubs; store bypass (one path only); hook-test content plan; `useChat`/`useConversations` non-query caveat (streaming/disk exceptions; KB via backend-encrypted commands, never `sessionStorage`); fr/ja 70/468 + stale extras + parity check; 4 hotkey registries + dead default + `Ctrl+Shift+J` + normalization; locked names (`JarvisSettings/JarvisPanel/JarvisKnowledgeEditor`); `AboutDialog` slot; `Tab` unchanged; `AgentHUD`/`UpdateBanner` explicitly uncoupled; E2E/visual baseline reality.
- **Security:** fill runtime-enforced (deny Enter/send-region/`press|click|submit`, no `click` reuse, refusal test); guidance-tag auto-click sink (POINT-off, fence, strip, streaming exclude); money fail-closed (judge-down → copy-only; Rust keyword gate EN+CN); blocklist impl before capture + `record_app_usage` silence + `FLAG_SECURE` mapping; `require_jarvis_gates()` in Rust (Linux portal/`org.a11y.Bus`, no vacuous Win gates); `SECURITY.md` stale + `get_*` echo boundary + 1-vs-3 keys + Win ACL + key-beside-ciphertext + `wipe_secrets`; redaction field list + `usage_log`/`automation_runs` plaintext; transcript/`get_logs`/rotation-startup-only/`AiError` verbatim fixes; bridge caption/notify re-tier + glob→prefix + status-tier + uniform-limiter + CORS + sync-capture + `[::1]`; JPEG/config lie + raw-bytes + zeroize + probe-PNG note; `kb.enc` spec; clipboard restore + scan + no-`execSync` + skill scoping; pinned MIT + `deny/audit` + residency; worker/glob/status/stats/`PRIVACY`-vs-`SECURITY`/log-copy/token-hygiene/TCC-probe minors.
- **Cross-platform:** Wayland silent focused-capture impossible; Flatpak consent; TCC-blank; DPI units; a11y per-OS latency/stubs; enigo/ydotool/wtype 3-behavior split + `linux.rs:379` + scroll-`Err` + `wtype -k`; clipboard zero-Rust + per-OS APIs + missing packaged CLIs; focus+paste+restore per-OS + Wayland no-focus; overlay transparency (logical/`Physical*` mix, `overlay-*` glob, Wayland layer-shell, unsigned/TCC); permissions daemon≠granted (Linux portal, Win always-true + no UIAccess manifest, mac sqlite3/bundle-ID/Ventura pane); onboarding per-OS steps + Jarvis consent + `NSCamera` leftover; signing premature (DMG/UIAccess/portal matrix); Flatpak prebuilt + CLIs + Secrets-portal; DPI split (fixed normalizer vs broken creation + primary-only assumption); hotkey default dead off-mac + Wayland swallow; CSP `connect-src`; `image` jpeg/PNG; enumeration cost.
- **AI-API:** Zen `/zen/v1/systemone`; direct-vs-OR namespaces (`jev-1.13`→400 direct); Bocha `/v1/systemone` verified; Vercel `/typesafe/v1/systemone` verified + `/v1/evaluate` ≠ same; OR doubled-prefix bug; envelope OR-only fields; 64k+32k limits; score-sample jitter; schema optionality (`noul` bare OK, choice/score required, `null` values); `other/none` hatch; confidence formula; pinning inversion fix; P50/P95 latency; English-heuristic + 100–200 eval; fanout note; draft numbers need pinned cites; error taxonomy.
- **QA/docs:** 3-OS capture E2E infeasible (browser-only, ubuntu-only trio, single-chromium, separate overlay entry) → mocked-panel + manual matrix + WebDriver follow-up; 7 visual baselines missing + manual-only gate; `clippy --all-features --tests` + `src-tauri/` dir; `ci.yml:84` hardcoded trio; baselines drifted (15 files, ~171 fns); `bridge_auth` 16 tests (extend, don't duplicate); `commands/` 0-test (5 new cmds need tests); `workers(2)`; fr/ja 8/25 top-level deficit; `AGENTS/PROJECT_SPEC:349/SECURITY` docs; estimates ×1.5–2 (deps/migrations/matrix unbudgeted); Phase-1 lint omission; CI dispatch/wedge/`pyyaml`/`lib.rs:600→537`/`CHANGELOG`-dedup/`test:e2e`-vs-`visual` minors.
