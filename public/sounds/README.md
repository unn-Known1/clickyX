# ClickyX Sound Assets

Place the following audio files in this directory:

| Filename | Trigger | Recommended duration |
|----------|---------|---------------------|
| `agent-launch.mp3` | Agent task starts | 0.3–0.5s |
| `agent-done.mp3` | Agent task completes | 0.5–1.0s |
| `agent-close.mp3` | Agent panel closed | 0.2–0.4s |
| `wake.mp3` | Wake word detected | 0.3–0.5s |
| `error.mp3` | Error condition | 0.3–0.5s |
| `notification.mp3` | Desktop notification | 0.5–1.0s |

These files are **not included in the repository** due to licensing constraints.

## Where to find royalty-free sounds

- [Freesound.org](https://freesound.org) — CC0 and CC-BY sounds
- [Zapsplat](https://www.zapsplat.com) — free with attribution
- [Pixabay Sounds](https://pixabay.com/sound-effects/) — royalty-free
- Generate with AI: [ElevenLabs Sound Effects](https://elevenlabs.io/sound-effects)

## Format requirements

- Format: MP3 (44.1kHz, 128kbps or higher)
- Volume: normalized to -6dBFS
- Silence padding: max 50ms at start

## Adding sounds to the app

The `src/utils/sounds.ts` utility loads sounds lazily. Add the file here and it
will be picked up automatically on next app start. Missing files are silently ignored.
