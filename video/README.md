# TEMT product video

The narrated product tour (`apps/web/public/video/temt-tour.mp4`) and the end-to-end browser suite. The video is recorded from the real production build, paced to the narration, so what is said always matches what is on screen.

## One-time setup

```sh
npm ci
mkdir -p ~/.cache/temt-tts && cd ~/.cache/temt-tts
python3 -m venv venv && ./venv/bin/pip install kokoro-onnx soundfile faster-whisper
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

The voice is [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0), run locally; nothing is sent to a speech service. Recording uses Google Chrome and ffmpeg.

## Recording

From the repository root, build the site first (`npm run build`), then in `video/`:

| Step | Command | Output |
| --- | --- | --- |
| Narration | `VERIFY=1 npx tsx scripts/voice.ts` | `out/demo/voice/` per-chapter audio and timings; Whisper lists any line not heard as written |
| Dry run | `FAST=1 npx tsx scripts/capture.ts` | checks every step without waiting for narration |
| Capture | `npx tsx scripts/capture.ts` | `out/demo/frames/` and `timeline.json` |
| Encode | `ffmpeg -f concat -safe 0 -i out/demo/frames.txt -vf "fps=30,format=yuv420p" -c:v libx264 -crf 16 public/capture.mp4` | screen recording |
| Soundtrack | `python3 scripts/audio.py` | `public/mix.wav`, captions and `src/demo-data.json` |
| Render | `npx remotion render src/index.ts TemtDemo out/temt-tour-master.mp4` | the finished video |

Narration lives in `scripts/demo-script.ts`. `spoken()` holds the spoken form of acronyms and place names the voice would misread (for example Pune and Kolkata); captions keep the written form. Keep narrated numbers identical to what the product shows.

## End-to-end check

```sh
BASE=http://localhost:3300 npx tsx scripts/e2e.ts
```

Runs the whole product in headless Chrome against the preview server (`node scripts/preview-server.mjs` from the root) and writes screenshots to `out/e2e`.
