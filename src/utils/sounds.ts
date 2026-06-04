/**
 * Sound effect player for ClickyX.
 *
 * Audio files live in public/sounds/ and are loaded on first play.
 * Missing files are silently ignored — sounds are non-critical.
 *
 * Usage:
 *   import { Sounds } from "../utils/sounds";
 *   Sounds.agentLaunch();
 */

const soundCache = new Map<string, HTMLAudioElement>();

export async function playSound(name: string, volume = 0.5): Promise<void> {
  try {
    const url = `/sounds/${name}.mp3`;
    if (!soundCache.has(url)) {
      const audio = new Audio(url);
      audio.volume = Math.max(0, Math.min(1, volume));
      soundCache.set(url, audio);
    }
    const audio = soundCache.get(url)!;
    audio.currentTime = 0;
    await audio.play();
  } catch {
    // Silently fail — sound file may not be present in this build
  }
}

/**
 * Pre-cache a set of sounds without playing them.
 * Call this early in the app lifecycle to reduce first-play latency.
 */
export function preloadSounds(names: string[]): void {
  for (const name of names) {
    const url = `/sounds/${name}.mp3`;
    if (!soundCache.has(url)) {
      const audio = new Audio();
      audio.preload = "auto";
      audio.src = url;
      soundCache.set(url, audio);
    }
  }
}

/** Named sound effects. Each method returns a Promise that resolves when playback starts (or immediately on error). */
export const Sounds = {
  /** Played when an agent task starts. */
  agentLaunch: () => playSound("agent-launch", 0.4),
  /** Played when an agent task completes successfully. */
  agentDone: () => playSound("agent-done", 0.5),
  /** Played when an agent panel is closed. */
  agentClose: () => playSound("agent-close", 0.3),
  /** Played when the wake word is detected in always-on mode. */
  wake: () => playSound("wake", 0.6),
  /** Played on error conditions. */
  error: () => playSound("error", 0.4),
  /** Played for desktop notification sounds. */
  notification: () => playSound("notification", 0.5),
};
