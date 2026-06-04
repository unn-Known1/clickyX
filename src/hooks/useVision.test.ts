import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useVision } from "./useVision";

describe("useVision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with an empty images array", () => {
    const { result } = renderHook(() => useVision());
    expect(result.current.images).toEqual([]);
  });

  describe("addImage", () => {
    it("creates a correct data URL and appends to images", () => {
      const { result } = renderHook(() => useVision());

      act(() => {
        result.current.addImage("abc123");
      });

      expect(result.current.images).toHaveLength(1);
      expect(result.current.images[0]).toEqual({
        data: "data:image/png;base64,abc123",
        mediaType: "image/png",
        previewUrl: "data:image/png;base64,abc123",
      });
    });

    it("uses a custom mediaType when provided", () => {
      const { result } = renderHook(() => useVision());

      act(() => {
        result.current.addImage("xyz789", "image/jpeg");
      });

      expect(result.current.images).toHaveLength(1);
      expect(result.current.images[0]).toEqual({
        data: "data:image/jpeg;base64,xyz789",
        mediaType: "image/jpeg",
        previewUrl: "data:image/jpeg;base64,xyz789",
      });
    });
  });

  describe("addImageFromDataUrl", () => {
    it("extracts mediaType from a well-formed data URL", () => {
      const { result } = renderHook(() => useVision());
      const dataUrl = "data:image/webp;base64,AAAA";

      act(() => {
        result.current.addImageFromDataUrl(dataUrl);
      });

      expect(result.current.images).toHaveLength(1);
      expect(result.current.images[0]).toEqual({
        data: dataUrl,
        mediaType: "image/webp",
        previewUrl: dataUrl,
      });
    });

    it("falls back to image/png for a malformed data URL", () => {
      const { result } = renderHook(() => useVision());
      const malformed = "not-a-real-data-url";

      act(() => {
        result.current.addImageFromDataUrl(malformed);
      });

      expect(result.current.images).toHaveLength(1);
      expect(result.current.images[0]).toEqual({
        data: malformed,
        mediaType: "image/png",
        previewUrl: malformed,
      });
    });
  });

  describe("removeImage", () => {
    it("removes the image at the specified index", () => {
      const { result } = renderHook(() => useVision());

      act(() => {
        result.current.addImage("first");
        result.current.addImage("second");
        result.current.addImage("third");
      });

      expect(result.current.images).toHaveLength(3);

      act(() => {
        result.current.removeImage(1);
      });

      expect(result.current.images).toHaveLength(2);
      expect(result.current.images[0].data).toBe(
        "data:image/png;base64,first",
      );
      expect(result.current.images[1].data).toBe(
        "data:image/png;base64,third",
      );
    });

    it("is a no-op for an out-of-range index", () => {
      const { result } = renderHook(() => useVision());

      act(() => {
        result.current.addImage("only");
      });

      act(() => {
        result.current.removeImage(5);
      });

      expect(result.current.images).toHaveLength(1);
    });
  });

  describe("clearImages", () => {
    it("empties the images array", () => {
      const { result } = renderHook(() => useVision());

      act(() => {
        result.current.addImage("a");
        result.current.addImage("b");
      });

      expect(result.current.images).toHaveLength(2);

      act(() => {
        result.current.clearImages();
      });

      expect(result.current.images).toEqual([]);
    });
  });

  describe("getImageDataUrls", () => {
    it("returns an array of data URL strings", () => {
      const { result } = renderHook(() => useVision());

      act(() => {
        result.current.addImage("img1");
        result.current.addImage("img2", "image/gif");
      });

      const urls = result.current.getImageDataUrls();
      expect(urls).toEqual([
        "data:image/png;base64,img1",
        "data:image/gif;base64,img2",
      ]);
    });

    it("returns an empty array when there are no images", () => {
      const { result } = renderHook(() => useVision());
      expect(result.current.getImageDataUrls()).toEqual([]);
    });
  });

  describe("multiple image operations", () => {
    it("preserves insertion order and correctly removes by index", () => {
      const { result } = renderHook(() => useVision());

      act(() => {
        result.current.addImage("alpha");
        result.current.addImage("beta", "image/jpeg");
        result.current.addImageFromDataUrl("data:image/webp;base64,gamma");
      });

      expect(result.current.images).toHaveLength(3);
      expect(result.current.images.map((i) => i.mediaType)).toEqual([
        "image/png",
        "image/jpeg",
        "image/webp",
      ]);

      // Remove the first image
      act(() => {
        result.current.removeImage(0);
      });

      expect(result.current.images).toHaveLength(2);
      expect(result.current.getImageDataUrls()).toEqual([
        "data:image/jpeg;base64,beta",
        "data:image/webp;base64,gamma",
      ]);

      // Remove the last remaining image (now at index 1)
      act(() => {
        result.current.removeImage(1);
      });

      expect(result.current.images).toHaveLength(1);
      expect(result.current.images[0].data).toBe(
        "data:image/jpeg;base64,beta",
      );
    });
  });
});
