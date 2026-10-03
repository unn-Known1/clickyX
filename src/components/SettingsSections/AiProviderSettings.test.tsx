import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AiProviderSettings from "./AiProviderSettings";
import { AppProvider } from "../../context/AppContext";
import { commands } from "../../bindings";

const { updateAiConfig, updateAppConfig } = vi.hoisted(() => ({
  updateAiConfig: vi.fn().mockResolvedValue({}),
  updateAppConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../hooks/useAiConfig", () => {
  // Stable reference: the component syncs local state from config in an effect,
  // so a fresh object per render would clobber user edits.
  const config = {
    anthropic_api_key: null,
    anthropic_model: "claude-sonnet-4-20250514",
    openai_api_key: null,
    openai_model: "gpt-4o",
    openai_base_url: "https://api.openai.com/v1",
    default_provider: "openai",
    system_prompt: "",
  };
  return { useAiConfig: () => ({ config, updateConfig: updateAiConfig, loading: false, error: null }) };
});

vi.mock("../../hooks/useConfig", () => {
  const config = { api_keys: [] };
  return { useConfig: () => ({ config, updateConfig: updateAppConfig, loading: false, error: null }) };
});

vi.mock("../../bindings", () => ({
  commands: {
    getChatModels: vi.fn().mockResolvedValue([
      { id: "llama-3.3-70b-versatile", provider: "openai", name: "Llama 3.3 70B", capabilities: ["chat"] },
    ]),
  },
}));

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppProvider>
        <AiProviderSettings />
      </AppProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AiProviderSettings", () => {
  it("renders the provider setup with the current preset detected", () => {
    renderSettings();
    expect(screen.getByText("AI Providers")).toBeInTheDocument();
    expect(screen.getByLabelText("Provider preset")).toHaveValue("openai");
  });

  it("fills the base URL and model when a preset is chosen", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.selectOptions(screen.getByLabelText("Provider preset"), "groq");

    expect(screen.getByLabelText("Base URL")).toHaveValue("https://api.groq.com/openai/v1");
    expect(screen.getAllByLabelText("Model")[0]).toHaveValue("llama-3.3-70b-versatile");
  });

  it("blocks saving an invalid base URL", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.clear(screen.getByLabelText("Base URL"));
    await user.click(screen.getByRole("button", { name: "Save AI Settings" }));

    expect(updateAiConfig).not.toHaveBeenCalled();
  });

  it("saves a valid provider and detects models", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.selectOptions(screen.getByLabelText("Provider preset"), "groq");
    await user.type(screen.getAllByLabelText("API Key")[0], "gsk_test_key");
    await user.click(screen.getByRole("button", { name: "Save & detect models" }));

    expect(updateAiConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        openai_base_url: "https://api.groq.com/openai/v1",
        openai_model: "llama-3.3-70b-versatile",
        openai_api_key: "gsk_test_key",
        default_provider: "openai",
      }),
    );
    expect(commands.getChatModels).toHaveBeenCalled();
  });

  it("sets up OpenRouter directly with a curated model", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("radio", { name: "OpenRouter" }));
    expect(screen.getByLabelText("OpenRouter API Key")).toBeInTheDocument();

    await user.type(screen.getByLabelText("OpenRouter API Key"), "sk-or-test");
    await user.click(screen.getByRole("button", { name: "Save & detect models" }));

    expect(updateAiConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        openai_base_url: "https://openrouter.ai/api/v1",
        openai_model: "anthropic/claude-sonnet-4",
        openai_api_key: "sk-or-test",
        default_provider: "openai",
      }),
    );
  });
});
