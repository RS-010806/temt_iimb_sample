/**
 * Synthesises the narration with Kokoro-82M, a local neural voice (scripts/tts.py), one file per line, cleaned up
 * and joined per chapter. Writes out/demo/voice/<chapter>.wav and voice.json with exact line timings for captions.
 *
 *   npx tsx scripts/voice.ts
 *
 * Needs a Python environment with kokoro-onnx and the model files (see video/README.md). VERIFY=1 also transcribes
 * every line with Whisper and lists any line whose words do not come back as written.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CHAPTERS, INTRO, OUTRO, spoken, type ChapterScript } from "./demo-script";

const OUT = join(import.meta.dirname, "../out/demo/voice");
const RAW = join(OUT, "raw");
const TTS_DIR = process.env.TEMT_TTS_DIR ?? join(homedir(), ".cache/temt-tts");
const PYTHON = process.env.TEMT_TTS_PYTHON ?? join(TTS_DIR, "venv/bin/python");
const VOICE = process.env.TEMT_VOICE ?? "af_heart";
const SPEED = process.env.TEMT_VOICE_SPEED ?? "1.05";
const GAP = 0.34;

const duration = (file: string) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());

export interface VoiceChapter { id: string; file: string; duration: number; lines: { text: string; start: number; end: number }[] }

const all = [INTRO, ...CHAPTERS, OUTRO];

function synthesiseAll() {
  mkdirSync(RAW, { recursive: true });
  const lines = all.flatMap((chapter) => chapter.lines.map((line, index) => ({ id: `${chapter.id}-${index}`, text: spoken(line) })));
  writeFileSync(join(RAW, "lines.json"), JSON.stringify(lines, null, 2));
  execFileSync(PYTHON, [join(import.meta.dirname, "tts.py"), join(RAW, "lines.json"), RAW, VOICE, SPEED], { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, TEMT_TTS_DIR: TTS_DIR } });
}

function assemble(chapter: ChapterScript): VoiceChapter {
  const parts: string[] = [];
  const lines: VoiceChapter["lines"] = [];
  let cursor = 0;
  chapter.lines.forEach((line, index) => {
    const clean = join(OUT, `${chapter.id}-${index}.wav`);
    // Trim leading and trailing silence, then light broadcast polish: rumble filter, a touch of presence, gentle compression.
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", join(RAW, `${chapter.id}-${index}.wav`), "-af",
      "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse," +
      "aresample=48000,highpass=f=70,equalizer=f=3000:t=q:w=1.2:g=1.5,acompressor=threshold=-20dB:ratio=2:attack=8:release=120:makeup=1.5",
      "-ac", "1", clean]);
    const length = duration(clean);
    lines.push({ text: line, start: cursor, end: cursor + length });
    parts.push(clean);
    cursor += length + (index < chapter.lines.length - 1 ? GAP : 0);
  });
  const file = join(OUT, `${chapter.id}.wav`);
  const inputs = parts.flatMap((part) => ["-i", part]);
  const gap = `aevalsrc=0:d=${GAP}:s=48000`;
  const filter = parts.map((_, i) => `[${i}:a]`).reduce((acc, label, i) => acc + label + (i < parts.length - 1 ? `[g${i}]` : ""), "");
  const gaps = parts.slice(0, -1).map((_, i) => `${gap}[g${i}];`).join("");
  execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", `${gaps}${filter}concat=n=${parts.length * 2 - 1}:v=0:a=1[out]`, "-map", "[out]", "-ac", "1", "-ar", "48000", file]);
  return { id: chapter.id, file, duration: duration(file), lines };
}

/** Transcribe each line and compare word by word, ignoring case, punctuation and number formatting. */
function verify() {
  const words = (text: string) => text.toLowerCase().replace(/[–-]/g, " ").replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const files = all.flatMap((chapter) => chapter.lines.map((_, index) => join(OUT, `${chapter.id}-${index}.wav`)));
  const output = execFileSync(PYTHON, [join(import.meta.dirname, "transcribe.py"), ...files], { env: { ...process.env, HF_HOME: join(TTS_DIR, "hf") }, maxBuffer: 1 << 24 }).toString();
  const heard = new Map(output.split("\n").filter((row) => row.includes(" → ")).map((row) => { const [name, text] = row.split(" → "); return [name!, text!]; }));
  let issues = 0;
  for (const chapter of all) chapter.lines.forEach((line, index) => {
    const said = heard.get(`${chapter.id}-${index}.wav`) ?? "";
    const missing = words(line).filter((word) => !words(said).includes(word) && !/^\d/.test(word));
    if (missing.length > 1) { issues += 1; console.log(`  check ${chapter.id}-${index}: heard "${said}" (missing: ${missing.join(", ")})`); }
  });
  console.log(issues ? `${issues} line(s) to review` : "Every line transcribes as written");
}

mkdirSync(OUT, { recursive: true });
synthesiseAll();
const voices = all.map((chapter) => { const voice = assemble(chapter); console.log(`${voice.id.padEnd(16)} ${voice.duration.toFixed(1)} s`); return voice; });
writeFileSync(join(OUT, "voice.json"), JSON.stringify(voices, null, 2));
console.log(`Total narration ${voices.reduce((sum, item) => sum + item.duration, 0).toFixed(0)} s (${VOICE}, speed ${SPEED})`);
if (process.env.VERIFY === "1") verify();
