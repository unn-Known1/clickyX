import { useEffect, useRef } from "react";
import { listen } from "../bindings";
import type { Event } from "../bindings";

/**
 * P1 (H-4): the single correct Tauri-event subscription helper.
 *
 * The old repo-wide pattern was:
 *   const unlisten = await listen(...); unlistenRef.current = unlisten;
 * If the component unmounted while that promise was pending, cleanup saw
 * `null` and the listener leaked forever. This helper uses a cancelled-flag:
 * a listener that resolves after unmount is torn down immediately, and live
 * handlers are never invoked after unmount.
 *
 * The handler is stored in a ref, so changing the callback identity does NOT
 * re-subscribe — only the event name re-subscribes.
 */
export function useTauriEvent<T>(eventName: string, handler: (event: Event<T>) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<T>(eventName, (event) => {
      if (!cancelled) handlerRef.current(event);
    })
      .then((u) => {
        if (cancelled) {
          // Resolved after unmount — tear down immediately, don't leak.
          u();
        } else {
          unlisten = u;
        }
      })
      .catch(() => {
        // listen failed (e.g. not in Tauri runtime) — nothing to clean up.
      });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [eventName]);
}
