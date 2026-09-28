# Privacy Policy — ClickyX (local-first)

ClickyX is a **local-first** desktop app: no accounts, no cloud sync, no telemetry.
This document states what Jarvis mode reads, where it goes, and how to wipe it.

## What Jarvis reads (per analyze run, only when you trigger it)

- The **focused window's title + screenshot** (blocklisted windows — WeChat family,
  banking/payment, plus your extras — are refused before any pixels move).
- Text **you** choose to judge (vision transcript of the screenshot, shown on screen).
- Your **local knowledge base**: tag-matched notes (≤5) + title-matched contacts,
  plus opt-in recent history (default OFF).

The panel's "What was read" expander shows exactly this per run
(message/history/KB counts + judge cost) — no content leaves the panel otherwise.

## Where it goes (text-only egress to YOUR endpoints)

- **On-device**: OCR-free MVP — screenshots are encoded locally; matching, session
  keys, and redaction happen locally.
- **Egress**: transcribed text + KB slice go to **your configured endpoints only**:
  the Jev decisions URL (judge/rank) and your chat provider (drafts/vision).
  No relay server, no vendor in the middle. The Bocha (CN) preset shows a
  data-residency warning before its connectivity test — chat text sent there is
  subject to that endpoint's policy.
- **Never**: WeChat/banking content is never processed (blocklisted); filled text is
  pasted locally via clipboard, never uploaded.

## What is stored

- `config.json`: settings + (when no keychain) secrets, owner-only `0600` on unix.
- OS keychain (when available): API keys + bridge token + agent key.
- `kb.enc`: encrypted local knowledge (agent key). `conversations.enc`:
  encrypted chat threads. One-click wipe: Jarvis settings → Wipe knowledge
  (`jarvis_wipe`: overwrite + delete + fsync), plus config reset wipes keychain
  copies so rotated secrets can't return.

## Logs

Lengths, token counts, and cost only — never message content, titles, or pixels.
`get_logs` output is redacted; AI/bridge errors are declassified before display.

## Attribution

Decision backend by TypeSafe AI (user key, user endpoint). Chat co-pilot pattern
inspired by [jev-chat-jarvis](https://github.com/jev-chat/jev-chat-jarvis) (MIT) —
see `LICENSE`/`NOTICE`.
