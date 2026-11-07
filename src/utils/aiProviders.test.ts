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
  ANTHROPIC_MODELS,
  OPENAI_MODELS,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  isOpenAiOwnBaseUrl,
  openaiEffortsFor,
  clampOpenaiEffort,
  POINTING_MODELS,
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

describe("current model lists", () => {
  it("offers the exact current Claude and GPT-6 ids and defaults", () => {
    expect(ANTHROPIC_MODELS.map((m) => m.id)).toEqual([
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-haiku-5-5",
      "claude-fable-5-1",
    ]);
    expect(OPENAI_MODELS.map((m) => m.id)).toEqual([
      "gpt-6.1-sol",
      "gpt-6-astra",
      "gpt-6.1-terra",
      "gpt-6-luna",
    ]);
    expect(DEFAULT_ANTHROPIC_MODEL).toBe("claude-opus-5-5");
    expect(DEFAULT_OPENAI_MODEL).toBe("gpt-6.1-sol");
    expect(presetById("anthropic")?.suggestedModels[0]).toBe("claude-opus-5-5");
    expect(presetById("openai")?.suggestedModels[0]).toBe("gpt-6.1-sol");
  });

  it("never lists retired ids in the first-party lists or pointing models", () => {
    const retired = /claude-(sonnet|opus)-4-2025|claude-haiku-3|claude-3|^gpt-4|^o3-mini/;
    for (const m of [...ANTHROPIC_MODELS, ...OPENAI_MODELS, ...POINTING_MODELS]) {
      expect(m.id).not.toMatch(retired);
    }
  });
});

describe("OpenAI own endpoint + reasoning effort", () => {
  it("recognises only OpenAI's own base URL", () => {
    for (const u of ["https://api.openai.com", "https://api.openai.com/v1", "https://API.openai.com/v1/"]) {
      expect(isOpenAiOwnBaseUrl(u), u).toBe(true);
    }
    for (const u of ["https://openrouter.ai/api/v1", "http://localhost:11434/v1", "https://api.openai.com.evil.test/v1", ""]) {
      expect(isOpenAiOwnBaseUrl(u), u).toBe(false);
    }
  });

  it("allows 'none' only for Terra and Luna", () => {
    expect(openaiEffortsFor("gpt-6.1-sol")).not.toContain("none");
    expect(openaiEffortsFor("gpt-6-astra")).not.toContain("none");
    expect(openaiEffortsFor("gpt-6.1-terra")).toContain("none");
    expect(openaiEffortsFor("gpt-6-luna")).toContain("none");
    expect(openaiEffortsFor("some-custom-model")).toContain("none");
  });

  it("clamps an invalid effort to the nearest valid level", () => {
    expect(clampOpenaiEffort("gpt-6.1-sol", "none")).toBe("low");
    expect(clampOpenaiEffort("gpt-6-luna", "none")).toBe("none");
    expect(clampOpenaiEffort("gpt-6.1-sol", "max")).toBe("max");
    expect(clampOpenaiEffort("gpt-6.1-sol", "bogus")).toBe("medium");
  });
});
