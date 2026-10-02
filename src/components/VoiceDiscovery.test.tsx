import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { commands } from "../bindings";
import VoiceDiscovery from "./VoiceDiscovery";

const voice = {
  id: "84982e79-c596-4883-b6fa-9af334767aef", provider: "sixtydb",
  name: "Catalog voice", description: "", accent_color: "#4fc3f7",
  gender: "female", style: "60db Quality", language: "hi", tier: "premium",
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setup() {
  vi.spyOn(commands, "getVoiceProviders").mockResolvedValue([
    { id: "sixtydb", name: "60db", tier: "premium", requires_key: true },
  ]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>
    <VoiceDiscovery audioConfig={{ tts_provider: "sixtydb", selected_voice_id: "" }} />
  </QueryClientProvider>);
  return client;
}

describe("dynamic voice discovery", () => {
  it("persists the catalog provider and invalidates audio settings after selection", async () => {
    vi.spyOn(commands, "getVoices").mockResolvedValue([voice]);
    const select = vi.spyOn(commands, "selectVoice").mockResolvedValue();
    const client = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(await screen.findByRole("option", { name: "Catalog voice" }));
    await waitFor(() => expect(select).toHaveBeenCalledWith(voice.id, voice.accent_color, "sixtydb"));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["audio_config"] }));
  });

  it("shows credential errors instead of silently presenting an empty catalog", async () => {
    vi.spyOn(commands, "getVoices").mockRejectedValue(new Error("Configure a 60db API key before loading voices"));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Configure a 60db API key");
  });
});
