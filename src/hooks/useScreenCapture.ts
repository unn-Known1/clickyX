import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface ScreenImage {
  id: number;
  data: string;
  width: number;
  height: number;
}

export function useScreenCapture() {
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureAll = useCallback(async (): Promise<ScreenImage[]> => {
    setCapturing(true);
    setError(null);
    try {
      const result = await invoke<ScreenImage[]>("capture_screens");
      return result;
    } catch (e) {
      setError(String(e));
      return [];
    } finally {
      setCapturing(false);
    }
  }, []);

  const captureCursorScreen = useCallback(async (): Promise<ScreenImage | null> => {
    setCapturing(true);
    setError(null);
    try {
      return await invoke<ScreenImage>("capture_cursor_screen");
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setCapturing(false);
    }
  }, []);

  const captureFocusedWindow = useCallback(async (): Promise<ScreenImage | null> => {
    setCapturing(true);
    setError(null);
    try {
      return await invoke<ScreenImage | null>("capture_focused_window");
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setCapturing(false);
    }
  }, []);

  return { captureAll, captureCursorScreen, captureFocusedWindow, capturing, error };
}
