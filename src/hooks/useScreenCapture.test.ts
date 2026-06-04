import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useScreenCapture, ScreenImage } from "./useScreenCapture";

const mockedInvoke = vi.mocked(invoke);

const fakeImage: ScreenImage = {
  id: 1,
  data: "base64data",
  width: 1920,
  height: 1080,
};

const fakeImages: ScreenImage[] = [
  fakeImage,
  { id: 2, data: "base64data2", width: 2560, height: 1440 },
];

describe("useScreenCapture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Initial state ──────────────────────────────────────────────

  it("returns capturing=false and error=null initially", () => {
    const { result } = renderHook(() => useScreenCapture());

    expect(result.current.capturing).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.captureAll).toBe("function");
    expect(typeof result.current.captureCursorScreen).toBe("function");
    expect(typeof result.current.captureFocusedWindow).toBe("function");
  });

  // ── captureAll ─────────────────────────────────────────────────

  describe("captureAll", () => {
    it("returns captured images on success and resets capturing", async () => {
      mockedInvoke.mockResolvedValueOnce(fakeImages);
      const { result } = renderHook(() => useScreenCapture());

      let images: ScreenImage[] = [];
      await act(async () => {
        images = await result.current.captureAll();
      });

      expect(mockedInvoke).toHaveBeenCalledWith("capture_screens");
      expect(images).toEqual(fakeImages);
      expect(result.current.capturing).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("sets error and returns empty array on failure", async () => {
      mockedInvoke.mockRejectedValueOnce(new Error("capture failed"));
      const { result } = renderHook(() => useScreenCapture());

      let images: ScreenImage[] = [];
      await act(async () => {
        images = await result.current.captureAll();
      });

      expect(images).toEqual([]);
      expect(result.current.error).toBe("Error: capture failed");
      expect(result.current.capturing).toBe(false);
    });
  });

  // ── captureCursorScreen ────────────────────────────────────────

  describe("captureCursorScreen", () => {
    it("returns the ScreenImage on success", async () => {
      mockedInvoke.mockResolvedValueOnce(fakeImage);
      const { result } = renderHook(() => useScreenCapture());

      let image: ScreenImage | null = null;
      await act(async () => {
        image = await result.current.captureCursorScreen();
      });

      expect(mockedInvoke).toHaveBeenCalledWith("capture_cursor_screen");
      expect(image).toEqual(fakeImage);
      expect(result.current.capturing).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("returns null and sets error on failure", async () => {
      mockedInvoke.mockRejectedValueOnce("no cursor screen");
      const { result } = renderHook(() => useScreenCapture());

      let image: ScreenImage | null = fakeImage;
      await act(async () => {
        image = await result.current.captureCursorScreen();
      });

      expect(image).toBeNull();
      expect(result.current.error).toBe("no cursor screen");
      expect(result.current.capturing).toBe(false);
    });
  });

  // ── captureFocusedWindow ───────────────────────────────────────

  describe("captureFocusedWindow", () => {
    it("returns the ScreenImage on success", async () => {
      mockedInvoke.mockResolvedValueOnce(fakeImage);
      const { result } = renderHook(() => useScreenCapture());

      let image: ScreenImage | null = null;
      await act(async () => {
        image = await result.current.captureFocusedWindow();
      });

      expect(mockedInvoke).toHaveBeenCalledWith("capture_focused_window");
      expect(image).toEqual(fakeImage);
      expect(result.current.capturing).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("returns null and sets error on failure", async () => {
      mockedInvoke.mockRejectedValueOnce(new Error("window not found"));
      const { result } = renderHook(() => useScreenCapture());

      let image: ScreenImage | null = fakeImage;
      await act(async () => {
        image = await result.current.captureFocusedWindow();
      });

      expect(image).toBeNull();
      expect(result.current.error).toBe("Error: window not found");
      expect(result.current.capturing).toBe(false);
    });
  });

  // ── Error clearing ────────────────────────────────────────────

  describe("error clearing", () => {
    it("clears a previous error when a new capture starts", async () => {
      // First call: fail to set an error
      mockedInvoke.mockRejectedValueOnce("first error");
      const { result } = renderHook(() => useScreenCapture());

      await act(async () => {
        await result.current.captureAll();
      });
      expect(result.current.error).toBe("first error");

      // Second call: succeed — error should be cleared
      mockedInvoke.mockResolvedValueOnce(fakeImages);
      await act(async () => {
        await result.current.captureAll();
      });
      expect(result.current.error).toBeNull();
    });

    it("clears error from one method when calling another", async () => {
      // Fail on captureAll
      mockedInvoke.mockRejectedValueOnce("all failed");
      const { result } = renderHook(() => useScreenCapture());

      await act(async () => {
        await result.current.captureAll();
      });
      expect(result.current.error).toBe("all failed");

      // Succeed on captureCursorScreen — error from captureAll is cleared
      mockedInvoke.mockResolvedValueOnce(fakeImage);
      await act(async () => {
        await result.current.captureCursorScreen();
      });
      expect(result.current.error).toBeNull();
    });
  });
});
