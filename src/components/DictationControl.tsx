"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, Square, X } from "lucide-react";
import { DICTATION_SHORTCUT } from "@/lib/useDictation";

const BARS = 4;

/** A small pill of bars that move with your voice (with no microphone level to read, they sway gently). */
export function DictationBars({ stream }: { stream: MediaStream | null }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    let raf = 0;
    let ctx: AudioContext | null = null;
    const height = (el: HTMLSpanElement | null, level: number) => {
      if (el) el.style.height = `${4 + Math.round(Math.min(1, Math.max(0, level)) * 14)}px`;
    };

    if (stream) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AC();
        void ctx.resume();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.6;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const smooth = new Array(BARS).fill(0);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          // Speech sits in the low bins: split them into four bands, one per bar.
          const usable = Math.min(data.length, 28);
          const per = Math.floor(usable / BARS);
          for (let b = 0; b < BARS; b++) {
            let sum = 0;
            for (let i = b * per; i < (b + 1) * per; i++) sum += data[i];
            const target = Math.min(1, Math.max(0, (sum / per - 12) / 90));
            smooth[b] += (target - smooth[b]) * 0.45;
            height(bars.current[b], smooth[b]);
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        // fall through to the gentle sway below
      }
    }
    if (!raf) {
      const tick = (now: number) => {
        for (let b = 0; b < BARS; b++) height(bars.current[b], 0.3 + 0.25 * Math.sin(now / 280 + b * 1.4));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => {
      cancelAnimationFrame(raf);
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    };
  }, [stream]);

  return (
    <span
      aria-hidden
      className="flex h-8 items-center gap-[3px] rounded-full bg-black/[0.07] px-3 dark:bg-white/[0.12]"
    >
      {Array.from({ length: BARS }, (_, i) => (
        <span key={i} ref={(el) => void (bars.current[i] = el)} className="w-[3px] rounded-full bg-brand transition-[height] duration-75" style={{ height: 4 }} />
      ))}
    </span>
  );
}

const WAVE = 56; // how many bars the scrolling wave holds

/**
 * The recording bar shown while the mic is on: cancel, a wave that scrolls left as you speak, done, send.
 * Enter sends and Escape cancels, so the keyboard works even though the text box is hidden meanwhile.
 */
export function DictationBar({
  stream,
  heard,
  preview,
  onCancel,
  onDone,
  onSend,
}: {
  stream: MediaStream | null;
  heard: boolean;
  preview: string;
  onCancel: () => void;
  onDone: () => void;
  onSend: () => void;
}) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const [silent, setSilent] = useState(false);
  const handlers = useRef({ onCancel, onSend });
  useEffect(() => {
    handlers.current = { onCancel, onSend };
  });

  // No words after 5 seconds: say so, so a dead microphone is noticed before the message is sent.
  useEffect(() => {
    if (heard) {
      setSilent(false);
      return;
    }
    const t = setTimeout(() => setSilent(true), 5000);
    return () => clearTimeout(t);
  }, [heard]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (!e.repeat) handlers.current.onSend();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handlers.current.onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const levels = new Array<number>(WAVE).fill(0);
    const paint = () => {
      levels.forEach((lv, i) => {
        const el = bars.current[i];
        if (!el) return;
        el.style.height = `${3 + Math.round(Math.min(1, lv) * 26)}px`;
        el.style.opacity = lv > 0.04 ? "0.85" : "0.3";
      });
    };
    let ctx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    const data = new Uint8Array(512);
    if (stream) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AC();
        void ctx.resume();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
      } catch {
        analyser = null;
      }
    }
    const timer = setInterval(() => {
      let level = 0;
      if (analyser) {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        level = Math.min(1, Math.sqrt(sum / data.length) * 5); // loudness of the last moment
      }
      levels.push(level);
      levels.shift();
      paint();
    }, 55);
    paint();
    return () => {
      clearInterval(timer);
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    };
  }, [stream]);

  const round = "flex size-9 shrink-0 items-center justify-center rounded-full transition-all active:scale-95";
  return (
    <div className="flex w-full flex-col gap-1.5 py-0.5">
      {(preview || silent) && (
        <p className={`truncate px-3 text-[12.5px] ${heard ? "text-foreground/55" : "text-warning"}`}>
          {heard ? `…${preview.slice(-90)}` : "I can't hear anything yet. Check that the right microphone is on."}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Cancel dictation" title="Cancel (Esc)" onMouseDown={(e) => e.preventDefault()} onClick={onCancel} className={`${round} border border-black/10 text-foreground/70 hover:text-foreground dark:border-white/15`}>
          <X className="size-4" strokeWidth={2} />
        </button>
        <div aria-hidden className="flex h-9 min-w-0 flex-1 items-center justify-end gap-[3px] overflow-hidden">
          {Array.from({ length: WAVE }, (_, i) => (
            <span key={i} ref={(el) => void (bars.current[i] = el)} className="w-[3px] shrink-0 rounded-full bg-foreground" style={{ height: 3, opacity: 0.3 }} />
          ))}
        </div>
        <button type="button" aria-label="Done dictating" title={`Done (${DICTATION_SHORTCUT})`} onMouseDown={(e) => e.preventDefault()} onClick={onDone} className={`${round} bg-black/[0.07] text-foreground hover:bg-black/15 dark:bg-white/[0.12]`}>
          <Square className="size-3.5 fill-current" />
        </button>
        <button type="button" aria-label="Done and send" title="Send (Enter)" onMouseDown={(e) => e.preventDefault()} onClick={onSend} className={`${round} bg-brand text-white hover:bg-brand-hover`}>
          <ArrowUp className="size-[18px]" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}

/**
 * The mic button. It never takes the keyboard focus from the text box: otherwise pressing Enter after clicking the mic
 * would press this button (turning the mic off) instead of sending the message.
 */
export function MicToggle({
  listening,
  onToggle,
  size = "md",
}: {
  listening: boolean;
  onToggle: () => void;
  size?: "md" | "lg";
}) {
  const dim = size === "lg" ? "size-10" : "size-8.5";
  return (
    <button
      type="button"
      aria-pressed={listening}
      aria-label={listening ? "Stop dictating" : "Dictate with your voice"}
      title={listening ? `Stop dictating (${DICTATION_SHORTCUT})` : `Speak instead of typing (${DICTATION_SHORTCUT})`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onToggle}
      className={`flex ${dim} shrink-0 cursor-pointer items-center justify-center rounded-full transition-all active:scale-95 ${
        listening
          ? "bg-brand text-white shadow-xs hover:bg-brand-hover"
          : "bg-black/[0.05] text-foreground/75 hover:bg-black/10 hover:text-foreground dark:bg-white/[0.08] dark:hover:bg-white/15"
      }`}
    >
      <Mic className={size === "lg" ? "size-[18px]" : "size-4"} strokeWidth={2} />
    </button>
  );
}

/** The bars and the mic button together, as one control. */
export function DictationControl({ listening, stream, onToggle, size }: { listening: boolean; stream: MediaStream | null; onToggle: () => void; size?: "md" | "lg" }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {listening && <DictationBars stream={stream} />}
      <MicToggle listening={listening} onToggle={onToggle} size={size} />
    </div>
  );
}

export function DictationError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1.5 px-2 text-[12px] leading-snug text-destructive">
      {message}
    </p>
  );
}
