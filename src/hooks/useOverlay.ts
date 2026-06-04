import { useCallback } from "react";
import { invoke } from "../bindings";

export function useOverlay() {
  const showCursor = useCallback(async (x: number, y: number, label?: string) => {
    return invoke("overlay_show_cursor", { x, y, label });
  }, []);

  const showCursors = useCallback(async (cursors: { x: number; y: number; label?: string }[]) => {
    return invoke("overlay_show_cursors", { cursors });
  }, []);

  const showRect = useCallback(async (x: number, y: number, w: number, h: number, label?: string) => {
    return invoke("overlay_show_rect", { x, y, w, h, label });
  }, []);

  const showScribble = useCallback(async (points: [number, number][], label?: string) => {
    return invoke("overlay_show_scribble", { points, label });
  }, []);

  const showCaption = useCallback(async (text: string, x: number, y: number) => {
    return invoke("overlay_show_caption", { text, x, y });
  }, []);

  const clear = useCallback(async () => {
    return invoke("overlay_clear");
  }, []);

  const setVisible = useCallback(async (visible: boolean) => {
    return invoke("set_overlay_visible", { visible });
  }, []);

  return { showCursor, showCursors, showRect, showScribble, showCaption, clear, setVisible };
}
