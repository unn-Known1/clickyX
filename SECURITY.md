# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| `master` (latest) | ✅ Active development |
| Tagged releases (`v*`) | ✅ Latest minor release only |

Older versions are not actively patched. Please upgrade to the latest release.

## Reporting a Vulnerability

**Please do not file a public issue for security vulnerabilities.**

Instead, report privately via one of the following channels:

1. **GitHub Security Advisories** (preferred): Go to the **Security** tab → **Report a vulnerability** on [github.com/unn-Known1/clickyX](https://github.com/unn-Known1/clickyX/security/advisories/new)
2. **Email**: open a discussion first to request a contact address

You should receive an acknowledgement within **72 hours**. If you do not, please follow up via a GitHub issue with a non-sensitive summary.

## What to Include

When reporting, please include:

- A clear description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept script or screenshot if possible)
- The commit / tag / version affected
- Your assessment of severity (Critical / High / Medium / Low)
- Any known mitigations or workarounds

## Disclosure Policy

- We follow **coordinated disclosure**. We ask that you give us a reasonable window (typically **90 days**) to investigate and patch before public disclosure.
- We will credit reporters in the fix commit and release notes unless you request anonymity.
- We do not pursue legal action against good-faith security research that complies with this policy.

## Security Design Notes for ClickyX

ClickyX is a **local-first** desktop app. The following principles apply:

- **No telemetry**: ClickyX does not phone home. There is no PostHog, Sentry, Supabase, or analytics SDK embedded.
  Launch-time **update checks** do contact the update server (`releases.clickyx.app`, falling back to the
  `api.github.com` latest-release endpoint) once per start. This is version-check traffic only — no identifiers,
  no usage data — and can be disabled with `check_updates_on_startup: false` in `config.json`.
- **Local API only**: The HTTP bridge binds `127.0.0.1:32123` only **and** rejects any `Host` header outside
  `{127.0.0.1, localhost}` (DNS-rebinding defense). It is not exposed to the network.
- **Token-authenticated bridge**: A high-entropy token is generated on first run and auth is **on by default**.
  `GET /health` is the only unauthenticated endpoint. The dangerous tier (mouse/scroll input, screenshots,
  AI-key proxies, MCP execution, agent runs, STT/TTS) **always** requires a token — even when auth is
  explicitly disabled for read-only routes via `bridge_auth_disabled: true` (the Settings UI warns when set).
  Accepted headers: `Authorization: Bearer <t>`, `x-openclicky-token: <t>`, `X-Bridge-Token: <t>`.
  Comparison is constant-time; per-IP rate limiting (600 req / 60 s) is enforced.
- **CORS restricted**: hardcoded allow-list of the local dev origins (`http://localhost:1420`,
  `http://127.0.0.1:1420`); preflight is answered before auth so token clients work from browsers.
- **User-controlled API keys**: All AI provider keys are entered by the user and stored locally in
  `config.json` (owner-only `0600` permissions on unix). They are never transmitted anywhere except the
  provider's own API endpoint — or a user-configured `openai_base_url`, which must use an explicit
  `http(s)` scheme and is validated on save. Config exports **redact secrets by default** (explicit
  opt-in required to include them); redacted exports are refused on import so keys can't be wiped silently.
- **Keychain-first secrets**: when the OS keychain is available, API keys (Anthropic, OpenAI-compatible,
  Jev) move there on load and the file copies stay empty (`secrets_in_keychain`); reads hydrate from the
  keychain, writes persist straight to it, and `reset_config` wipes keychain copies so rotated secrets
  can't be resurrected. `get_config` / `get_ai_config` / `get_agent_config` echo plaintext to the
  same-principal WebView by design (never to disk or the bridge); only redacted exports leave the machine.
  Windows file fallback has no ACL — keychain present is the supported path there.
- **Jev / Jarvis (fail-closed co-pilot)**: the Jev decisions URL receives the API key and is validated to
  explicit `http(s)` on save/import (same rule as `openai_base_url`); all Jev/bridge errors are
  declassified (no key material reaches UI, logs, or bridge bodies). Every `jarvis_*` command starts with
  a Rust-enforced gate (`enabled && !paused && OS permissions && !blocklisted`) — the Settings toggle is
  UX only. Fill is a dedicated path (clipboard save → set draft → paste → restore original) that hard-refuses
  Enter, send-region clicks, and a11y `press|click|submit`; secret-shaped drafts and Wayland sessions degrade
  to copy-only. Logs record lengths/tokens/cost only; `get_logs` redacts; AI errors are declassified.
  The local KB lives in encrypted `kb.enc` (agent key) with an explicit wipe (`jarvis_wipe`: overwrite +
  delete + fsync). See `PRIVACY.md` for the data model.
- **CUA / input simulation**: Click execution via `enigo` is rate-limited and bounds-checked; it can be disabled in settings.
- **Auto-updater**: Custom platform-aware updater (`updater.rs`). Version comparison is semver-aware
  (downgrades are never offered). Artifacts are installed only after minisign signature verification
  against the embedded release key — **unsigned artifacts are refused, no exceptions**. Update metadata is
  fetched from the official update server with fallback to `unn-Known1/clickyX` GitHub releases.

## Out of Scope

- Vulnerabilities in **third-party AI providers** (Anthropic, OpenAI, ElevenLabs, etc.) — report to them directly.
- Vulnerabilities in the **Codex Node.js runtime** — report upstream.
- Issues requiring physical access to an already-unlocked machine.
- Social-engineering attacks.
- Denial-of-service against the local API from the same user account.
