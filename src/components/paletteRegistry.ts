import type { IconName } from "./Icon";

/**
 * Command-palette registry (P3).
 *
 * Before: items were a hardcoded array inside CommandPalette.tsx — only the
 * file's author could add commands, and matching was plain substring.
 *
 * After: any module registers items via `registerPaletteItems()`. Matching is
 * subsequence-fuzzy with contiguity + word-boundary scoring, sorted best-first.
 * Actions stay plain callbacks so items remain fully actionable from keyboard.
 */

export interface PaletteItem {
  id: string;
  label: string;
  description: string;
  icon: IconName;
  /** Extra match surface (aliases, section names). */
  keywords?: string[];
  action: () => void;
  category: string;
}

const registry = new Map<string, PaletteItem>();

export function registerPaletteItems(items: PaletteItem[]): () => void {
  for (const item of items) {
    registry.set(item.id, item);
  }
  return () => {
    for (const item of items) {
      registry.delete(item.id);
    }
  };
}

export function getPaletteItems(): PaletteItem[] {
  return Array.from(registry.values());
}

export function clearPaletteRegistry(): void {
  registry.clear();
}

export interface ScoredItem {
  item: PaletteItem;
  score: number;
}

/**
 * Subsequence fuzzy score. Returns -Infinity when `query` is not a
 * subsequence of the haystack. Higher = better.
 *
 * Scoring: +10 per matched char, +8 when the match starts a word
 * (start-of-string or after space/›/-/_), +4 for contiguity with the previous
 * match, −1 per skipped char (gap penalty).
 */
export function fuzzyScore(query: string, haystack: string): number {
  const q = query.toLowerCase();
  const h = haystack.toLowerCase();
  if (!q) return 0;
  let score = 0;
  let hi = 0;
  let prevMatch = -2;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    let found = -1;
    for (let i = hi; i < h.length; i++) {
      if (h[i] === ch) {
        found = i;
        break;
      }
    }
    if (found === -1) return -Infinity;
    score += 10;
    if (found === 0 || h[found - 1] === " " || h[found - 1] === "›" || h[found - 1] === "-" || h[found - 1] === "_") {
      score += 8;
    }
    if (found === prevMatch + 1) score += 4;
    else score -= found - hi;
    prevMatch = found;
    hi = found + 1;
  }
  return score;
}

function haystackFor(item: PaletteItem): string {
  return [item.label, item.description, item.category, ...(item.keywords ?? [])].join(" ");
}

/** Fuzzy-filter + rank items. Empty query returns all items unscored, in registration order. */
export function searchPalette(query: string, items?: PaletteItem[]): PaletteItem[] {
  const list = items ?? getPaletteItems();
  const q = query.trim();
  if (!q) return list;
  const scored: ScoredItem[] = [];
  for (const item of list) {
    const s = fuzzyScore(q, haystackFor(item));
    if (s > -Infinity) scored.push({ item, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
