"use client";

import { useRef, useState } from "react";
import { PlayCircle } from "lucide-react";
import { TOUR_VIDEO } from "@/lib/tour-video";
import { cx } from "../ui";

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function TourPlayer() {
  const video = useRef<HTMLVideoElement>(null);
  const [current, setCurrent] = useState(0);
  const active = [...TOUR_VIDEO.chapters].reverse().find((chapter) => current >= chapter.at) ?? TOUR_VIDEO.chapters[0];
  const seek = (at: number) => { if (!video.current) return; video.current.currentTime = at; void video.current.play(); };
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl">
        <video ref={video} className="aspect-video w-full" controls playsInline preload="metadata" poster={TOUR_VIDEO.poster} onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}>
          <source src={TOUR_VIDEO.src} type="video/mp4" />
          <track kind="captions" src={TOUR_VIDEO.captions} srcLang="en" label="English" default />
          Your browser cannot play this video. <a href={TOUR_VIDEO.src}>Download it</a>.
        </video>
      </div>
      <nav aria-label="Chapters" className="rounded-3xl border border-white/10 bg-white/5 p-3">
        <p className="px-3 pb-2 pt-1 text-[12px] font-bold uppercase tracking-[0.14em] text-maroon-200">Chapters</p>
        <ol className="grid gap-1">
          {TOUR_VIDEO.chapters.map((chapter) => (
            <li key={chapter.at}>
              <button type="button" onClick={() => seek(chapter.at)} className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[14px] transition", chapter === active ? "bg-white text-maroon-800" : "text-maroon-100 hover:bg-white/10")}>
                <span className="num w-10 shrink-0 text-[12px] opacity-70">{time(chapter.at)}</span><span className="font-semibold">{chapter.title}</span>
                {chapter === active && <PlayCircle size={15} className="ml-auto shrink-0" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
