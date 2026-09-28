"""
Transcribes narration files with Whisper (faster-whisper, small.en) to check the voice says every word as written.

    python transcribe.py a.wav b.wav ...
"""
import os, sys
os.environ.setdefault("HF_HOME", os.path.expanduser("~/.cache/temt-tts/hf"))
from faster_whisper import WhisperModel

model = WhisperModel("small.en", device="cpu", compute_type="int8")
for path in sys.argv[1:]:
    segments, _ = model.transcribe(path, beam_size=5, language="en")
    print(os.path.basename(path), "→", " ".join(segment.text.strip() for segment in segments), flush=True)
