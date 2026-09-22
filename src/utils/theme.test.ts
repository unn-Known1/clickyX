import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveTheme, getStoredVariant, setStoredVariant, THEME_VARIANT_KEY } from "./theme";

describe("resolveTheme", () => {
  it("prefers an explicit variant over the base", () => {
    expect(resolveTheme("dark", "sunset")).toBe("sunset");
    expect(resolveTheme("light", "ocean")).toBe("ocean");
  });

  it("passes light/dark through when no variant", () => {
    expect(resolveTheme("dark", "")).toBe("dark");
    expect(resolveTheme("light", "")).toBe("light");
  });

  it("resolves system via matchMedia", () => {
    const matchMedia = vi.fn((q: string) => ({
      matches: q.includes("dark"),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    vi.stubGlobal("matchMedia", undefined);
    Object.defineProperty(window, "matchMedia", { value: matchMedia, writable: true });
    expect(resolveTheme("system", "")).toBe("dark");
    matchMedia.mockImplementation(() => ({
      matches: false,
      media: "",
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    expect(resolveTheme("system", "")).toBe("light");
  });

  it("falls back to dark for empty base", () => {
    expect(resolveTheme("", "")).toBe("dark");
  });
});

describe("variant storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips through localStorage", () => {
    expect(getStoredVariant()).toBe("");
    setStoredVariant("forest");
    expect(window.localStorage.getItem(THEME_VARIANT_KEY)).toBe("forest");
    expect(getStoredVariant()).toBe("forest");
    setStoredVariant("");
    expect(window.localStorage.getItem(THEME_VARIANT_KEY)).toBeNull();
  });
});
