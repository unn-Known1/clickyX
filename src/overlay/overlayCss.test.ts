import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Read the two sources as text straight off disk. Vitest does not evaluate CSS
 * (a plain `.css` import yields an empty module here), so reading the real file
 * is both the simplest approach and the only one that can catch a broken
 * class/keyframe pairing.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(HERE, rel), "utf8");

const CSS = read("./overlay.css");
const TSX = read("./CursorActionLayer.tsx");

/**
 * Static wiring checks between CursorActionLayer and overlay.css.
 *
 * These caught a real shipped defect: `.cursor-action-typing` declared
 * `animation-name: action-typing` with no matching `@keyframes`, so the burst
 * container inherited `opacity: 0` from `.cursor-action` and the typing keycaps
 * animated inside an invisible element. jsdom does not evaluate CSS, so no
 * render test can catch that class of bug — assert the wiring directly.
 */

function ruleBody(selector: string): string {
  const match = CSS.match(
    new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`),
  );
  expect(match, `no CSS rule for ${selector}`).not.toBeNull();
  return match![1];
}

describe("overlay.css wiring", () => {
  it("defines every keyframe referenced by animation-name", () => {
    const used = [...CSS.matchAll(/animation-name:\s*([a-z-]+)/g)].map((m) => m[1]);
    const defined = new Set([...CSS.matchAll(/@keyframes\s+([a-z-]+)/g)].map((m) => m[1]));
    // The shorthand form (`animation: name ...`) does not set animation-name.
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((n) => !defined.has(n))).toEqual([]);
  });

  it("defines every keyframe referenced by the animation shorthand", () => {
    const defined = new Set([...CSS.matchAll(/@keyframes\s+([a-z-]+)/g)].map((m) => m[1]));
    const shorthand = [...CSS.matchAll(/animation:\s*([a-z-]+)\s/g)].map((m) => m[1]);
    expect(shorthand.filter((n) => !defined.has(n))).toEqual([]);
  });

  it.each([
    "cursor-action-typing",
    "cursor-action-scroll",
    "cursor-drag-ghost",
    "cursor-drag-tether",
    "cursor-key",
    "cursor-ripple",
  ])("styles the .%s class the layer renders", (cls) => {
    expect(CSS).toContain(`.${cls}`);
  });

  it("keeps each new effect container visible for its animation's lifetime", () => {
    // `.cursor-action` starts at opacity 0, so a burst whose children animate
    // needs its own keyframes or it renders invisible.
    expect(ruleBody(".cursor-action")).toContain("opacity: 0");
    for (const cls of [".cursor-action-typing", ".cursor-action-scroll"]) {
      const body = ruleBody(cls);
      const name = body.match(/animation-name:\s*([a-z-]+)/)?.[1];
      expect(name, `${cls} has no animation-name`).toBeDefined();
      expect(CSS).toContain(`@keyframes ${name}`);
    }
  });

  it("staggers the typing keycaps and scroll ripples", () => {
    for (const n of [1, 2, 3]) {
      expect(ruleBody(`.cursor-key-${n}`)).toBeTruthy();
      expect(ruleBody(`.cursor-ripple-${n}`)).toBeTruthy();
    }
    // Delays must actually differ, or the stagger is decorative.
    const delays = [1, 2, 3].map((n) =>
      ruleBody(`.cursor-ripple-${n}`).match(/animation-delay:\s*(\d+)ms/)?.[1],
    );
    expect(new Set(delays).size).toBe(3);
  });

  it("suppresses every effect under prefers-reduced-motion", () => {
    expect(CSS).toContain("prefers-reduced-motion: reduce");
    const block = CSS.slice(CSS.indexOf("prefers-reduced-motion: reduce"));
    expect(block).toContain("animation-duration: 0.01ms !important");
  });

  it("only references cursor-* classes that overlay.css defines", () => {
    // `--cursor-burst-size` is a custom property, not a class; skip it.
    const classes = [...new Set([...TSX.matchAll(/cursor-[a-z0-9-]+/g)].map((m) => m[0]))]
      .filter((c) => !c.startsWith("cursor-burst-size"));
    expect(classes.length).toBeGreaterThan(0);
    expect(classes.filter((c) => !CSS.includes(`.${c}`))).toEqual([]);
  });
});