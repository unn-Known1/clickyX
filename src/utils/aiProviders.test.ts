import { describe, it, expect } from "vitest";
import {
  PROVIDER_PRESETS,
  CUSTOM_PRESET_ID,
  ANTHROPIC_PRESET_ID,
  OPENROUTER_BASE_URL,
  OPENROUTER_MODELS,
  OPENROUTER_PRESET_ID,
  isOpenRouterBaseUrl,
  presetById,
  normalizeBaseUrl,
  isValidBaseUrl,
  matchPresetByBaseUrl,
  resolvePresetId,
  presetsByTier,
} from "../utils/aiProviders";

describe("aiProviders catalog", () => {
  it("has unique ids", () => {
    const ids = PROVIDER_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every non-custom preset has a base URL and a protocol", () => {
    for (const p of PROVIDER_PRESETS) {
      if (p.id === CUSTOM_PRESET_ID) continue;
      expect(p.baseUrl, p.id).not.toBe("");
      expect(["openai", "anthropic"]).toContain(p.protocol);
    }
  });

  it("marks local presets as not requiring a key", () => {
    for (const p of presetsByTier("local")) {
      expect(p.requiresKey).toBe(false);
      expect(p.baseUrl.startsWith("http://localhost")).toBe(true);
    }
  });

  it("presetById finds known ids and misses unknown ones", () => {
    expect(presetById("openrouter")?.label).toBe("OpenRouter");
    expect(presetById("does-not-exist")).toBeUndefined();
  });
});

describe("OpenRouter (direct)", () => {
  it("exposes a curated, unique model list", () => {
    expect(OPENROUTER_MODELS.length).toBeGreaterThan(0);
    const ids = OPENROUTER_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of OPENROUTER_MODELS) {
      expect(m.id).toContain("/");
      expect(m.name).not.toBe("");
    }
  });

  it("registers OpenRouter as a first-class preset wired to its curated models", () => {
    const preset = presetById(OPENROUTER_PRESET_ID);
    expect(preset).toBeDefined();
    expect(preset?.baseUrl).toBe(OPENROUTER_BASE_URL);
    expect(preset?.protocol).toBe("openai");
    expect(preset?.requiresKey).toBe(true);
    expect(preset?.suggestedModels).toEqual(OPENROUTER_MODELS.map((m) => m.id));
  });

  it("detects OpenRouter base URLs ignoring trailing slashes and case", () => {
    expect(isOpenRouterBaseUrl(OPENROUTER_BASE_URL)).toBe(true);
    expect(isOpenRouterBaseUrl("https://openrouter.ai/api/v1/")).toBe(true);
    expect(isOpenRouterBaseUrl("HTTPS://OPENROUTER.AI/API/V1")).toBe(true);
    expect(isOpenRouterBaseUrl("https://api.openai.com/v1")).toBe(false);
  });

  it("resolves the OpenRouter preset from a saved base URL", () => {
    expect(matchPresetByBaseUrl(OPENROUTER_BASE_URL)?.id).toBe(OPENROUTER_PRESET_ID);
  });
});

describe("normalizeBaseUrl", () => {
  it("trims whitespace and trailing slashes", () => {
    expect(normalizeBaseUrl("  https://api.openai.com/v1/ ")).toBe("https://api.openai.com/v1");
    expect(normalizeBaseUrl("http://localhost:11434/v1///")).toBe("http://localhost:11434/v1");
  });
});

describe("isValidBaseUrl", () => {
  it("accepts http(s) absolute URLs", () => {
    expect(isValidBaseUrl("https://api.openai.com/v1")).toBe(true);
    expect(isValidBaseUrl("http://localhost:1234/v1")).toBe(true);
  });

  it("rejects empty, relative, and non-http schemes", () => {
    expect(isValidBaseUrl("")).toBe(false);
    expect(isValidBaseUrl("api.openai.com")).toBe(false);
    expect(isValidBaseUrl("ftp://example.com")).toBe(false);
    expect(isValidBaseUrl("not a url")).toBe(false);
  });
});

describe("matchPresetByBaseUrl", () => {
  it("matches ignoring trailing slashes and case", () => {
    expect(matchPresetByBaseUrl("https://api.openai.com/v1/")?.id).toBe("openai");
    expect(matchPresetByBaseUrl("HTTPS://API.GROQ.COM/openai/v1")?.id).toBe("groq");
  });

  it("returns undefined for unknown or empty URLs", () => {
    expect(matchPresetByBaseUrl("https://my-private-gateway.internal/v1")).toBeUndefined();
    expect(matchPresetByBaseUrl("")).toBeUndefined();
  });
});

describe("resolvePresetId", () => {
  it("prefers anthropic when that is the default provider", () => {
    expect(resolvePresetId("anthropic", "https://api.openai.com/v1")).toBe(ANTHROPIC_PRESET_ID);
  });

  it("matches the configured base URL", () => {
    expect(resolvePresetId("openai", "http://localhost:11434/v1")).toBe("ollama");
  });

  it("falls back to custom for an unknown endpoint", () => {
    expect(resolvePresetId("openai", "https://example.com/v1")).toBe(CUSTOM_PRESET_ID);
    expect(resolvePresetId("openai", "")).toBe(CUSTOM_PRESET_ID);
  });
});
