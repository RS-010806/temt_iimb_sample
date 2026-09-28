import { Audio, Video } from "@remotion/media";
import { loadFont } from "@remotion/fonts";
import { AbsoluteFill, Easing, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import data from "./demo-data.json";

loadFont({ family: "Playfair", url: staticFile("fonts/playfair-display-latin.woff2") });
loadFont({ family: "Playfair", url: staticFile("fonts/playfair-display-italic-latin.woff2"), style: "italic" });
loadFont({ family: "Open Sans", url: staticFile("fonts/open-sans-latin.woff2") });

const MAROON = "#7a1716";
const SAND = "#f3c9a6";
const WINDOW = { x: 160, y: 78, w: 1600, h: 900 };
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

type Chapter = { id: string; title: string | null; start: number; end: number };
const chapters = data.chapters as Chapter[];
const titled = chapters.filter((chapter) => chapter.title);

const Logo = ({ size = 64 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <circle cx="24" cy="24" r="21" stroke="white" strokeWidth="2.5" />
    <circle cx="13" cy="33" r="3.2" fill="white" />
    <circle cx="35" cy="15" r="3.2" fill={SAND} />
    <path d="M15.5 30.5 L32.5 17.5" stroke="white" strokeWidth="2.2" strokeDasharray="3 3" />
  </svg>
);

function Background() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 120% at ${30 + Math.sin(frame / 240) * 8}% ${10 + Math.cos(frame / 300) * 6}%, #8c1f1d 0%, #5a100f 45%, #240404 100%)` }}>
      <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)", backgroundSize: "64px 64px" }} />
    </AbsoluteFill>
  );
}

/** Animated freight route: a dotted line drawing between two nodes. */
function Route({ progress }: { progress: number }) {
  const length = 1400;
  return (
    <svg width="1920" height="1080" style={{ position: "absolute", inset: 0, opacity: 0.45 }}>
      <path d="M 180 930 C 560 880, 820 990, 1180 900 S 1560 700, 1760 520" stroke="rgba(243,201,166,.55)" strokeWidth="3" fill="none" strokeDasharray="10 12"
        style={{ strokeDashoffset: length * (1 - progress) }} pathLength={length} />
      <circle cx="180" cy="930" r="9" fill="white" opacity={Math.min(1, progress * 4)} />
      <circle cx="1760" cy="520" r="11" fill={SAND} opacity={Math.max(0, progress * 3 - 2)} />
    </svg>
  );
}

function Intro({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const out = interpolate(frame, [(duration - 0.7) * fps, duration * fps], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Route progress={interpolate(frame, [0.2 * fps, 3.2 * fps], [0, 1], { ...clamp, easing: ease })} />
      <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 200, color: "white", fontFamily: "Open Sans" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 26, opacity: interpolate(frame, [0.3 * fps, 1.2 * fps], [0, 1], clamp), translate: interpolate(frame, [0.3 * fps, 1.2 * fps], ["0px 24px", "0px 0px"], { ...clamp, easing: ease }) }}>
          <Logo size={96} />
          <div>
            <div style={{ fontFamily: "Playfair", fontSize: 104, lineHeight: 1, letterSpacing: 2 }}>TEMT</div>
            <div style={{ fontSize: 22, letterSpacing: 8, fontWeight: 700, color: "#f0d7d4", marginTop: 8 }}>IIM BANGALORE</div>
          </div>
        </div>
        <div style={{ fontFamily: "Playfair", fontSize: 58, marginTop: 56, maxWidth: 1250, lineHeight: 1.15, opacity: interpolate(frame, [1.2 * fps, 2.2 * fps], [0, 1], clamp), translate: interpolate(frame, [1.2 * fps, 2.2 * fps], ["0px 24px", "0px 0px"], { ...clamp, easing: ease }) }}>
          Transportation Emission <span style={{ fontStyle: "italic", color: SAND }}>Measurement</span> Tool
        </div>
        <div style={{ fontSize: 26, marginTop: 22, color: "#f0dcd9", opacity: interpolate(frame, [2 * fps, 3 * fps], [0, 1], clamp) }}>
          Supply Chain Management Centre · Product walkthrough
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 44, opacity: interpolate(frame, [2.8 * fps, 3.8 * fps], [0, 1], clamp) }}>
          {["ISO 14083 certified", "India-specific factors", "BRSR-ready reports", "Secure accounts"].map((chip) => (
            <span key={chip} style={{ border: "1px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.08)", borderRadius: 999, padding: "10px 22px", fontSize: 21, fontWeight: 600 }}>{chip}</span>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Outro({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeIn = interpolate(frame, [0, 0.8 * fps], [0, 1], clamp);
  const fadeOut = interpolate(frame, [(duration - 0.8) * fps, duration * fps], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut), justifyContent: "center", alignItems: "center", color: "white", fontFamily: "Open Sans", textAlign: "center" }}>
      <Route progress={interpolate(frame, [0, 2.4 * fps], [0, 1], { ...clamp, easing: ease })} />
      <div style={{ scale: interpolate(frame, [0, 1 * fps], [0.94, 1], { ...clamp, easing: ease }) }}><Logo size={110} /></div>
      <div style={{ fontFamily: "Playfair", fontSize: 76, marginTop: 30 }}>Measure your next shipment.</div>
      <div style={{ fontSize: 28, marginTop: 20, color: "#f0dcd9" }}>India-specific factors · ISO 14083 certified · reports that stand up to scrutiny</div>
      <div style={{ marginTop: 46, fontSize: 30, fontWeight: 700, background: "white", color: MAROON, padding: "16px 34px", borderRadius: 14, opacity: interpolate(frame, [1 * fps, 1.8 * fps], [0, 1], clamp) }}>temt-iimb-sample.onrender.com</div>
      <div style={{ marginTop: 40, fontSize: 20, color: "#e3bdb9" }}>TEMT · TCI–IIMB Supply Chain Sustainability Lab · Supply Chain Management Centre, IIM Bangalore</div>
    </AbsoluteFill>
  );
}

// Rendered inside the product <Sequence>, whose frames start at 0: add the intro back for absolute time.
function ChapterLabel() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps + data.intro;
  const index = titled.findLastIndex((chapter) => chapter.start <= t + 0.05);
  if (index < 0) return null;
  const chapter = titled[index]!;
  const since = t - chapter.start;
  return (
    <div style={{ position: "absolute", left: WINDOW.x, top: 22, display: "flex", alignItems: "center", gap: 14, fontFamily: "Open Sans", color: "white",
      opacity: interpolate(since, [0, 0.45], [0, 1], clamp), translate: interpolate(since, [0, 0.6], ["-18px 0px", "0px 0px"], { ...clamp, easing: ease }) }}>
      <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: 3, color: SAND }}>{String(index + 1).padStart(2, "0")}</span>
      <span style={{ fontSize: 26, fontWeight: 700 }}>{chapter.title}</span>
    </div>
  );
}

