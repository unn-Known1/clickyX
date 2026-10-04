import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { CursorActionLayer } from "./CursorActionLayer";
import type { CursorEffect, PointerPosition } from "../hooks/useMouseFollowActions";

let rafCb: FrameRequestCallback | null = null;

function makePointerRef(initial: PointerPosition = { x: 0, y: 0 }) {
  return { current: { ...initial } };
}

beforeEach(() => {
  rafCb = null;
  vi.stubGlobal("requestAnimationFrame", vi.fn((cb: FrameRequestCallback) => {
    rafCb = cb;
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const click: CursorEffect = { id: 1, action: "click", x: 120, y: 80, durationMs: 650 };

describe("CursorActionLayer", () => {
  it("renders nothing while idle", () => {
    const { container } = render(
      <CursorActionLayer effects={[]} sustained={[]} pointerRef={makePointerRef()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders one positioned element per burst effect", () => {
    const { container } = render(
      <CursorActionLayer effects={[click]} sustained={[]} pointerRef={makePointerRef()} />,
    );

    const burst = container.querySelector(".cursor-action");
    expect(burst).not.toBeNull();
    expect(burst).toHaveClass("cursor-action-click");
    expect(burst).toHaveStyle({ left: "120px", top: "80px" });
    expect(burst).toHaveAttribute("aria-hidden", "true");
  });

  it("renders the halo and one aura per sustained action", () => {
    const { container } = render(
      <CursorActionLayer effects={[]} sustained={["listen", "think"]} pointerRef={makePointerRef()} />,
    );

    expect(container.querySelector(".cursor-pointer-halo")).not.toBeNull();
    expect(container.querySelector(".cursor-aura-listen")).not.toBeNull();
    expect(container.querySelector(".cursor-aura-think")).not.toBeNull();
  });

  it("eases the anchor toward the shared pointer on animation frames", () => {
    const pointerRef = makePointerRef({ x: 0, y: 0 });
    const { container } = render(
      <CursorActionLayer effects={[]} sustained={["listen"]} pointerRef={pointerRef} />,
    );
    const anchor = container.querySelector(".cursor-follow-anchor") as HTMLElement;
    expect(anchor).not.toBeNull();

    act(() => {
      pointerRef.current = { x: 700, y: 360 };
      rafCb?.(0);
    });

    const m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(anchor.style.transform);
    expect(m).not.toBeNull();
    // FOLLOW_EASE = 0.35 → first frame lands at 35% of the way to the target.
    expect(Number(m![1])).toBeGreaterThan(0);
    expect(Number(m![1])).toBeLessThan(700);
  });

  it("renders no trail when trailDots is 0 and dots when it is set", () => {
    const off = render(<CursorActionLayer effects={[]} sustained={["think"]} pointerRef={makePointerRef()} />);
    expect(off.container.querySelector(".cursor-trail")).toBeNull();
    off.unmount();

    const on = render(
      <CursorActionLayer effects={[]} sustained={["think"]} pointerRef={makePointerRef()} trailDots={12} />,
    );
    expect(on.container.querySelectorAll(".cursor-trail-dot")).toHaveLength(12);
  });

  it("staggers trail dots behind the pointer on animation frames", () => {
    const pointerRef = makePointerRef({ x: 0, y: 0 });
    const { container } = render(
      <CursorActionLayer effects={[]} sustained={["listen"]} pointerRef={pointerRef} trailDots={3} />,
    );

    act(() => {
      pointerRef.current = { x: 200, y: 100 };
      rafCb?.(0);
      rafCb?.(0);
    });

    const dots = container.querySelectorAll<HTMLElement>(".cursor-trail-dot");
    expect(dots).toHaveLength(3);
    // The newest dot tracks the anchor; older dots trail behind it.
    expect(dots[0].style.transform).toContain("translate3d(0px, 0px, 0)");
    expect(dots[1].style.transform).not.toBe("");
  });

  it("honours the idle-pulse and halo toggles", () => {
    const off = render(
      <CursorActionLayer
        effects={[]}
        sustained={["listen"]}
        pointerRef={makePointerRef()}
        showHalo={false}
        idlePulse={false}
      />,
    );
    expect(off.container.querySelector(".cursor-pointer-halo")).toBeNull();
    expect(off.container.querySelector(".cursor-idle-pulse")).toBeNull();
    off.unmount();

    const on = render(
      <CursorActionLayer
        effects={[]}
        sustained={["listen"]}
        pointerRef={makePointerRef()}
        showHalo={true}
        idlePulse={true}
      />,
    );
    expect(on.container.querySelector(".cursor-pointer-halo")).not.toBeNull();
    expect(on.container.querySelector(".cursor-idle-pulse")).not.toBeNull();
  });

  it("applies the burst size and accent overrides", () => {
    const { container } = render(
      <CursorActionLayer
        effects={[click]}
        sustained={[]}
        pointerRef={makePointerRef()}
        burstSize={60}
        accent="#ff00aa"
      />,
    );

    const burst = container.querySelector<HTMLElement>(".cursor-action")!;
    expect(burst.style.getPropertyValue("--cursor-burst-size")).toBe("60px");
    expect(burst.style.getPropertyValue("--accent")).toBe("#ff00aa");

    const anchor = container.querySelector<HTMLElement>(".cursor-follow-anchor")!;
    expect(anchor.style.getPropertyValue("--accent")).toBe("#ff00aa");
  });

  it("leaves the accent inherited when no override is set", () => {
    const { container } = render(
      <CursorActionLayer effects={[click]} sustained={[]} pointerRef={makePointerRef()} />,
    );
    const burst = container.querySelector<HTMLElement>(".cursor-action")!;
    expect(burst.style.getPropertyValue("--accent")).toBe("");
  });
});
