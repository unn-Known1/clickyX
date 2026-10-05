# ClickyX Sound Assets

Place the following audio files in this directory:

| Filename | Trigger | Duration |
|----------|---------|----------|
| `agent-launch.mp3` | Agent task starts | 0.38s |
| `agent-done.mp3` | Agent task completes | 0.50s |
| `agent-close.mp3` | Agent panel closed | 0.17s |
| `wake.mp3` | Wake word detected | 0.32s |
| `error.mp3` | Error condition | 0.32s |
| `notification.mp3` | Desktop notification | 0.70s |
| `cursor-action.mp3` | Overlay cursor-action burst | 0.05s |

These files are **generated, not sampled** — see below.

## Regenerating

```sh
pip install lameenc
python3 scripts/generate_sounds.py
```

`scripts/generate_sounds.py` synthesises every sound from oscillators, so the set
carries no third-party licensing constraints. It re-reads each encoded file and
fails if the frame headers do not decode back to roughly the intended duration, or
if a sample peaks above -6 dBFS — so a broken or clipping encode cannot be
committed silently.

To use real recordings instead, just drop your own `.mp3` files in this directory
using the filenames above. The script does not need to be re-run.

## Where to find royalty-free sounds, if you want to replace these

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
