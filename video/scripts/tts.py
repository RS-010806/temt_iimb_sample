"""
Neural narration with Kokoro-82M (Apache-2.0), run locally through kokoro-onnx.

    python tts.py lines.json out_dir [voice] [speed]

lines.json is a list of {"id": ..., "text": ...}; each line is written to out_dir/<id>.wav (24 kHz mono).
The model files live outside the repository (default ~/.cache/temt-tts, or $TEMT_TTS_DIR).
"""
import json, os, sys
import soundfile as sf
from kokoro_onnx import Kokoro

root = os.environ.get("TEMT_TTS_DIR", os.path.expanduser("~/.cache/temt-tts"))
lines_file, out_dir = sys.argv[1], sys.argv[2]
voice = sys.argv[3] if len(sys.argv) > 3 else "af_heart"
speed = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0

kokoro = Kokoro(os.path.join(root, "kokoro-v1.0.onnx"), os.path.join(root, "voices-v1.0.bin"))
os.makedirs(out_dir, exist_ok=True)
for line in json.load(open(lines_file)):
    samples, rate = kokoro.create(line["text"], voice=voice, speed=speed, lang="en-us")
    sf.write(os.path.join(out_dir, f"{line['id']}.wav"), samples, rate)
    print(line["id"], f"{len(samples) / rate:.2f}s", flush=True)
