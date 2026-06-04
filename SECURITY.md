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
- **Local API only**: The HTTP bridge listens on `127.0.0.1:32123` only. It is not exposed to the network.
- **Token-authenticated bridge**: All bridge endpoints require a token via `x-openclicky-token` header or `Bearer` token. Constant-time comparison is used.
- **CORS restricted**: The bridge CORS allow-list is opt-in via configuration; defaults deny cross-origin.
- **User-controlled API keys**: All AI provider keys (Anthropic, OpenAI, etc.) are entered by the user, stored locally, and never transmitted anywhere except the provider's own API endpoint.
- **CUA / input simulation**: Click execution via `enigo` is rate-limited and bounds-checked; it can be disabled in settings.
- **Auto-updater**: Custom platform-aware updater (`updater.rs`) checks the official `unn-Known1/clickyX` GitHub releases; it verifies the release exists and is signed (where platform permits).

## Out of Scope

- Vulnerabilities in **third-party AI providers** (Anthropic, OpenAI, ElevenLabs, etc.) — report to them directly.
- Vulnerabilities in the **Codex Node.js runtime** — report upstream.
- Issues requiring physical access to an already-unlocked machine.
- Social-engineering attacks.
- Denial-of-service against the local API from the same user account.
