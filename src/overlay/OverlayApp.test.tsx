import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, waitFor, cleanup } from "@testing-library/react";

// Capture every overlay event listener the component registers, so the test can
// drive the feature through its real surface (the Tauri event bus) rather than
// poking component internals.
type Handler = (e: { payload: unknown }) => void;
const handlers: Record<string, Handler[]> = {};

vi.mock("../bindings", () => ({
  listen: vi.fn(async (event: string, handler: Handler) => {
    (handlers[event] ||= []).push(handler);
    return () => {
      handlers[event] = (handlers[event] || []).filter((h) => h !== handler);
    };
  }),
}));

// The overlay window is click-through, so no `mousemove` ever reaches it in the
// real app. useGlobalCursor falls back to Tauri's cursorPosition() polling.
// Mock it here so the pet-follows-cursor test exercises that same fallback
// rather than jsdom's synthetic mouse events (which would pass even without the fix).
const cursorPosition = vi.fn(async () => ({ x: 0, y: 0 }));
const outerPosition = vi.fn(async () => ({ x: 0, y: 0 }));
vi.mock("@tauri-apps/api/window", () => ({
  cursorPosition: () => cursorPosition(),
  getCurrentWindow: () => ({ outerPosition: () => outerPosition() }),
}));

import OverlayApp from "./OverlayApp";

function emit(event: string, payload: unknown = {}) {
  act(() => {
    (handlers[event] || []).forEach((h) => h({ payload }));
  });
}

async function readyFor(event: string) {
  await waitFor(() => expect(handlers[event]?.length).toBeGreaterThan(0));
}

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  cursorPosition.mockReset().mockResolvedValue({ x: 0, y: 0 });
  outerPosition.mockReset().mockResolvedValue({ x: 0, y: 0 });
});

afterEach(() => {
  cleanup();
});

