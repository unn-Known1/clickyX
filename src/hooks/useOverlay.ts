import { useCallback } from "react";
import { commands } from "../bindings";

export function useOverlay() {
  const showCursor = useCallback(async (x: number, y: number, label?: string) => {
    return commands.overlayShowCursor(x, y, label);
  }, []);

  const showCursors = useCallback(async (cursors: { x: number; y: number; label?: string }[]) => {
    return commands.overlayShowCursors(cursors);
  }, []);

  const showRect = useCallback(async (x: number, y: number, w: number, h: number, label?: string) => {
    return commands.overlayShowRect(x, y, w, h, label);
  }, []);

  const showScribble = useCallback(async (points: [number, number][], label?: string) => {
    return commands.overlayShowScribble(points, label);
  }, []);

  const showCaption = useCallback(async (text: string, x: number, y: number) => {
    return commands.overlayShowCaption(text, x, y);
  }, []);

  const clear = useCallback(async () => {
    return commands.overlayClear();
  }, []);

  const setVisible = useCallback(async (visible: boolean) => {
    return commands.setOverlayVisible(visible);
  }, []);

  return { showCursor, showCursors, showRect, showScribble, showCaption, clear, setVisible };
}
