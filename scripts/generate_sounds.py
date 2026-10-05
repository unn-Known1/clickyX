#!/usr/bin/env python3
"""Synthesise the ClickyX sound-effect set as MP3 files in public/sounds/.

The SFX are generated from scratch (no third-party samples), so they carry no
licensing constraints. Run from the repo root:

    python3 scripts/generate_sounds.py

Requires `lameenc` (pip install lameenc). Output: 44.1 kHz mono, 128 kbps,
normalised to roughly -6 dBFS peak, with short fade in/out to avoid clicks.

To swap in professionally recorded sounds instead, just replace the .mp3 files
in public/sounds/ — src/utils/sounds.ts picks them up by name.
"""

from __future__ import annotations

import math
import os
import struct
import wave

try:
    import lameenc
except ImportError:  # pragma: no cover - guidance for a bare checkout
    raise SystemExit(
        "lameenc is required to encode MP3: pip install lameenc"
    )

SAMPLE_RATE = 44_100
BIT_RATE = 128
OUT_DIR = os.path.join("public", "sounds")

# Peak target. -6 dBFS leaves ~6 dB of headroom so overlapping one-shots
# (a burst sound while the agent chime plays) never clip after MP3 decode.
PEAK = 10 ** (-6 / 20)


def silence(duration: float) -> list[float]:
    return [0.0] * int(SAMPLE_RATE * duration)


def env_exp(length: int, attack: int = 32, decay: float = 6.0) -> list[float]:
    """Percussive envelope: fast linear attack, exponential decay to silence."""
    out = []
    for i in range(length):
        a = min(1.0, i / max(1, attack))
        d = math.exp(-decay * i / length)
        out.append(a * d)
    return out


def apply_env(samples: list[float], env: list[float]) -> list[float]:
    return [s * env[i] for i, s in enumerate(samples)]


def tone(freq: float, duration: float, kind: str = "sine", detune: float = 0.0) -> list[float]:
    """One oscillator cycle, optionally detuned by `detune` semitones."""
    n = int(SAMPLE_RATE * duration)
    out = []
    for i in range(n):
        t = i / SAMPLE_RATE
        f = freq * (2 ** (detune / 12))
        if kind == "sine":
            v = math.sin(2 * math.pi * f * t)
        elif kind == "tri":
            # Band-limited-ish triangle: cheap and warmer than a square.
            v = 2.0 / math.pi * math.asin(math.sin(2 * math.pi * f * t))
        elif kind == "noise":
            # Deterministic LCG so repeated runs produce identical files.
            v = ((i * 1103515245 + 12345) >> 16 & 0x7FFF) / 16384.0 - 1.0
        else:
            raise ValueError(kind)
        out.append(v)
    return out


def sweep(f0: float, f1: float, duration: float, kind: str = "sine") -> list[float]:
    """Linear frequency sweep from f0 to f1."""
    n = int(SAMPLE_RATE * duration)
    out = []
    phase = 0.0
    for i in range(n):
        frac = i / max(1, n - 1)
        f = f0 + (f1 - f0) * frac
        phase += 2 * math.pi * f / SAMPLE_RATE
        if kind == "sine":
            out.append(math.sin(phase))
        elif kind == "tri":
            out.append(2.0 / math.pi * math.asin(max(-1.0, min(1.0, math.sin(phase)))))
        else:
            raise ValueError(kind)
    return out


def mix(*layers: list[float]) -> list[float]:
    length = max(len(layer) for layer in layers)
    out = [0.0] * length
    for layer in layers:
        for i, v in enumerate(layer):
            out[i] += v
    return out


def concat(*parts: list[float]) -> list[float]:
    out: list[float] = []
    for part in parts:
        out.extend(part)
    return out


def fade_edges(samples: list[float], ms: float = 2.0) -> list[float]:
    """Short fades at both ends so the decoder never sees a step discontinuity."""
    n = int(SAMPLE_RATE * ms / 1000)
    out = list(samples)
    for i in range(min(n, len(out))):
        gain = i / n
        out[i] *= gain
        out[-1 - i] *= gain
    return out


def normalize(samples: list[float], peak: float = PEAK) -> list[float]:
    m = max((abs(s) for s in samples), default=0.0)
    if m == 0.0:
        return samples
    scale = peak / m
    return [s * scale for s in samples]


def to_pcm16(samples: list[float]) -> bytes:
    return b"".join(
        struct.pack("<h", max(-32768, min(32767, int(s * 32767)))) for s in samples
    )


