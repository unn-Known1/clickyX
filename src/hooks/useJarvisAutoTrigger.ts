import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { commands } from "../bindings";
import type { JarvisStatus } from "../bindings";
import { useTauriEvent } from "./useTauriEvent";
import { JARVIS_STATUS_KEY } from "./useJarvis";

/**
 * Opt-in auto-trigger (Phase 3). Event-driven — no polling, no refetchInterval.
 *
 * Fires `onTrigger` only when ALL hold:
 * - `jarvis.auto_trigger` is on AND enabled AND not paused AND a Jev key exists
 * - the `auto-capture-frame` engine event arrived (engine itself is opt-in)
 * - ≥60s since the last auto run (spend throttle)
 * - the focused-window session changed (title-hash; no re-judge of the same chat)
 *
 * Both flags default OFF, so behavior is unchanged unless the user opts in
 * twice (capture engine + Jarvis auto). Every auto run still goes through the
 * Rust gates + blocklist + fail-closed judge.
 */
export const JARVIS_AUTO_MIN_INTERVAL_MS = 60_000;

export function useJarvisAutoTrigger(onTrigger: () => void) {
  const cbRef = useRef(onTrigger);
  cbRef.current = onTrigger;
  const lastRun = useRef(0);
  const lastSession = useRef<string | null>(null);
  const queryClient = useQueryClient();

  useTauriEvent("auto-capture-frame", () => {
    const status = queryClient.getQueryData<JarvisStatus | null>(JARVIS_STATUS_KEY);
    if (!status?.auto_trigger || !status.enabled || status.paused || !status.has_jev_key) {
      return;
    }
    const now = Date.now();
    if (now - lastRun.current < JARVIS_AUTO_MIN_INTERVAL_MS) {
      return;
    }
    // Session check costs one focused screenshot; throttled above.
    commands
      .jarvisExtract()
      .then((focused) => {
        if (focused.session === lastSession.current) return;
        lastSession.current = focused.session;
        lastRun.current = Date.now();
        cbRef.current();
      })
      .catch(() => {
        // Blocklisted/paused/denied mid-flight — fail closed, stay quiet.
      });
  });
}
