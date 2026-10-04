import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProvider } from "../../context/AppContext";
import MouseAnimationsSettings from "./MouseAnimationsSettings";
import { MOUSE_ANIMATION_STORAGE_KEY } from "../../hooks/useMouseAnimationSettings";

function renderSection() {
  return render(
    <AppProvider>
      <MouseAnimationsSettings />
    </AppProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("MouseAnimationsSettings", () => {
  it("renders the master toggle and every feature control", () => {
    renderSection();
    expect(screen.getByRole("heading", { name: "Mouse Animations" })).toBeInTheDocument();
    expect(screen.getByLabelText("Enable mouse animations")).toBeInTheDocument();
    expect(screen.getByLabelText("Cursor trail")).toBeInTheDocument();
    expect(screen.getByLabelText("Follow responsiveness")).toBeInTheDocument();
    expect(screen.getByLabelText("Burst size")).toBeInTheDocument();
    expect(screen.getByLabelText("Max simultaneous bursts")).toBeInTheDocument();
    expect(screen.getByLabelText("Pointer halo")).toBeInTheDocument();
    expect(screen.getByLabelText("Idle pulse")).toBeInTheDocument();
    expect(screen.getByLabelText("Action sounds")).toBeInTheDocument();
    expect(screen.getByLabelText("Animation color")).toBeInTheDocument();
  });

  it("renders a toggle for each of the nine actions", () => {
    renderSection();
    const labels = [
      "Point", "Click", "Select", "Highlight", "Draw",
      "Speak", "Guide", "Listening", "Thinking",
    ];
    for (const label of labels) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("persists the master toggle to localStorage", async () => {
    const user = userEvent.setup();
    renderSection();

    const master = screen.getByLabelText("Enable mouse animations") as HTMLInputElement;
    expect(master.checked).toBe(true);
    await user.click(master);

    expect(master.checked).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(MOUSE_ANIMATION_STORAGE_KEY)!).enabled).toBe(false);
  });

  it("disables the feature controls while animations are off", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByLabelText("Enable mouse animations"));

    expect(screen.getByLabelText("Cursor trail")).toBeDisabled();
    expect(screen.getByLabelText("Action sounds")).toBeDisabled();
  });

  it("stores a chosen trail length", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.selectOptions(screen.getByLabelText("Cursor trail"), "long");

    expect(JSON.parse(window.localStorage.getItem(MOUSE_ANIMATION_STORAGE_KEY)!).trail).toBe("long");
  });

  it("stores a per-action toggle", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByLabelText("Highlight"));

    const stored = JSON.parse(window.localStorage.getItem(MOUSE_ANIMATION_STORAGE_KEY)!);
    expect(stored.actions.highlight).toBe(false);
  });
});