def encode_mp3(samples: list[float], bit_rate: int = BIT_RATE) -> bytes:
    enc = lameenc.Encoder()
    enc.set_bit_rate(bit_rate)
    enc.set_in_sample_rate(SAMPLE_RATE)
    enc.set_channels(1)
    pcm = to_pcm16(samples)
    body = enc.encode(pcm)
    return body + enc.flush()


def write(name: str, samples: list[float]) -> None:
    samples = fade_edges(normalize(samples))
    # Clipping would make rapid cursor bursts crackle, so assert the target peak
    # instead of trusting the normaliser.
    peak = max((abs(s) for s in samples), default=0.0)
    if peak > PEAK + 1e-6:
        raise SystemExit(f"  !! {name} peaks at {peak:.3f}, above target {PEAK:.3f}")
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    with open(path, "wb") as fh:
        fh.write(encode_mp3(samples))
    print(f"  {path}  ({len(samples) / SAMPLE_RATE:.2f}s)")


# ── The individual sounds ────────────────────────────────────────────────────


def agent_launch() -> list[float]:
    """Soft rising whoosh: agent task begins."""
    body = mix(
        sweep(420, 900, 0.38, "sine"),
        [v * 0.4 for v in sweep(840, 1800, 0.38, "tri")],
    )
    return apply_env(body, env_exp(len(body), attack=120, decay=3.0))


def agent_done() -> list[float]:
    """Two-note major resolution: task completed (root, then the octave above)."""
    first = apply_env(tone(660, 0.12, "tri"), env_exp(int(SAMPLE_RATE * 0.12), decay=5.0))
    second = apply_env(tone(990, 0.36, "tri"), env_exp(int(SAMPLE_RATE * 0.36), decay=3.6))
    # A quiet octave shimmer rides along with the second note.
    shimmer = apply_env(
        tone(1980, 0.36, "sine"), env_exp(int(SAMPLE_RATE * 0.36), decay=5.0)
    )
    return concat(first, silence(0.02), mix(second, [v * 0.18 for v in shimmer]))


def agent_close() -> list[float]:
    """Short descending blip: panel dismissed."""
    body = apply_env(
        sweep(820, 380, 0.17, "tri"), env_exp(int(SAMPLE_RATE * 0.17), attack=48, decay=6.0)
    )
    return body


def wake() -> list[float]:
    """Two rising pings: wake word detected."""
    a = apply_env(tone(1046.5, 0.1, "sine"), env_exp(int(SAMPLE_RATE * 0.1), decay=6.0))
    b = apply_env(tone(1568.0, 0.22, "sine"), env_exp(int(SAMPLE_RATE * 0.22), decay=5.0))
    return concat(a, b)


def error() -> list[float]:
    """Low detuned buzz: something went wrong."""
    body = mix(
        tone(196, 0.32, "tri"),
        [v * 0.7 for v in tone(196, 0.32, "tri", detune=0.6)],
    )
    return apply_env(body, env_exp(len(body), attack=16, decay=3.5))


def notification() -> list[float]:
    """Bell-like two-partial chime: desktop notification."""
    body = mix(
        tone(880, 0.7, "sine"),
        [v * 0.45 for v in tone(1320, 0.7, "sine")],
        [v * 0.2 for v in tone(1760, 0.7, "sine")],
    )
    return apply_env(body, env_exp(len(body), attack=24, decay=3.2))


def cursor_action() -> list[float]:
    """Very short, very soft tick — this one fires on every cursor burst.

    Deliberately quiet and short (55 ms) so rapid bursts read as texture rather
    than a machine-gun click; played at 0.25 volume by Sounds.cursorAction().
    """
    body = mix(
        sweep(1500, 2200, 0.055, "sine"),
        [v * 0.35 for v in tone(3200, 0.055, "noise")],
    )
    return apply_env(body, env_exp(len(body), attack=8, decay=9.0))


SOUNDS = {
    "agent-launch": agent_launch,
    "agent-done": agent_done,
    "agent-close": agent_close,
    "wake": wake,
    "error": error,
    "notification": notification,
    "cursor-action": cursor_action,
}


