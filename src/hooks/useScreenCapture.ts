import { useCallback, useState } from "react";
import { commands } from "../bindings";
import type { ScreenImage } from "../bindings";

export type { ScreenImage };

export function useScreenCapture() {
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureAll = useCallback(async (): Promise<ScreenImage[]> => {
    setCapturing(true);
    setError(null);
    try {
      const result = await commands.captureScreens();
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
      return await commands.captureCursorScreen();
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
      return await commands.captureFocusedWindow();
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setCapturing(false);
    }
  }, []);

  return { captureAll, captureCursorScreen, captureFocusedWindow, capturing, error };
}
