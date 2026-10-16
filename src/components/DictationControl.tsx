"use client";

import { useEffect, useRef } from "react";
import { Mic } from "lucide-react";
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
