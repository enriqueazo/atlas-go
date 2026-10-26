"""Synthesises Atlas Go's sounds from sine waves (no third-party audio).

Same recipe as Vocablo: soft bell-like notes, a sine plus a little of its
octave, fading out. Mono 16-bit WAV at 44.1 kHz.

    python3 scripts/make_sounds.py
"""
import math
import struct
import wave
from pathlib import Path

RATE = 44100
OUT = Path(__file__).resolve().parent.parent / "assets" / "sounds"

NOTES = {"C4": 261.63, "E4": 329.63, "C5": 523.25, "E5": 659.25, "G5": 783.99,
         "C6": 1046.5, "E6": 1318.5, "G6": 1568.0, "C7": 2093.0}


def bell(freq, dur, start=0.0, gain=0.5, glide_to=None):
    n = int(dur * RATE)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / RATE
        f = freq if glide_to is None else freq + (glide_to - freq) * (i / n)
        phase += 2 * math.pi * f / RATE
        env = min(1.0, t / 0.006) * math.exp(-t * 5 / dur)
        out.append(gain * env * (math.sin(phase) + 0.25 * math.sin(2 * phase)))
    return start, out


def mix(parts, total):
    buf = [0.0] * int(total * RATE)
    for start, samples in parts:
        off = int(start * RATE)
        for i, s in enumerate(samples):
            if off + i < len(buf):
                buf[off + i] += s
    peak = max(1e-9, max(abs(s) for s in buf))
    scale = min(1.0, 0.9 / peak)
    return [s * scale for s in buf]


def save(name, samples):
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(s * 32767)) for s in samples))


def note(name, start, dur, gain=0.5, **kw):
    s, samples = bell(NOTES[name], dur, gain=gain, **kw)
    return start, samples


save("correct", mix([note("C6", 0, 0.25), note("G6", 0.11, 0.29)], 0.4))
save("wrong", mix([(0, bell(NOTES["E4"], 0.45, gain=0.35, glide_to=NOTES["C4"])[1])], 0.45))
save("tap", mix([(0, bell(1400, 0.05, gain=0.3)[1])], 0.05))
save("zoom", mix([(0, bell(NOTES["C5"], 0.35, gain=0.25, glide_to=NOTES["C6"])[1])], 0.35))
save("record", mix([note("C5", 0, 0.3), note("E5", 0.1, 0.3), note("G5", 0.2, 0.3),
                    note("C6", 0.32, 0.6), note("E6", 0.32, 0.6, gain=0.3),
                    note("G6", 0.32, 0.6, gain=0.25)], 0.95))
# A soft two-note sparkle when a hint or a discard is used.
save("help", mix([note("G6", 0, 0.12, gain=0.3), note("C7", 0.06, 0.2, gain=0.25)], 0.26))
print("sounds written to", OUT)
