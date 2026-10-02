# TEMT product video

The narrated product tour (`apps/web/public/video/temt-tour-<date>.mp4`) and the end-to-end browser suite. The video is recorded from the real production build, paced to the narration, so what is said always matches what is on screen.

## One-time setup

```sh
npm ci
mkdir -p ~/.cache/temt-tts && cd ~/.cache/temt-tts
python3 -m venv venv && ./venv/bin/pip install edge-tts faster-whisper
```

The narrator is Microsoft's **Ava** neural voice (`en-US-AvaNeural`, rate +6%, 96 kbps), generated through `edge-tts` (`scripts/tts_edge.py`). For a commercial release, the same voice is available under licence from Azure AI Speech. `scripts/tts.py` keeps the earlier local Kokoro option. Recording uses Google Chrome and ffmpeg.

## Recording

From the repository root, build the site first (`npm run build`), then in `video/`:

| Step | Command | Output |
| --- | --- | --- |
| Narration | `VERIFY=1 npx tsx scripts/voice.ts` | `out/demo/voice/` per-chapter audio and timings; Whisper lists any line not heard as written |
| Dry run | `FAST=1 npx tsx scripts/capture.ts` | checks every step without waiting for narration |
| Capture | `npx tsx scripts/capture.ts` | `out/demo/frames/` and `timeline.json` |
| Encode | `ffmpeg -f concat -safe 0 -i out/demo/frames.txt -vf "fps=30,format=yuv420p" -c:v libx264 -crf 16 public/capture.mp4` | screen recording |
| Soundtrack | `python3 scripts/audio.py` | `public/mix.wav` (the file the render uses), captions and `src/demo-data.json` |
| Render | `npx remotion render src/index.ts TemtDemo out/temt-tour-master.mp4` | the finished video |

Narration lives in `scripts/demo-script.ts`. `spoken()` holds the spoken form of the few words the voice would misread (for example TEMT spelled out, and Pune); captions keep the written form. Keep narrated numbers identical to what the product shows.

After rendering, transcribe the first seconds of the finished video and compare them with the first caption: this catches a stale soundtrack.

## End-to-end check

```sh
BASE=http://localhost:3300 npx tsx scripts/e2e.ts
```

Runs the whole product in headless Chrome against the preview server (`node scripts/preview-server.mjs` from the root) and writes screenshots to `out/e2e`.