function Brandmark() {
  return (
    <div style={{ position: "absolute", right: WINDOW.x, top: 20, display: "flex", alignItems: "center", gap: 12, color: "white", fontFamily: "Open Sans" }}>
      <Logo size={34} />
      <span style={{ fontFamily: "Playfair", fontSize: 28 }}>TEMT</span>
      <span style={{ fontSize: 13, letterSpacing: 3, fontWeight: 700, color: "#f0d7d4" }}>IIM BANGALORE</span>
    </div>
  );
}

function Progress() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps + data.intro;
  const start = data.intro, end = data.intro + data.capture;
  const p = Math.min(1, Math.max(0, (t - start) / (end - start)));
  return (
    <div style={{ position: "absolute", left: WINDOW.x, width: WINDOW.w, top: WINDOW.y + WINDOW.h + 12, height: 4, borderRadius: 4, background: "rgba(255,255,255,.14)" }}>
      <div style={{ width: `${p * 100}%`, height: "100%", borderRadius: 4, background: SAND }} />
      {titled.map((chapter) => <div key={chapter.id} style={{ position: "absolute", left: `${((chapter.start - start) / (end - start)) * 100}%`, top: -3, width: 2, height: 10, background: "rgba(255,255,255,.45)" }} />)}
    </div>
  );
}

function Captions() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const cue = data.captions.find((item) => t >= item.start - 0.05 && t <= item.end + 0.35);
  if (!cue) return null;
  const opacity = Math.min(interpolate(t, [cue.start - 0.05, cue.start + 0.15], [0, 1], clamp), interpolate(t, [cue.end + 0.15, cue.end + 0.35], [1, 0], clamp));
  const inCapture = t > data.intro && t < data.intro + data.capture;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: inCapture ? WINDOW.y + WINDOW.h + 24 : undefined, bottom: inCapture ? undefined : 56, display: "flex", justifyContent: "center", opacity }}>
      <div style={{ maxWidth: 1480, textAlign: "center", fontFamily: "Open Sans", fontSize: inCapture ? 25 : 28, lineHeight: 1.35, fontWeight: 600, color: "white", textShadow: "0 2px 12px rgba(0,0,0,.45)" }}>{cue.text}</div>
    </div>
  );
}

function Capture({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = interpolate(frame, [0, 0.7 * fps], [0, 1], { ...clamp, easing: ease });
  const exit = interpolate(frame, [(duration - 0.6) * fps, duration * fps], [1, 0], clamp);
  return (
    <div style={{ position: "absolute", left: WINDOW.x, top: WINDOW.y, width: WINDOW.w, height: WINDOW.h, borderRadius: 18, overflow: "hidden", background: "white",
      boxShadow: "0 40px 90px -30px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.12)", opacity: Math.min(enter, exit), scale: interpolate(enter, [0, 1], [0.965, 1]) }}>
      <Video src={staticFile("capture.mp4")} muted style={{ width: WINDOW.w, height: WINDOW.h }} />
    </div>
  );
}

export function Demo() {
  const { fps } = useVideoConfig();
  const intro = Math.round(data.intro * fps);
  const capture = Math.round(data.capture * fps);
  const outro = Math.round(data.outro * fps);
  return (
    <AbsoluteFill style={{ backgroundColor: "#240404" }}>
      <Background />
      <Sequence durationInFrames={intro} name="Intro"><Intro duration={data.intro} /></Sequence>
      <Sequence from={intro} durationInFrames={capture} name="Product">
        <Capture duration={data.capture} />
      </Sequence>
      <Sequence from={intro} durationInFrames={capture} name="Chrome" layout="none">
        <ChapterLabel />
        <Brandmark />
        <Progress />
      </Sequence>
      <Sequence from={intro + capture} durationInFrames={outro} name="Outro"><Outro duration={data.outro} /></Sequence>
      <Captions />
      <Audio src={staticFile("mix.wav")} />
    </AbsoluteFill>
  );
}
