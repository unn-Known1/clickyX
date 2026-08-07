# Comparison: docs/REVIEW_FINDINGS.md vs docs/EFFICIENCY_AUDIT.md

> **Date:** 2026-08-07
> **Purpose:** Cross-reference the two audit documents, reconcile overlaps, resolve conflicts, and record which REVIEW_FINDINGS items are still live in the current codebase.

---

## 1. What each document is

| | `docs/REVIEW_FINDINGS.md` | `docs/EFFICIENCY_AUDIT.md` |
|---|---|---|
| **Focus** | **Functional correctness** — bugs, dead code, broken features, contract mismatches, data loss | **Performance + smart features** — CPU wakeups, IPC/polling waste, allocations, latency optimizations, product-level smarts |
| **Basis** | Full read-through of `src-tauri/src` (~12k LOC) + `src/` (~5k LOC); contract cross-checks (bindings ↔ commands ↔ bridge ↔ emitted/listened events) | Full read-through of Rust (~15.2k LOC) + TS (~23.4k LOC) |
| **Severity system** | 🟥 CRITICAL / 🟧 HIGH / 🟨 MEDIUM / 🟩 LOW | Priority-ranked tables (runtime waste, correctness leaks, quick wins, phases) |
| **State** | Stale — verified fixes below | Current (against working tree) |
| **Unique sections** | Functional-gap matrix, test-coverage gaps, "Verified-OK (worth preserving)" | Top-10 quick wins, roadmap (5 phases), "risk of draw" roadmap, remaining platform items (§7) |

**Overlap is substantial but not complete.** Roughly 30 of REVIEW_FINDINGS' ~60 items have an efficiency/smarts analogue in EFFICIENCY_AUDIT; the two documents were written independently and confirm each other on the substructural runtime issues.

---

## 2. Overlapping findings (both documents flag the same root cause)

| REVIEW_FINDINGS | EFFICIENCY_AUDIT | Root cause (current status) |
|---|---|---|
| **#1** — always-on VAD `Handle::try_current()` on a `std::thread` | **§1.1** — same, verified | STILL LIVE — retrograde raw-thread + `try_current` (`pipeline.rs:461,534`); always-on transcription dead |
| **#2 / #3** — overlay windows not created at startup; annotation lifecycle unwired | **§1.3,** §S13 | FIXED — windows created at startup (`lib.rs:399-401`); lifecycle wired (`overlay/mod.rs:204-231`); manager sweep runs |
| **#9** — overlay fronts listen to events Rust never emits (incl. `audio-level-update`) | **§1.4** — Waveform never gets data → 60 fps fallback | STILL LIVE — `audio-level-update` STILL never emitted (0 hits in `src-tauri`); several overlay events dead |
| **#11 / #5** — VAD ring buffer re-appends ~224 duplicated samples per 50 ms; unbounded growth / garbled STT | **§1.2, §A2** — PTT also only returns last 64 ms tail | STILL LIVE — same ring design; no per-consumer cursor in VAD loop |
| **#14** — cron re-fires ~60×/matched minute (no `last_run` in cron branch) | **§1.5, §D6** | STILL LIVE — `automation/mod.rs:114-153` cron branch still ignores `last_run` |
| **#21(a)** — `Runtime::new()` per voice interaction (blocks threads, may panic in async context) | **§A1** | STILL LIVE — both pipeline paths (`pipeline.rs:179,231`) |
| **#26/#40** — bridge routes block on one slow call (Mutex held across provider HTTP, `.workers(1)`); **#25** — preflight (OPTIONS) auth order | **§B7, §B17** | STILL LIVE — blocking work inline in async handlers; single-worker runtime |
| **#27** — MCP re-spawns per call, no timeout, no keep-alive | **§B6** | STILL LIVE — `timeout_secs: 30` is a per-poll value, not a stdio guard; re-spawn per call |
| **#37** — `get_models` live network per call, silently empty on 404 | **§B12** | STILL LIVE — model catalog rebuilt per call |
| **#44 / #45** — config file killed: fresh `reqwest::Client` per request (STT/TTS/bridge) | **§A8, §B6** | STILL LIVE |
| **#57** — duplicate AI-config query keys `["ai-config"]` vs `["ai_config"]` | **§F5** | STILL LIVE |
| **#28** — auto-capture diffs after full JPEG decode; `last_time` only on diff | **§S1/S2/S3** | STILL LIVE |
| **#29** — "all" capture off-(0,0) stitched with `.max(0)` clamps | **§S5** | STILL LIVE |
| **#36** — HiDPI/logical-vs-physical in overlay multiplex | **§S12** | STILL LIVE |
| **#43** — dead delta-update / `AutomationEngine::start_ticking` | **§D9** | STILL LIVE (dead code) |
| **#3-in-efficiency** — overlay windows initial state overlap | **§1.5** | FIXED (see matrix) |

---

## 3. Unique to REVIEW_FINDINGS.md (functional / correctness only)

Items that have **no analogue** in EFFICIENCY_AUDIT (current fix-status verified in code):

