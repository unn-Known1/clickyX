import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AiProviderSettings from "./AiProviderSettings";
import { AppProvider } from "../../context/AppContext";
import { commands } from "../../bindings";

const { updateAiConfig, updateAppConfig, chatgptStatus, chatgptSignIn, chatgptSignOut } = vi.hoisted(() => ({
  updateAiConfig: vi.fn().mockResolvedValue({}),
  updateAppConfig: vi.fn().mockResolvedValue({}),
  chatgptStatus: vi.fn(),
  chatgptSignIn: vi.fn(),
  chatgptSignOut: vi.fn(),
}));

const SIGNED_OUT = {
  signed_in: false,
  email: null,
  plan_enabled: false,
  keychain_available: true,
  client_registered: false,
};
const SIGNED_IN = { ...SIGNED_OUT, signed_in: true, email: "me@example.com", plan_enabled: true, client_registered: true };

vi.mock("../../hooks/useAiConfig", () => {
  // Stable reference: the component syncs local state from config in an effect,
  // so a fresh object per render would clobber user edits.
  const config = {
    anthropic_api_key: null,
    anthropic_model: "claude-opus-5-5",
    anthropic_effort: "medium",
    openai_api_key: null,
    openai_model: "gpt-6.1-sol",
    openai_effort: "medium",
    openai_base_url: "https://api.openai.com/v1",
    openai_auth_source: "api_key",
    chatgpt_client_id: null,
    chatgpt_email: null,
    chatgpt_host_id: null,
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
    chatgptStatus,
    chatgptSignIn,
    chatgptSignOut,
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
  chatgptStatus.mockResolvedValue(SIGNED_OUT);
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

  it("shows OpenAI's reasoning effort without 'None' for Sol, and with it for Luna", async () => {
    const user = userEvent.setup();
    renderSettings();

    const effort = screen.getByLabelText("Reasoning effort");
    expect(effort).toHaveValue("medium");
    expect(within(effort).queryByRole("option", { name: "None" })).not.toBeInTheDocument();

    await user.clear(screen.getAllByLabelText("Model")[0]);
    await user.type(screen.getAllByLabelText("Model")[0], "gpt-6-luna");
    expect(within(screen.getByLabelText("Reasoning effort")).getByRole("option", { name: "None" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Reasoning effort"), "none");
    await user.type(screen.getAllByLabelText("API Key")[0], "sk-test");
    await user.click(screen.getByRole("button", { name: "Save & detect models" }));
    expect(updateAiConfig).toHaveBeenCalledWith(
      expect.objectContaining({ openai_model: "gpt-6-luna", openai_effort: "none", openai_auth_source: "api_key" }),
    );
  });

  it("clamps a leftover 'none' effort when the model doesn't allow it", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.clear(screen.getAllByLabelText("Model")[0]);
    await user.type(screen.getAllByLabelText("Model")[0], "gpt-6-luna");
    await user.selectOptions(screen.getByLabelText("Reasoning effort"), "none");
    await user.clear(screen.getAllByLabelText("Model")[0]);
    await user.type(screen.getAllByLabelText("Model")[0], "gpt-6.1-sol");
    await user.type(screen.getAllByLabelText("API Key")[0], "sk-test");
    await user.click(screen.getByRole("button", { name: "Save & detect models" }));
    expect(updateAiConfig).toHaveBeenCalledWith(expect.objectContaining({ openai_effort: "low" }));
  });

  it("hides the sign-in method and effort for third-party endpoints", async () => {
    const user = userEvent.setup();
    renderSettings();
    expect(screen.getByRole("radiogroup", { name: "OpenAI sign-in method" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Provider preset"), "groq");
    expect(screen.queryByRole("radiogroup", { name: "OpenAI sign-in method" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Reasoning effort")).not.toBeInTheDocument();
  });

  it("blocks saving the ChatGPT plan until signed in", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("radio", { name: "ChatGPT plan" }));

    expect(await screen.findByRole("button", { name: "Sign in with ChatGPT" })).toBeInTheDocument();
    expect(screen.queryAllByLabelText("API Key")).toHaveLength(0);
    expect(screen.getByText(/Voice transcription and text-to-speech still need their own API keys/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save & detect models" }));
    expect(updateAiConfig).not.toHaveBeenCalled();
  });

  it("signs in with ChatGPT, shows the account, and saves the plan route without an API key", async () => {
    const user = userEvent.setup();
    chatgptSignIn.mockResolvedValue(SIGNED_IN);
    renderSettings();
    await user.click(screen.getByRole("radio", { name: "ChatGPT plan" }));

    await user.click(await screen.findByRole("button", { name: "Sign in with ChatGPT" }));

    expect(await screen.findByText("Signed in as me@example.com")).toBeInTheDocument();
    expect(screen.getByText("Plan usage: enabled")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View ChatGPT plan usage" })).toHaveAttribute(
      "href",
      "https://chatgpt.com/settings/usage",
    );
    // The sign-in itself persisted the auth source.
    expect(updateAiConfig).toHaveBeenCalledWith({ openai_auth_source: "chatgpt" });

    await user.click(screen.getByRole("button", { name: "Save & detect models" }));
    expect(updateAiConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({ openai_auth_source: "chatgpt", default_provider: "openai" }),
    );
    const payload = updateAiConfig.mock.calls[updateAiConfig.mock.calls.length - 1][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("openai_api_key");
  });

  it("warns when plan usage wasn't granted and offers to sign in again", async () => {
    const user = userEvent.setup();
    chatgptStatus.mockResolvedValue({ ...SIGNED_IN, plan_enabled: false });
    renderSettings();
    await user.click(screen.getByRole("radio", { name: "ChatGPT plan" }));

    expect(await screen.findByText(/Plan usage: not allowed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in again" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save & detect models" }));
    expect(updateAiConfig).not.toHaveBeenCalled();
  });

  it("signs out and falls back to the API key method", async () => {
    const user = userEvent.setup();
    chatgptStatus.mockResolvedValue(SIGNED_IN);
    chatgptSignOut.mockResolvedValue({ revocation_confirmed: true, status: SIGNED_OUT });
    renderSettings();
    await user.click(screen.getByRole("radio", { name: "ChatGPT plan" }));

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(chatgptSignOut).toHaveBeenCalledTimes(1);
    expect(await screen.findAllByLabelText("API Key")).not.toHaveLength(0);
    expect(screen.getByRole("radio", { name: "API key" })).toHaveAttribute("aria-checked", "true");
  });

  it("saves the Claude effort and offers the current Claude models", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("radio", { name: "Anthropic (Claude)" }));

    expect(screen.getByLabelText("Thinking effort")).toHaveValue("medium");
    await user.selectOptions(screen.getByLabelText("Thinking effort"), "xhigh");
    await user.type(screen.getByLabelText("Anthropic (Claude)"), "sk-ant-test");
    await user.click(screen.getByRole("button", { name: "Save & detect models" }));

    expect(updateAiConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        anthropic_model: "claude-opus-5-5",
        anthropic_effort: "xhigh",
        default_provider: "anthropic",
      }),
    );
    const ids = Array.from(document.querySelectorAll("#ai-anthropic-models option")).map((o) => o.getAttribute("value"));
    expect(ids).toEqual(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"]);
  });
});