describe("OverlayApp mouse-follow actions (real event surface)", () => {
  it("maps every overlay event to its correct burst animation", async () => {
    const { container } = render(<OverlayApp />);
    await readyFor("show-cursor");

    // Static cursor placement → point
    emit("show-cursor", { id: "cursor-1", x: 100, y: 100 });
    expect(container.querySelector(".cursor-action-point")).not.toBeNull();

    // Traveling cursor → guide
    emit("show-cursor", { id: "cursor-2", x: 300, y: 300, animation: "arc", fromX: 10, fromY: 10 });
    expect(container.querySelector(".cursor-action-guide")).not.toBeNull();

    emit("show-rect", { id: "rect-1", x: 1, y: 1, w: 2, h: 2 });
    expect(container.querySelector(".cursor-action-select")).not.toBeNull();

    emit("show-scribble", { points: [[0, 0]], label: "x" });
    expect(container.querySelector(".cursor-action-draw")).not.toBeNull();

    emit("show-caption", { text: "hello there world", x: 5, y: 5 });
    expect(container.querySelector(".cursor-action-speak")).not.toBeNull();

    emit("show-highlight", { id: "hl-1", x: 1, y: 1, w: 2, h: 2 });
    expect(container.querySelector(".cursor-action-highlight")).not.toBeNull();

    emit("show-shape", { id: "sh-1", shapeType: "arrow", x1: 0, y1: 0, x2: 1, y2: 1 });
    expect(container.querySelector(".cursor-action-guide")).not.toBeNull();

    // A completed cursor lifecycle event → click
    emit("lifecycle-event", { action: "lifecycle", id: "cursor-1", state: "completed" });
    expect(container.querySelector(".cursor-action-click")).not.toBeNull();
  });

  it("anchors bursts to the annotation coordinates (not the untracked pointer)", async () => {
    const { container } = render(<OverlayApp />);
    await readyFor("show-rect");

    emit("show-rect", { id: "rect-9", x: 10, y: 20, w: 100, h: 50 });
    const select = container.querySelector(".cursor-action-select") as HTMLElement;
    expect(select).not.toBeNull();
    expect(select).toHaveStyle({ left: "60px", top: "45px" }); // rect centre

    emit("show-cursor", { id: "cursor-9", x: 300, y: 400 });
    const point = container.querySelector(".cursor-action-point") as HTMLElement;
    expect(point).toHaveStyle({ left: "300px", top: "400px" });
  });

  it("spawns a sustained aura for listen/think and clears it on end", async () => {
    const { container } = render(<OverlayApp />);
    await readyFor("processing-start");

    emit("processing-start");
    await waitFor(() => expect(container.querySelector(".cursor-aura-think")).not.toBeNull());

    emit("waveform-start");
    await waitFor(() => expect(container.querySelector(".cursor-aura-listen")).not.toBeNull());

    emit("processing-end");
    await waitFor(() => expect(container.querySelector(".cursor-aura-think")).toBeNull());
    // listen aura must persist independently of think
    expect(container.querySelector(".cursor-aura-listen")).not.toBeNull();

    emit("waveform-end");
    await waitFor(() => expect(container.querySelector(".cursor-aura-listen")).toBeNull());
    // no auras left → the layer unmounts entirely
    expect(container.querySelector(".cursor-follow-anchor")).toBeNull();
  });

  it("expires burst effects after their animation lifetime", async () => {
    const { container } = render(<OverlayApp />);
    await readyFor("show-rect");

    emit("show-rect", { id: "rect-2", x: 1, y: 1, w: 2, h: 2 });
    expect(container.querySelector(".cursor-action-select")).not.toBeNull();

    // select burst lifetime is 800ms — it must self-remove.
    await waitFor(() => expect(container.querySelector(".cursor-action-select")).toBeNull(), {
      timeout: 2000,
    });
  });

  it("clear-overlays removes bursts and auras", async () => {
    const { container } = render(<OverlayApp />);
    await readyFor("clear-overlays");

    emit("waveform-start");
    emit("show-rect", { id: "rect-3", x: 1, y: 1, w: 2, h: 2 });
    await waitFor(() => expect(container.querySelector(".cursor-aura-listen")).not.toBeNull());
    expect(container.querySelector(".cursor-action-select")).not.toBeNull();

    emit("clear-overlays");
    await waitFor(() => expect(container.querySelector(".cursor-action")).toBeNull());
    expect(container.querySelector(".cursor-aura-listen")).toBeNull();
    expect(container.querySelector(".cursor-follow-anchor")).toBeNull();
  });

  it("renders a directional scroll ripple from the CUA event at the fresh OS cursor", async () => {
    cursorPosition.mockResolvedValue({ x: 240, y: 160 });
    outerPosition.mockResolvedValue({ x: 40, y: 10 });
    const dpr = window.devicePixelRatio || 1;
    const { container } = render(<OverlayApp />);
    await readyFor("cua-scroll");

    emit("cua-scroll", "right");
    await waitFor(() => expect(container.querySelector(".cursor-action-scroll")).not.toBeNull());
    const scroll = container.querySelector(".cursor-action-scroll") as HTMLElement;
    expect(scroll).toHaveStyle({ left: `${200 / dpr}px`, top: `${150 / dpr}px` });
    expect(scroll.style.getPropertyValue("--scroll-dir")).toBe("-90deg");
    expect(scroll.querySelectorAll(".cursor-ripple")).toHaveLength(3);

    emit("cua-scroll", "diagonal");
    expect(container.querySelectorAll(".cursor-action-scroll")).toHaveLength(1);
  });

  it("spawns typing bursts when type mode is armed", async () => {
    const { container } = render(<OverlayApp />);
    await readyFor("type-mode-changed");

    emit("type-mode-changed", "active");
    await waitFor(() => expect(container.querySelector(".cursor-action-typing")).not.toBeNull());
  });

  it("ignores type-mode payloads that are not 'active'", async () => {
    const { container } = render(<OverlayApp />);
    await readyFor("type-mode-changed");

    emit("type-mode-changed", "Idle");
    // Give the staggered timers a chance to fire before asserting nothing spawned.
    await new Promise((r) => setTimeout(r, 350));
    expect(container.querySelector(".cursor-action-typing")).toBeNull();
  });

  it("makes the pet chase the pointer via the OS cursor fallback", async () => {
    // No mousemove is ever dispatched: in the real click-through overlay window
    // none arrives. The pet must therefore move off the shared cursor ref that
    // useGlobalCursor fills from cursorPosition() polling.
    cursorPosition.mockResolvedValue({ x: 900, y: 700 });
    outerPosition.mockResolvedValue({ x: 0, y: 0 });
    const dpr = window.devicePixelRatio || 1;

    const { container } = render(<OverlayApp />);
    await readyFor("waveform-start");

    emit("waveform-start");
    await waitFor(() => expect(container.querySelector(".pet-sprite")).not.toBeNull());

    const startLeft = parseFloat(container.querySelector<HTMLElement>(".pet-sprite")!.style.left);

    // The pet must ease toward the polled cursor position, not sit at centre.
    await waitFor(
      () => {
        const left = parseFloat(container.querySelector<HTMLElement>(".pet-sprite")!.style.left);
        expect(left).toBeGreaterThan(startLeft);
      },
      { timeout: 3000 },
    );

    // And it should keep approaching the real polled position (~900/dpr).
    await waitFor(
      () => {
        const left = parseFloat(container.querySelector<HTMLElement>(".pet-sprite")!.style.left);
        expect(left).toBeGreaterThan(900 / dpr * 0.5);
      },
      { timeout: 5000 },
    );
  });
});
