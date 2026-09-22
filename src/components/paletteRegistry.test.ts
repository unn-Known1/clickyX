import { describe, it, expect } from "vitest";
import {
  fuzzyScore,
  searchPalette,
  registerPaletteItems,
  getPaletteItems,
  clearPaletteRegistry,
  type PaletteItem,
} from "./paletteRegistry";

function item(id: string, label: string, extra?: Partial<PaletteItem>): PaletteItem {
  return {
    id,
    label,
    description: `${label} desc`,
    icon: "settings",
    action: () => {},
    category: "Test",
    ...extra,
  };
}

describe("fuzzyScore", () => {
  it("matches exact substring with high score", () => {
    expect(fuzzyScore("agents", "Go to Agents")).toBeGreaterThan(0);
  });

  it("matches non-contiguous subsequence", () => {
    expect(fuzzyScore("gta", "Go to Agents")).toBeGreaterThan(-Infinity);
  });

  it("rejects non-subsequence queries", () => {
    expect(fuzzyScore("xyz", "Go to Agents")).toBe(-Infinity);
  });

  it("prefers word-boundary and contiguous matches", () => {
    const contiguous = fuzzyScore("agent", "Go to Agents");
    const gapped = fuzzyScore("agent", "A Great Navigation Tool");
    expect(contiguous).toBeGreaterThan(gapped);
  });

  it("is case-insensitive", () => {
    expect(fuzzyScore("AGENTS", "go to agents")).toBe(fuzzyScore("agents", "Go to Agents"));
  });

  it("empty query scores zero", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });
});

describe("searchPalette", () => {
  it("returns all items for empty query in order", () => {
    const items = [item("a", "Alpha"), item("b", "Beta")];
    expect(searchPalette("", items)).toEqual(items);
    expect(searchPalette("   ", items)).toEqual(items);
  });

  it("filters out non-matches and ranks best first", () => {
    const items = [
      item("1", "System & Logs"),
      item("2", "Go to Settings"),
      item("3", "Go to Home"),
    ];
    const out = searchPalette("settin", items);
    expect(out.map((i) => i.id)).toEqual(["2"]);
  });

  it("matches against keywords", () => {
    const items = [item("1", "Voice", { keywords: ["microphone", "audio"] })];
    expect(searchPalette("mic", items).map((i) => i.id)).toEqual(["1"]);
  });
});

describe("palette registry", () => {
  it("registers and unregisters items", () => {
    clearPaletteRegistry();
    const unregister = registerPaletteItems([item("x", "Xray")]);
    expect(getPaletteItems().map((i) => i.id)).toContain("x");
    unregister();
    expect(getPaletteItems().map((i) => i.id)).not.toContain("x");
    clearPaletteRegistry();
  });

  it("later registration wins on id collision", () => {
    clearPaletteRegistry();
    registerPaletteItems([item("dup", "First")]);
    registerPaletteItems([item("dup", "Second")]);
    expect(getPaletteItems().filter((i) => i.id === "dup")).toHaveLength(1);
    expect(getPaletteItems().find((i) => i.id === "dup")?.label).toBe("Second");
    clearPaletteRegistry();
  });
});