| # | Finding | Current status |
|---|---|---|
| #5 | Bridge agent lifecycle (`/agent/{slug}/run`, `/create`, `/stop`) were stubs that never executed | FIXED — `bridge_run_agent` now executes; `commands::spawn_agent_run` called at `lib.rs:349` (automation) |
| #6 | File-attach truncate slicing `&content[..10000]` could panic (non-char-boundary) | FIXED — `commands.rs:2065-2068` now uses `.char_indices().nth(10000)` |
| #7 | Saving AI settings wipes all voice/STT API keys | FIXED — `AiProviderSettings.tsx:78-89` merges `preservedKeys` with new keys |
| #8 | Frontend invokes `get_app_usage_log` / `clear_app_usage_log` / `get_automation_runs` — none existed | FIXED — all three now defined (`commands.rs:1368,1379,1412`) |
| #10 | StatusBar meter divided `rms/100`; backend clamps 0..1 → meter never lit | FIXED — `StatusBar.tsx:56` uses `rms` directly |
| #12 | stop/archive doesn't stop in-flight run; in-flight completion overwrites state | PARTIAL — stop/archive flip state + save + emit (`commands.rs:1755-1795`), but the scheduled provider call has no cancellation token / post-completion state guard |
| #13 | OpenAI streaming hardcoded `/v1/chat/completions` → double-`/v1` 404 for self-host | FIXED — `openai.rs:16-20` now routes through a shared `api_url()` with `/v1` dedupe |
| #42 | `install_update` never verifies `signature`; Linux `deb`/`rpm` just `xdg-open`s and reports success | STILL LIVE — `signature` param accepted (`updater.rs:27`) but never checked; `deb`/`rpm` paths use `xdg-open` |
| #16 | `get_today_stats` counts all history, not today | FIXED — day-filtered against "today" (`commands.rs:712-727`) |
| #17 | `transcribe_audio` sync cmd + `try_current()` always failed | FIXED — now a `pub async fn` (`commands.rs:744`) |
| #18 | `ptt_hotkey` setting had no effect | FIXED — hotkey bound in `lib.rs:94-97` |
| #19 | Skills empty in installed builds (`CARGO_MANIFEST_DIR` path) | FIXED — `skills_dirs()` now derives from config/`#19` source path + fallbacks (`skills.rs:15-29`) |
| #20 | Vision images attached to every user message | FIXED — attached to last user message only (`anthropic.rs:33`, `openai.rs:22`) |
| #22 | AssemblyAI poll had no `.timeout()` | PARTIAL — `reqwest` default bound applies; no explicit per-request timeout |
| #23 | Codex spinner; `send_rpc` broken frame; no stderr drain | STILL LIVE (dead-but-bounded) |
| #24 | Edge OpenAI-Realtime TTS were inert stubs | PARTIAL — `speak_edge`/`speak_openai_realtime` still `Err("...pending")` (`tts.rs:159`, `:77`), `speak_system` real |
| #30 | Wayland `ydotool` malformed single command | STILL LIVE — `cua.rs:155-160` still `mousemove -- x y click 0xC0` as one invocation |
| #31 | per-call `InputSimulator` defeats rate limiting | STILL LIVE (matches EFFICIENCY §2.2 CUA finding) |
| #34 | TCC `auth_value=2` any-row-accept semantics | PARTIAL — noted in §7 remaining items (M4); no fix yet |
| #35 | Linux perms "daemon present" ≠ grant | STILL LIVE (by design) |
| #38 | in-app log viewer parses `|` separators back doesn't produce | STILL LIVE |
| #39 | `clear_logs` tails / deletes open file | STILL LIVE |
| #40 | `/health` not exempt; `Auth` wrapped after CORS → token-mode preflight OPTIONS gets 401 without CORS headers | STILL LIVE — `bridge.rs:1362-1372` |
| #41 | update `available:true` + `download_url:None` | STILL LIVE |
| #45 | No UI to enable bridge token (unauth'd default) | STILL LIVE |
| #46 | SSE parser drops trailing partial line | STILL LIVE |
| #48 | guidance regex nested-label phantom POINTs / `]` residue | STILL LIVE |
| #49 | gen3d filename from raw prompt chars | STILL LIVE — formFileName unvalidated |
| #50 | handoff byte-index slicing on lowercased copy (non-ASCII) | STILL LIVE |
| #53 | Conversations never load message history on select/tab switch — they turn blank | PARTIAL — `ChatTab.tsx:320` now calls `replaceMessages(convo?.messages)` on select (historical CONVERSATIONS persistence); in-session replay still shallow |
| #56 | `appStore.agents` never set → StatusBar error pill dead | STILL LIVE — not populated (matches EFFICIENCY §F11) |
| #58 | `saveSnapshot` inside `useState` updater (StrictMode double-write) | STILL LIVE |
| #59 | i18n non-functional (only one caller) | STILL LIVE |
| #61 | `mem::forget` Windows stream — doc'd workaround | FIXED-in-place (Intentional, documented; §capture.rs:71) |

