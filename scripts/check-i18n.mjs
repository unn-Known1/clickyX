// Locale-parity check for ClickyX.
// Invocation: node scripts/check-i18n.mjs
// Loads the 4 locale JSONs under src/i18n/locales/, reports missing keys per
// locale vs en (the source of truth), and exits non-zero on any missing key.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.resolve(here, "../src/i18n/locales");
const LOCALES = ["en", "es", "fr", "ja"];

function load(locale) {
  return JSON.parse(readFileSync(path.join(localesDir, `${locale}.json`), "utf8"));
}

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const en = flatten(load("en"));
const enKeys = new Set(Object.keys(en));
let failures = 0;

for (const locale of LOCALES.filter((l) => l !== "en")) {
  const flat = flatten(load(locale));
  const missing = [...enKeys].filter((k) => !(k in flat));
  const extra = Object.keys(flat).filter((k) => !enKeys.has(k));
  if (missing.length === 0 && extra.length === 0) {
    console.log(`${locale}: OK (${Object.keys(flat).length} keys, full parity with en)`);
  } else {
    failures += missing.length > 0 ? 1 : 0;
    console.log(`${locale}: ${missing.length} missing, ${extra.length} extra (vs ${enKeys.size} en keys)`);
    for (const k of missing) console.log(`  MISSING ${locale}.${k}`);
    for (const k of extra) console.log(`  EXTRA   ${locale}.${k}`);
  }
}

if (failures > 0) {
  console.error("i18n parity check FAILED");
  process.exit(1);
}
console.log("i18n parity check passed");
