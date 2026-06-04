import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useOverlay } from "./useOverlay";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useOverlay", () => {
  it("showCursor invokes overlay_show_cursor with x, y, and label", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useOverlay());

    await act(async () => {
      await result.current.showCursor(100, 200, "click here");
    });

    expect(invoke).toHaveBeenCalledWith("overlay_show_cursor", {
      x: 100,
      y: 200,
      label: "click here",
    });
  });

  it("showCursor invokes with label undefined when omitted", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useOverlay());

    await act(async () => {
      await result.current.showCursor(50, 75);
    });

    expect(invoke).toHaveBeenCalledWith("overlay_show_cursor", {
      x: 50,
      y: 75,
      label: undefined,
    });
  });

  it("showCursors invokes overlay_show_cursors with cursors array", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useOverlay());

    const cursors = [
      { x: 10, y: 20, label: "a" },
      { x: 30, y: 40 },
    ];

    await act(async () => {
      await result.current.showCursors(cursors);
    });

    expect(invoke).toHaveBeenCalledWith("overlay_show_cursors", { cursors });
  });

  it("showRect invokes overlay_show_rect with x, y, w, h, label", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useOverlay());

    await act(async () => {
      await result.current.showRect(10, 20, 300, 400, "region");
    });

    expect(invoke).toHaveBeenCalledWith("overlay_show_rect", {
      x: 10,
      y: 20,
      w: 300,
      h: 400,
      label: "region",
    });
  });

  it("showScribble invokes overlay_show_scribble with points and label", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useOverlay());

    const points: [number, number][] = [
      [0, 0],
      [10, 10],
      [20, 5],
    ];

    await act(async () => {
      await result.current.showScribble(points, "path");
    });

    expect(invoke).toHaveBeenCalledWith("overlay_show_scribble", {
      points,
      label: "path",
    });
  });

  it("showCaption invokes overlay_show_caption with text, x, y", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useOverlay());

    await act(async () => {
      await result.current.showCaption("Hello world", 150, 250);
    });

    expect(invoke).toHaveBeenCalledWith("overlay_show_caption", {
      text: "Hello world",
      x: 150,
      y: 250,
    });
  });

  it("clear invokes overlay_clear with no arguments", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useOverlay());

    await act(async () => {
      await result.current.clear();
    });

    expect(invoke).toHaveBeenCalledWith("overlay_clear");
  });

  it("setVisible(true) invokes set_overlay_visible with { visible: true }", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useOverlay());

    await act(async () => {
      await result.current.setVisible(true);
    });

    expect(invoke).toHaveBeenCalledWith("set_overlay_visible", {
      visible: true,
    });
  });

  it("setVisible(false) invokes set_overlay_visible with { visible: false }", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useOverlay());

    await act(async () => {
      await result.current.setVisible(false);
    });

    expect(invoke).toHaveBeenCalledWith("set_overlay_visible", {
      visible: false,
    });
  });
});