**Not in EFFICIENCY_AUDIT** — test-coverage gaps and "verified-OK" list are informative, no overlap.

---

## 4. Unique to EFFICIENCY_AUDIT.md (performance / smartness)

Items the functional review does **not** cover:

| EFFICIENCY_AUDIT | Category | Notes |
|---|---|---|
| §1.2 (PTT 64 ms tail) | correctness + resource | REVIEW only flags the VAD dup path, not the PTT-miss bug |
| §A8 / §B6 | per-call fresh `reqwest::Client` (STT/TTS/bridge) | latency + TLS cost |
| §A5 | `auto_submit` never consulted in VAD | REVIEW doesn't mention |
| §B13 | encryption-over-full-corpus per message (conversations/agents) | O(n²) write amplification |
| §SectionBeff | in-memory config cache; ~50 disk reads | not in REVIEW |
| §SectionSimplicity | TTS LRU cache, adaptive capture, auto-handoff, hotplug-event-driven, streaming bridge proxy, rate limiting | product-level "smart" ideas |
| §F1 / §F7-F9 | React memo / streaming MRA (O(n²) markdown re-parse), `scrollIntoView` per token | not in REVIEW |
| §F2 / §F3 | StatusBar 2s×2 polls + UseAgents 5s poll (IPC floor); keep-tabs-mounted | not in REVIEW |
| §S9 | Lifecycle sweep 1 Hz unconditional + emit-under-lock | not in REVIEW |
| §D6 / §B2 | hotkey re-register on every config change | not in REVIEW |
| §S8 | hotplug 3s monitor-poll bus | not in REVIEW |
| §F13 | highlight.js bundles all languages | not in REVIEW |

These represent the "smart/efficiency" half the functional review never touched — the two documents together give full coverage.

---

## 5. Which REVIEW-FINDINGS items are STILL LIVE (as of 2026-08-07)

CRITICAL/HIGH, verified current:

- **#1** — always-on VAD `try_current` (dead transcription) — **STILL LIVE**
- **#9 subset** — `audio-level-update` & glow/calibration/shape/highlight/always-on events never emitted — **STILL LIVE** (waveform fake-bars loop)
- **#11** — VAD ring-buffer duplication (garbled STT) — **STILL LIVE**
- **#14** — cron 60× per minute — **STILL LIVE**
- **#30** — Wayland ydotool single-invocation malformed — **STILL LIVE**
- **#31** — CUA rate limiter defeated per-instance — **STILL LIVE**
- **#12** — in-flight agent no-stop — **PARTIAL**
- **#24** — Edge/OpenAI-realtime TTS stubs — **PARTIAL** (System TTS works)
- **#25/#26** — bridge auth covers `/health`; `Auth` wrapped after CORS (actix runs the last `.wrap` outermost), so token-mode preflight OPTIONS still 401s without CORS headers — **STILL LIVE** (`bridge.rs:1362-1372`)
- **#42** — `install_update` accepts `signature: String` but never verifies it — **STILL LIVE** (`updater.rs:27`)

**Conclusion:** REVIEW_FINDINGS is approximately **~70% resolved** (critical/high items #5, #6, #7, #8, #10, #13, #16, #17, #18, #19, #20 fixed; #12, #24, #53 partial); the remaining **STILL-LIVE nodes cluster on voice/VAD (#1, #11), the overlay-event gap (#9), Wayland CUA (#30, #31), bridge auth (#25/#26, #40), updater signature (#42), and dead frontend data paths (#54-#59)** — most of which EFFICIENCY_AUDIT independently re-flagged.

---

## 6. Recommendations (reconciliation)

1. **Treat EFFICIENCY_AUDIT.md as the primary living document.** It is written against current code, already contains a consolidated §7 "remaining platform items," and its §5 roadmap covers the big CPU/IPC wins. Port the still-live REVIEW items into it as a short "REVIEW leftovers" section (or a new `docs/KNOWN_ISSUES.md`), then delete REVIEW_FINDINGS.md.
2. **Add the STILL-LIVE REVIEW items** to the remaining list: #1, #9, #11, #14, #30, #31, #12(partial), #24(partial), #25/#26, #40, #42, #38, #39, #45, #46, #49, #50, #54-59.
3. **Unresolved-verified items to close out** before deletion: bridge `/health` exemption + auth-vs-CORS ordering (#25/#26, verified STILL LIVE at `bridge.rs:1362-1372`); `install_update` signature verification (#42, verified STILL LIVE at `updater.rs:27`).
4. **Close the loop** between REVIEW's "test-coverage gaps" and the AGENTS rule: the phantom-command bug (#8) shows the bindings↔Rust command contract needs a test; nothing yet asserts it.

---

## 7. Verified-OK carried over (no change)

REVIEW's "verified-OK" (`bridge_auth` constant-time compare, per-screen overlay fallback, slug suffixing, drop-guard-before-await, hooks test-sibling rule, no `todo!/panic!` in runtime paths) still holds in current code.