#!/usr/bin/env node
// scripts/sync-audit-issues.mjs — mirror docs/BUILD_PACKAGE_AUDIT.md §1-§4 findings to GitHub issues.
// No dependencies (node builtins only).
//
// Usage (dry-run is the DEFAULT; a real run requires --apply):
//   node scripts/sync-audit-issues.mjs [--dry-run] [--close-stale]   # read-only, safe
//   node scripts/sync-audit-issues.mjs --apply [--close-stale]       # creates/updates/closes issues
//
// Idempotency: each issue body carries `<!-- audit-id: X-XXX-N -->`; existing
// issues are found via `gh issue list --search "audit-id: ID" --state all`.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = new Set(process.argv.slice(2));
const APPLY = argv.has("--apply");
const DRY = !APPLY;
const CLOSE_STALE = argv.has("--close-stale");

const here = path.dirname(fileURLToPath(import.meta.url));
const AUDIT = path.resolve(here, "../docs/BUILD_PACKAGE_AUDIT.md");

const AREA_OF = { R: "rust", F: "frontend", W: "ci", S: "security" };
const SEV_OF = { CRIT: "critical", MAJ: "major", MIN: "minor" };
const FINDING_RE = /^\s*-\s*\[((R|F|W|S)-(CRIT|MAJ|MIN)-\d+)\]\s+(.+?)\s+[—–]\s+(.+)\s*$/;
const SECTION_RE = /^##\s+(\d+)\./;
const MARKER_RE = /audit-id:\s*([RFWS]-(?:CRIT|MAJ|MIN)-\d+)/;

function gh(...args) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

// Fail fast with a clear message when `gh` is missing or unauthenticated.
try {
  gh("auth", "status");
} catch {
  console.error("ERROR: `gh` authentication failed (or `gh` is not installed).");
  console.error("Run `gh auth login` (or set GH_TOKEN) and retry. No issues were touched.");
  process.exit(1);
}

function shortTitle(text) {
  const t = text.replace(/`/g, "").trim();
  if (t.length <= 60) return t;
  const cut = t.slice(0, 57).replace(/\s+\S*$/, "");
  return `${cut}…`;
}

function buildBody(id, ref, text, section, area, sev) {
  return [
    `<!-- audit-id: ${id} -->`,
    `**Finding \`${id}\`** (\`${ref}\`) — from \`docs/BUILD_PACKAGE_AUDIT.md\` §${section}.`,
    ``,
    `> ${text}`,
    ``,
    `**Area:** ${area} · **Severity:** ${sev}`,
    ``,
    `**Fix hint:** address the \`${ref}\` reference above, then re-run the local gates`,
    `(\`cargo check\`, \`npm run build\`, \`npm test\`) and confirm in CI.`,
    `This issue is managed by \`scripts/sync-audit-issues.mjs\`; edits may be overwritten.`,
  ].join("\n");
}

