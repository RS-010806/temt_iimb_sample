"""
Builds the soundtrack for the product video from the capture timeline:
narration per chapter, an ambient music bed that ducks under the voice, and quiet UI sound effects
(clicks, typing, chapter transitions, export chimes). Also writes the layout the Remotion composition
uses (video/src/demo-data.json) and WebVTT captions.

    python3 scripts/audio.py
"""
import json
import subprocess
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48_000
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out" / "demo"
voice = {item["id"]: item for item in json.loads((OUT / "voice" / "voice.json").read_text())}
timeline = json.loads((OUT / "timeline.json").read_text())
script = json.loads(subprocess.run(["npx", "tsx", "-e", "import { CHAPTERS } from './scripts/demo-script'; console.log(JSON.stringify(CHAPTERS.map((c) => ({ id: c.id, title: c.title ?? null }))))"], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
titles = {item["id"]: item["title"] for item in script}

INTRO_LEAD = 1.2          # silence before the first word
INTRO = INTRO_LEAD + voice["intro"]["duration"] + 1.0
CAPTURE = timeline["duration"]
OUTRO_LEAD = 0.8
OUTRO = OUTRO_LEAD + voice["outro"]["duration"] + 2.6
TOTAL = INTRO + CAPTURE + OUTRO
N = int(TOTAL * SR) + SR
rng = np.random.default_rng(7)


def load(path):
    rate, data = wavfile.read(path)
    data = data.astype(np.float32)
    if data.ndim > 1:
        data = data.mean(axis=1)
    peak = np.abs(data).max() or 1
    return data / (32768 if data.dtype != np.float32 and peak > 1.5 else max(peak, 1))


def place(track, clip, at, gain=1.0):
    start = int(at * SR)
    if start >= len(track):
        return
    end = min(len(track), start + len(clip))
    track[start:end] += clip[: end - start] * gain


def bandpass(signal, low, high, order=2):
    return sosfilt(butter(order, [low, high], btype="band", fs=SR, output="sos"), signal)


def lowpass(signal, cutoff, order=2):
    return sosfilt(butter(order, cutoff, btype="low", fs=SR, output="sos"), signal)


# ─── Narration ────────────────────────────────────────────────────────────
narration = np.zeros(N, dtype=np.float32)
captions = []


def add_voice(chapter_id, at):
    item = voice[chapter_id]
    clip = load(item["file"])
    clip = clip / (np.sqrt(np.mean(clip**2)) + 1e-9) * 0.1  # roughly equal level per chapter
    place(narration, clip, at)
    for line in item["lines"]:
        captions.append({"start": at + line["start"], "end": at + line["end"], "text": line["text"]})


add_voice("intro", INTRO_LEAD)
chapter_layout = []
for chapter in timeline["chapters"]:
    start = INTRO + chapter["start"]
    add_voice(chapter["id"], start + 0.15)
    chapter_layout.append({"id": chapter["id"], "title": titles.get(chapter["id"]), "start": start, "end": INTRO + chapter["end"]})
add_voice("outro", INTRO + CAPTURE + OUTRO_LEAD)

# ─── Sound effects ────────────────────────────────────────────────────────
sfx = np.zeros(N, dtype=np.float32)
t_click = np.arange(int(0.045 * SR)) / SR
click = (bandpass(rng.standard_normal(len(t_click)), 1800, 7000) * np.exp(-t_click * 140) * 0.55 + np.sin(2 * np.pi * 1450 * t_click) * np.exp(-t_click * 90) * 0.35).astype(np.float32)
t_key = np.arange(int(0.03 * SR)) / SR
key = (bandpass(rng.standard_normal(len(t_key)), 2500, 9000) * np.exp(-t_key * 220)).astype(np.float32)
t_whoosh = np.arange(int(0.7 * SR)) / SR
sweep = np.concatenate([bandpass(rng.standard_normal(int(0.1 * SR)), 300 + 3000 * i / 7, 700 + 4200 * i / 7) for i in range(7)])[: len(t_whoosh)]
whoosh = (sweep * np.sin(np.pi * t_whoosh / t_whoosh[-1]) ** 2).astype(np.float32)
t_chime = np.arange(int(0.9 * SR)) / SR
chime = ((np.sin(2 * np.pi * 1318.5 * t_chime) + 0.55 * np.sin(2 * np.pi * 1975.5 * t_chime) + 0.2 * np.sin(2 * np.pi * 2637 * t_chime)) * np.exp(-t_chime * 6.5)).astype(np.float32)

for event in timeline["events"]:
    at = INTRO + event["t"]
    kind = event["kind"]
    if kind == "click":
        place(sfx, click, at, 0.16)
    elif kind == "type":
        count = max(1, int(event.get("ms", 300) / 50))
        for i in range(count):
            place(sfx, key, at + i * event["ms"] / 1000 / count + rng.uniform(-0.006, 0.006), 0.05 * rng.uniform(0.6, 1.0))
    elif kind == "whoosh":
        place(sfx, whoosh, at - 0.2, 0.05)
    elif kind == "chime":
        place(sfx, chime, at, 0.045)
    elif kind == "chapter" and titles.get(event.get("id")) and event["t"] > 1:
        place(sfx, whoosh, at - 0.25, 0.028)
place(sfx, whoosh, INTRO - 0.35, 0.05)
place(sfx, whoosh, INTRO + CAPTURE - 0.35, 0.05)

# ─── Music bed: warm pads and a soft plucked arpeggio, D major, 84 bpm ────
bpm, beat = 84, 60 / 84
bar = beat * 4
t = np.arange(N) / SR
music = np.zeros(N, dtype=np.float32)
notes = {"D": 146.83, "E": 164.81, "F#": 185.0, "G": 196.0, "A": 220.0, "B": 246.94, "C#": 277.18}
progression = [["D", "F#", "A"], ["B", "D", "F#"], ["G", "B", "D"], ["A", "C#", "E"]]
chord_len = bar * 2
for index in range(int(TOTAL / chord_len) + 1):
    chord = progression[index % 4]
    start, length = index * chord_len, chord_len + 1.2
    seg = np.arange(int(length * SR)) / SR
    env = np.minimum(1, seg / 1.1) * np.minimum(1, (length - seg) / 1.2)
    pad = np.zeros(len(seg))
    for name in chord:
        f = notes[name]
        for detune in (-0.12, 0.0, 0.13):
            pad += np.sin(2 * np.pi * (f * (1 + detune / 100)) * seg + rng.uniform(0, 6.28)) * 0.33
        pad += 0.25 * np.sin(2 * np.pi * f * 2 * seg)
    bass_note = notes[chord[0]] / 2
    pad += 0.9 * np.sin(2 * np.pi * bass_note * seg) * (0.6 + 0.4 * np.sin(2 * np.pi * seg / chord_len))
    place(music, (lowpass(pad, 1600) * env * 0.05).astype(np.float32), start)
    # Arpeggio: one gentle note per beat.
    arp = chord + [chord[1]]
    for step in range(8):
        f = notes[arp[step % 4]] * 2
        tt = np.arange(int(beat * 1.6 * SR)) / SR
        pluck = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * f * 2 * tt)) * np.exp(-tt * 3.2)
        place(music, (lowpass(pluck, 3000) * 0.022).astype(np.float32), start + step * beat)

