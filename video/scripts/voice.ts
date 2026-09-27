/**
 * Synthesises the narration with macOS's "Rishi" (Indian English) voice, one file per line, cleaned up and
 * joined per chapter. Writes out/demo/voice/<chapter>.wav and voice.json with exact line timings for captions.
 *
 *   npx tsx scripts/voice.ts
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CHAPTERS, INTRO, OUTRO, spoken, type ChapterScript } from "./demo-script";

const OUT = join(import.meta.dirname, "../out/demo/voice");
const RATE = 168;
const GAP = 0.38;

const duration = (file: string) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());

export interface VoiceChapter { id: string; file: string; duration: number; lines: { text: string; start: number; end: number }[] }

function synthesise(chapter: ChapterScript): VoiceChapter {
  const parts: string[] = [];
  const lines: VoiceChapter["lines"] = [];
  let cursor = 0;
  chapter.lines.forEach((line, index) => {
    const raw = join(OUT, `${chapter.id}-${index}.aiff`);
    const clean = join(OUT, `${chapter.id}-${index}.wav`);
    execFileSync("say", ["-v", "Rishi", "-r", String(RATE), "-o", raw, spoken(line)]);
    // Trim the synthesiser's leading and trailing silence, then gentle clean-up: rumble filter, presence, light compression.
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", raw, "-af",
      "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse," +
      "aresample=48000,highpass=f=75,equalizer=f=220:t=q:w=1:g=1.5,equalizer=f=3200:t=q:w=1.2:g=2.5,acompressor=threshold=-21dB:ratio=2.5:attack=6:release=90:makeup=2",
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

mkdirSync(OUT, { recursive: true });
const all = [INTRO, ...CHAPTERS, OUTRO].map((chapter) => { const voice = synthesise(chapter); console.log(`${voice.id.padEnd(16)} ${voice.duration.toFixed(1)} s`); return voice; });
writeFileSync(join(OUT, "voice.json"), JSON.stringify(all, null, 2));
console.log(`Total narration ${all.reduce((sum, item) => sum + item.duration, 0).toFixed(0)} s`);