function parseFindings() {
  const findings = new Map();
  let section = 0;
  for (const line of readFileSync(AUDIT, "utf8").split("\n")) {
    const s = line.match(SECTION_RE);
    if (s) section = Number(s[1]);
    if (section >= 5) break; // only §1–§4 are actionable findings
    if (section < 1) continue;
    const m = line.match(FINDING_RE);
    if (!m) continue;
    const [, id, areaCode, sevCode, rawRef, text] = m;
    findings.set(id, {
      id,
      ref: rawRef.replace(/`/g, "").trim(),
      text: text.trim(),
      section,
      area: AREA_OF[areaCode],
      sev: SEV_OF[sevCode],
    });
  }
  return findings;
}

function findExisting(id) {
  const out = gh("issue", "list", "--search", `audit-id: ${id}`, "--state", "all",
    "--json", "number,state,title", "--limit", "10");
  const list = out ? JSON.parse(out) : [];
  return list.length > 0 ? list[0] : null;
}

const LABELS = [
  ["sev:critical", "B60205", "Ship-blocker audit finding"],
  ["sev:major", "D93F0B", "Degraded-behavior audit finding"],
  ["sev:minor", "0E8A16", "Hardening/cleanup audit finding"],
  ["area:rust", "5319E7", "Rust/Tauri packaging"],
  ["area:frontend", "1D76DB", "Frontend build/packaging"],
  ["area:ci", "FBCA04", "CI/release workflows"],
  ["area:security", "D4C5F9", "Bridge/security/runtime-compat"],
];

function ensureLabels() {
  if (DRY) return; // label creation is a mutation: apply-only
  for (const [name, color, desc] of LABELS) {
    try {
      gh("label", "create", name, "--color", color, "--description", desc);
      console.log(`label created: ${name}`);
    } catch { /* already exists — ignore */ }
  }
}

const findings = parseFindings();
const counts = { created: 0, updated: 0, closed: 0, openSkip: 0 };
const bySev = { critical: 0, major: 0, minor: 0 };
const byArea = { rust: 0, frontend: 0, ci: 0, security: 0 };
for (const f of findings.values()) { bySev[f.sev] += 1; byArea[f.area] += 1; }

ensureLabels();

for (const f of findings.values()) {
  const title = `[${f.id}] ${shortTitle(f.text)}`;
  const body = buildBody(f.id, f.ref, f.text, f.section, f.area, f.sev);
  const existing = findExisting(f.id);
  if (!existing) {
    if (DRY) { console.log(`WOULD CREATE [${f.id}] ${title}`); counts.created += 1; }
    else {
      const url = gh("issue", "create", "--title", title, "--body", body,
        "--label", `sev:${f.sev}`, "--label", `area:${f.area}`);
      console.log(`CREATED [${f.id}] ${url}`);
      counts.created += 1;
    }
  } else if (existing.state === "CLOSED") {
    const note = `Reopened by audit sync: \`${f.id}\` is still present in \`docs/BUILD_PACKAGE_AUDIT.md\` §${f.section} (\`${f.ref}\`).`;
    if (DRY) { console.log(`WOULD REOPEN #${existing.number} [${f.id}]`); counts.updated += 1; }
    else {
      gh("issue", "comment", String(existing.number), "--body", note);
      gh("issue", "reopen", String(existing.number));
      console.log(`REOPENED #${existing.number} [${f.id}]`);
      counts.updated += 1;
    }
  } else {
    counts.openSkip += 1;
  }
}

if (CLOSE_STALE) {
  const out = gh("issue", "list", "--search", "audit-id:", "--state", "all",
    "--json", "number,state,title,body", "--limit", "200");
  const all = out ? JSON.parse(out) : [];
  for (const issue of all) {
    const m = `${issue.body ?? ""}\n${issue.title ?? ""}`.match(MARKER_RE);
    if (!m || findings.has(m[1]) || issue.state === "CLOSED") continue;
    const note = `Closing: audit id \`${m[1]}\` is no longer present in \`docs/BUILD_PACKAGE_AUDIT.md\` §1–§4.`;
    if (DRY) { console.log(`WOULD CLOSE #${issue.number} [${m[1]}] (stale)`); counts.closed += 1; }
    else {
      gh("issue", "comment", String(issue.number), "--body", note);
      gh("issue", "close", String(issue.number));
      console.log(`CLOSED #${issue.number} [${m[1]}] (stale)`);
      counts.closed += 1;
    }
  }
}

const mode = DRY ? "DRY-RUN (no changes; re-run with --apply to mutate)" : "APPLIED";
console.log(`\n=== audit sync summary [${mode}] ===`);
console.log(`findings in report §1–§4 : ${findings.size}`);
console.log(`by severity               : critical=${bySev.critical} major=${bySev.major} minor=${bySev.minor}`);
console.log(`by area                   : rust=${byArea.rust} frontend=${byArea.frontend} ci=${byArea.ci} security=${byArea.security}`);
console.log(`created=${counts.created} reopened/updated=${counts.updated} closed-stale=${counts.closed} already-open=${counts.openSkip}`);