# Duck the music under the narration (fast attack, slow release) and lift it for intro and outro.
level = np.sqrt(np.convolve(narration**2, np.ones(int(0.12 * SR)) / int(0.12 * SR), mode="same"))
gate = (level > 0.01).astype(np.float32)
smooth = np.zeros_like(gate)
state = 0.0
for i in range(0, N, 480):
    target = gate[i]
    state += (target - state) * (0.5 if target > state else 0.04)
    smooth[i : i + 480] = state
duck = 1.0 - 0.62 * smooth
fade = np.clip(np.minimum(t / 2.5, (TOTAL - t) / 3.0), 0, 1)
music *= duck * fade

mix = narration * 1.0 + music * 1.0 + sfx
stereo = np.stack([mix, mix], axis=1)
peak = np.abs(stereo).max()
stereo = stereo / peak * 0.89
raw = OUT / "mix-raw.wav"
wavfile.write(raw, SR, (stereo * 32767).astype(np.int16))
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", str(SR), str(OUT / "mix.wav")], check=True)


def stamp(seconds):
    ms = int(round(seconds * 1000))
    return f"{ms // 3_600_000:02d}:{ms // 60_000 % 60:02d}:{ms // 1000 % 60:02d}.{ms % 1000:03d}"


captions.sort(key=lambda c: c["start"])
vtt = ["WEBVTT", ""]
for i, cue in enumerate(captions, 1):
    vtt += [str(i), f"{stamp(cue['start'])} --> {stamp(cue['end'] + 0.25)}", cue["text"], ""]
(OUT / "captions.vtt").write_text("\n".join(vtt))

data = {
    "fps": 30, "total": TOTAL, "intro": INTRO, "capture": CAPTURE, "outro": OUTRO,
    "chapters": chapter_layout, "captions": captions,
    "events": [{"kind": e["kind"], "t": INTRO + e["t"]} for e in timeline["events"] if e["kind"] in ("click",)],
}
(ROOT / "src" / "demo-data.json").write_text(json.dumps(data, indent=1))
print(f"Soundtrack {TOTAL:.1f} s (intro {INTRO:.1f}, capture {CAPTURE:.1f}, outro {OUTRO:.1f}); {len(captions)} captions")
