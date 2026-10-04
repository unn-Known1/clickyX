/**
 * AI provider preset catalog.
 *
 * ClickyX talks to two wire protocols: Anthropic (native) and OpenAI-compatible.
 * Nearly every hosted or self-hosted model server now exposes an OpenAI-compatible
 * `/chat/completions` API, so this catalog lets users pick a provider and get the
 * right base URL + a sensible starting model without hunting through docs — and
 * "custom" covers anything not listed.
 *
 * Pure data + helpers (no React) so it is trivially testable.
 */

export type ProviderProtocol = "openai" | "anthropic";
export type ProviderTier = "cloud" | "local" | "custom";

export interface ProviderPreset {
  id: string;
  /** Display name, e.g. "OpenRouter". Not translated (brand names). */
  label: string;
  protocol: ProviderProtocol;
  /** OpenAI-compatible base URL (or empty for a fully custom endpoint). */
  baseUrl: string;
  /** Good starting models; used to seed the model field + suggestions. */
  suggestedModels: string[];
  /** False for local/self-hosted servers that need no key. */
  requiresKey: boolean;
  tier: ProviderTier;
  /** Optional key-format hint, e.g. "sk-". */
  keyHint?: string;
  /** Where to create an API key (cloud providers). */
  keyUrl?: string;
}

/** First-class OpenRouter support — one key, models from every major lab. */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_PRESET_ID = "openrouter";

export interface OpenRouterModel {
  id: string;
  /** Display name (brand, not translated). */
  name: string;
}

/** Curated, high-signal OpenRouter models (users can still type any id). */
export const OPENROUTER_MODELS: OpenRouterModel[] = [
  { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" },
  { id: "openai/gpt-4o", name: "GPT-4o" },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  { id: "deepseek/deepseek-chat-v3", name: "DeepSeek V3" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B" },
  { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B" },
  { id: "mistralai/mistral-large", name: "Mistral Large" },
];

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    suggestedModels: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o4-mini"],
    requiresKey: true,
    tier: "cloud",
    keyHint: "sk-",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com",
    suggestedModels: ["claude-sonnet-4-20250514", "claude-opus-4-1", "claude-haiku-4-5"],
    requiresKey: true,
    tier: "cloud",
    keyHint: "sk-ant-",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: OPENROUTER_PRESET_ID,
    label: "OpenRouter",
    protocol: "openai",
    baseUrl: OPENROUTER_BASE_URL,
    suggestedModels: OPENROUTER_MODELS.map((m) => m.id),
    requiresKey: true,
    tier: "cloud",
    keyHint: "sk-or-",
    keyUrl: "https://openrouter.ai/keys",
  },
  {
    id: "groq",
    label: "Groq",
    protocol: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    suggestedModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
    requiresKey: true,
    tier: "cloud",
    keyHint: "gsk_",
    keyUrl: "https://console.groq.com/keys",
  },
  {
    id: "together",
    label: "Together AI",
    protocol: "openai",
    baseUrl: "https://api.together.xyz/v1",
    suggestedModels: [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "mistralai/Mixtral-8x7B-Instruct-v0.1",
    ],
    requiresKey: true,
    tier: "cloud",
    keyUrl: "https://api.together.xyz/settings/api-keys",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    protocol: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    suggestedModels: ["deepseek-chat", "deepseek-reasoner"],
    requiresKey: true,
    tier: "cloud",
    keyHint: "sk-",
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "mistral",
    label: "Mistral AI",
    protocol: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    suggestedModels: ["mistral-large-latest", "mistral-small-latest", "open-mistral-nemo"],
    requiresKey: true,
    tier: "cloud",
    keyUrl: "https://console.mistral.ai/api-keys",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    protocol: "openai",
    baseUrl: "https://api.x.ai/v1",
    suggestedModels: ["grok-4", "grok-3", "grok-3-mini"],
    requiresKey: true,
    tier: "cloud",
    keyHint: "xai-",
    keyUrl: "https://console.x.ai",
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    protocol: "openai",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    suggestedModels: ["meta/llama-3.3-70b-instruct", "nvidia/llama-3.1-nemotron-70b-instruct"],
    requiresKey: true,
    tier: "cloud",
    keyHint: "nvapi-",
    keyUrl: "https://build.nvidia.com",
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    protocol: "openai",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    suggestedModels: ["accounts/fireworks/models/llama-v3p3-70b-instruct"],
    requiresKey: true,
    tier: "cloud",
    keyUrl: "https://fireworks.ai/account/api-keys",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    protocol: "openai",
    baseUrl: "https://api.perplexity.ai",
    suggestedModels: ["sonar", "sonar-pro"],
    requiresKey: true,
    tier: "cloud",
    keyHint: "pplx-",
    keyUrl: "https://www.perplexity.ai/settings/api",
  },
  {
    id: "ollama",
    label: "Ollama",
    protocol: "openai",
    baseUrl: "http://localhost:11434/v1",
    suggestedModels: ["llama3.2", "qwen2.5", "mistral", "phi4"],
    requiresKey: false,
    tier: "local",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    protocol: "openai",
    baseUrl: "http://localhost:1234/v1",
    suggestedModels: ["local-model"],
    requiresKey: false,
    tier: "local",
  },
  {
    id: "custom",
    label: "Custom",
    protocol: "openai",
    baseUrl: "",
    suggestedModels: [],
    requiresKey: false,
    tier: "custom",
  },
];

export const CUSTOM_PRESET_ID = "custom";
export const ANTHROPIC_PRESET_ID = "anthropic";

export function presetById(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}

/** True when a base URL points at OpenRouter's OpenAI-compatible API. */
export function isOpenRouterBaseUrl(url: string): boolean {
  return normalizeBaseUrl(url).toLowerCase() === OPENROUTER_BASE_URL.toLowerCase();
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** A base URL is usable when it parses as an absolute http(s) URL with a host. */
export function isValidBaseUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Resolve the preset matching a configured base URL (trailing slash / case insensitive). */
export function matchPresetByBaseUrl(url: string): ProviderPreset | undefined {
  const norm = normalizeBaseUrl(url).toLowerCase();
  if (!norm) return undefined;
  return PROVIDER_PRESETS.find(
    (p) => p.baseUrl && normalizeBaseUrl(p.baseUrl).toLowerCase() === norm,
  );
}

/**
 * Resolve the preset that best describes the current config. Falls back to
 * "custom" for an unknown OpenAI-compatible endpoint, and to Anthropic when the
 * Anthropic protocol is the configured default.
 */
export function resolvePresetId(defaultProvider: string, openaiBaseUrl: string): string {
  if (defaultProvider === "anthropic") return ANTHROPIC_PRESET_ID;
  return matchPresetByBaseUrl(openaiBaseUrl)?.id ?? CUSTOM_PRESET_ID;
}

export function presetsByTier(tier: ProviderTier): ProviderPreset[] {
  return PROVIDER_PRESETS.filter((p) => p.tier === tier);
}
