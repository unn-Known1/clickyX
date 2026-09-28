# Automation

What runs where, and how the audit backlog stays in sync.

## What runs where

| Where | What | Command / trigger |
|-------|------|-------------------|
| Pre-commit (local) | Fast gates: i18n parity, `cargo fmt --check`, ESLint (staged js/ts, else `src e2e scripts`). Target <60s. Bypass: `SKIP_HOOKS=1 git commit ...` | `scripts/install-hooks.sh` once, then automatic on `git commit` |
| CI gates | Check (build+unit+clippy `-D warnings`+`cargo fmt --check`), Build (ubuntu/windows/macos), E2E (Playwright) | Push / PR; see `.github/workflows/` |
| Nightly | Scheduled rebuild (`nightly.yml`) | Cron schedule in workflow |
| Audit sync (manual) | Mirrors `docs/BUILD_PACKAGE_AUDIT.md` §1–§4 findings to GitHub issues | Dry-run: `node scripts/sync-audit-issues.mjs --dry-run [--close-stale]` · Apply: `node scripts/sync-audit-issues.mjs --apply [--close-stale]` |
| Dependabot | Weekly cargo + npm (+ actions) minor/patch groups, max 5 open PRs each | Automatic PRs, label `dependencies` |

`--dry-run` is the default (read-only `gh` calls); a real run requires `--apply`.
`--close-stale` additionally closes issues whose audit ID left the report.
The script exits non-zero if `gh` auth fails — run `gh auth login` (or set `GH_TOKEN`).

## Label taxonomy

- Severity: `sev:critical` (ship-blocker), `sev:major` (degraded/doc mismatch), `sev:minor` (hardening).
- Area (from ID prefix R/F/W/S): `area:rust`, `area:frontend`, `area:ci`, `area:security`.
- `dependencies` for Dependabot PRs.
- Each audit issue title is `[AUDIT-ID] short-title` and its body carries
  `<!-- audit-id: X-XXX-N -->` (the idempotency key) plus file:line, full text, and fix hint.

## Board workflow

1. Triage new audit issues by severity: critical first (package/installer/updater broken), then major, then minor.
2. One owner per issue; close via fix commit, not by hand (the sync reopens closed issues still in the report).
3. Stale issues (ID gone from the report) are closed by the sync with `--close-stale`, with a note.
4. Re-run the sync in `--dry-run` after each audit edit to preview creates/reopens/closes.

## Dependabot policy

Weekly minor/patch groups for npm (`/`), cargo (`/src-tauri`), and GitHub Actions;
major bumps stay manual. Max 5 open PRs per ecosystem. Merge when CI is green;
CI is fire-and-forget — report the run URL and move on.