# MPEG audio header tables, used to walk real frames in verify().
# Layer numbering follows the spec: layer_id 1 = Layer III, 2 = II, 3 = I,
# and 0 is reserved. (Getting this backwards silently desyncs the frame walk.)
_BITRATE_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
_BITRATE_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
_BITRATE_L12 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384]
_SAMPLE_RATES = {
    3: [44100, 48000, 32000],  # MPEG-1
    2: [22050, 24000, 16000],  # MPEG-2
    0: [11025, 12000, 8000],   # MPEG-2.5
}


def parse_frames(data: bytes) -> tuple[int, float, list[int]]:
    """Walk every MPEG audio frame in `data` from its real headers.

    Returns (frame_count, duration_seconds, bitrates_kbps). Skips an ID3v2 tag.
    Raises ValueError if no valid frame header is found.
    """
    pos = 0
    if data[:3] == b"ID3" and len(data) > 10:
        tag = data[6:10]
        tag_size = (
            (tag[0] & 0x7F) << 21
            | (tag[1] & 0x7F) << 14
            | (tag[2] & 0x7F) << 7
            | (tag[3] & 0x7F)
        )
        pos = 10 + tag_size

    frames = 0
    samples = 0
    bitrates: list[int] = []
    sample_rate = 0
    while pos < len(data) - 4:
        if data[pos] != 0xFF or (data[pos + 1] & 0xE0) != 0xE0:
            pos += 1
            continue
        version_id = (data[pos + 1] >> 3) & 0x03  # 1 is reserved
        layer_id = (data[pos + 1] >> 1) & 0x03  # 0 is reserved
        bitrate_idx = (data[pos + 2] >> 4) & 0x0F  # 0 = free, 15 = bad
        rate_idx = (data[pos + 2] >> 2) & 0x03  # 3 = reserved
        padding = (data[pos + 2] >> 1) & 0x01
        if (
            version_id == 1
            or layer_id == 0
            or bitrate_idx in (0, 15)
            or rate_idx == 3
        ):
            pos += 1
            continue

        if layer_id == 1:  # Layer III
            table = _BITRATE_V1_L3 if version_id == 3 else _BITRATE_V2_L3
            spf = 1152 if version_id == 3 else 576
        elif layer_id == 2:  # Layer II
            table = _BITRATE_L12
            spf = 1152
        else:  # Layer I
            table = _BITRATE_L12
            spf = 384

        bitrate = table[bitrate_idx]
        sample_rate = _SAMPLE_RATES[version_id][rate_idx]

        if layer_id == 3:  # Layer I uses 4-byte slots
            length = (12 * bitrate * 1000 // sample_rate + padding) * 4
        else:
            # spf/8 == 144 for full-size frames, 72 for half-size (MPEG-2 L3).
            length = spf // 8 * bitrate * 1000 // sample_rate + padding
        if length < 4:
            pos += 1
            continue

        frames += 1
        samples += spf
        bitrates.append(bitrate)
        pos += length

    if frames == 0:
        raise ValueError("no valid MPEG frame headers found")
    return frames, samples / sample_rate, bitrates


def verify(path: str, expected_seconds: float) -> None:
    """Re-read the encoded file and check the decoded duration and bitrate.

    Guards against a silent encoder failure (an empty or truncated buffer that
    still 'succeeds'), which would otherwise ship as a broken click. The
    duration is measured from the real frame headers, not from the input
    sample count, so it also catches frames that were dropped.
    """
    size = os.path.getsize(path)
    with open(path, "rb") as fh:
        data = fh.read()

    if size == 0:
        raise SystemExit(f"  !! {path} is empty")

    try:
        frames, seconds, bitrates = parse_frames(data)
    except ValueError as exc:
        raise SystemExit(f"  !! {path}: {exc} ({size} bytes)") from exc

    # Encoder delay/padding adds a frame or so of slack at either end.
    if abs(seconds - expected_seconds) > 0.12:
        raise SystemExit(
            f"  !! {path}: decoded {seconds:.2f}s but expected ~{expected_seconds:.2f}s"
        )
    print(
        f"     verified: {frames} frames, {seconds:.2f}s "
        f"(expected ~{expected_seconds:.2f}s), {bitrates[0]} kbps, {size} bytes"
    )


def main() -> None:
    print(f"Generating {len(SOUNDS)} sounds into {OUT_DIR}/")
    for name, fn in SOUNDS.items():
        samples = fn()
        write(f"{name}.mp3", samples)
        verify(os.path.join(OUT_DIR, f"{name}.mp3"), len(samples) / SAMPLE_RATE)
    print("Done.")


if __name__ == "__main__":
    main()