"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- the Web Speech API has no TypeScript types */

import { useCallback, useEffect, useRef, useState } from "react";

// Dictation (speech to text) for every text box in QDot, on the browser's own speech recognition.
// One engine so the chat box and the home box behave the same:
//  - words show up live while you speak; text you typed before (or while) dictating is kept
//  - the recognizer restarts by itself after the pauses where the browser stops it
//  - problems are reported as a message (`error`), never silently and never with a popup
//  - Ctrl+D (Cmd+D on a Mac) starts and stops it

type Recognizer = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

const ctor = (): (new () => Recognizer) | null => {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

const isPhone = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

/** `base` + what was said, with one space between them. */
const joinText = (base: string, said: string) => {
  const s = said.trim();
  if (!s) return base;
  return base && !/\s$/.test(base) ? `${base} ${s}` : `${base}${s}`;
};

export const DICTATION_SHORTCUT = "Ctrl+D";

/** Console log for finding mic problems: run localStorage.setItem("qdot-dictation-debug", "1") in the browser console, then reload. */
const dlog = (what: string, data?: unknown) => {
  try {
    if (localStorage.getItem("qdot-dictation-debug")) console.log("[dictation]", what, data ?? "");
  } catch {}
};

export function useDictation(text: string, setText: (v: string) => void) {
  const [listening, setListening] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const valueRef = useRef(text);
  const setTextRef = useRef(setText);
  useEffect(() => {
    valueRef.current = text;
    setTextRef.current = setText;
  });
  const beginRef = useRef<() => void>(() => {});

  const s = useRef({
    rec: null as Recognizer | null,
    wanted: false, // the user wants it on (so a browser-made stop is restarted)
    base: "", // the text before this recognition session
    committed: "", // what this session has finished saying
    processed: 0, // how many finished results were already taken
    startedAt: 0,
    quickEnds: 0,
    netRetries: 0,
    timer: 0 as ReturnType<typeof setTimeout> | 0,
    stream: null as MediaStream | null,
    startText: "", // the box before dictation began, restored by cancel()
    finishers: [] as (() => void)[], // finish() calls waiting for the recognizer's last words
  });
  const [heard, setHeard] = useState(false); // at least one word has come back this time

  const releaseStream = useCallback(() => {
    s.current.stream?.getTracks().forEach((t) => t.stop());
    s.current.stream = null;
    setStream(null);
  }, []);

  const fail = useCallback(
    (message: string) => {
      const st = s.current;
      st.wanted = false;
      if (st.timer) clearTimeout(st.timer);
      const rec = st.rec;
      st.rec = null;
      try { rec?.abort(); } catch {}
      setListening(false);
      setError(message);
      releaseStream();
    },
    [releaseStream],
  );

  const begin = useCallback(() => {
    const Ctor = ctor();
    const st = s.current;
    if (!Ctor || !st.wanted) return;
    try { st.rec?.abort(); } catch {}

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    st.base = valueRef.current;
    st.committed = "";
    st.processed = 0;
    st.startedAt = Date.now();
    dlog("begin", { base: st.base.length });

    rec.onresult = (e: any) => {
      if (st.rec !== rec) return;
      st.netRetries = 0;
      // Rebuild from the whole result list every time. Counting results as they arrive breaks when the browser
      // renumbers or re-finalizes an earlier result (Edge does), and the words then vanish from the box.
      let finals = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals = joinText(finals, r[0].transcript);
        else interim += r[0].transcript;
      }
      st.committed = finals;
      if (finals || interim) setHeard(true);
      // `base` is what was in the box when this session began, so the box can never end up shorter than it.
      const next = joinText(joinText(st.base, finals), interim);
      dlog("result", { base: st.base.length, finals: finals.length, interim: interim.length, results: e.results.length });
      // Update the ref now, not after the next render: a restart in between must start from what is on screen.
      valueRef.current = next;
      setTextRef.current(next);
    };

    rec.onerror = (e: any) => {
      if (st.rec !== rec) return;
      const code = String(e?.error ?? "");
      if (code === "not-allowed" || code === "service-not-allowed") {
        fail("The microphone is blocked. Allow microphone access for this site in your browser, then try again.");
      } else if (code === "audio-capture") {
        fail("No microphone was found, or another app is using it. Close the other app and try again.");
      } else if (code === "network") {
        // Chrome's recognizer is an online service: it fails now and then. Try again a couple of times before giving up.
        if (st.netRetries++ >= 2) fail("Voice typing could not reach the speech service. Check your internet connection and try again.");
      }
      // "no-speech" and "aborted" are normal pauses: onend restarts it.
    };

    rec.onend = () => {
      if (st.rec !== rec) return;
      if (!st.wanted) {
        st.rec = null;
        setListening(false);
        releaseStream();
        st.finishers.splice(0).forEach((f) => f()); // the last words have arrived
        return;
      }
      // The browser ended the session (a pause, or a time limit). Carry on, unless it keeps ending at once.
      st.quickEnds = Date.now() - st.startedAt < 1500 ? st.quickEnds + 1 : 0;
      if (st.quickEnds >= 5) return fail("Voice typing keeps stopping. Click the mic to start it again.");
      st.timer = setTimeout(() => {
        st.timer = 0;
        if (st.wanted) beginRef.current();
      }, st.netRetries ? 800 : 200);
    };

    st.rec = rec;
    try {
      rec.start();
    } catch {
      // "already started": the previous session had not fully ended. Retry once shortly.
      st.timer = setTimeout(() => {
        st.timer = 0;
        if (!st.wanted) return;
        try { rec.start(); } catch { fail("Could not start voice typing. Click the mic to try again."); }
      }, 300);
    }
  }, [fail, releaseStream]);
  useEffect(() => {
    beginRef.current = begin;
  }, [begin]);

  const start = useCallback(async () => {
    const st = s.current;
    if (st.wanted) return;
    if (!ctor()) {
      setError("Voice typing is not supported in this browser. Use Google Chrome, Microsoft Edge or Safari.");
      return;
    }
    setError(null);
    setHeard(false);
    st.startText = valueRef.current;
    st.wanted = true;
    st.quickEnds = 0;
    st.netRetries = 0;
    setListening(true);
    // The level meter needs its own look at the microphone. Phones cannot share it with the recognizer (it then
    // listens but returns no text), so only desktops open it; if it is refused the dictation still runs.
    if (!isPhone() && navigator.mediaDevices?.getUserMedia) {
      try {
        const m = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (!st.wanted) {
          m.getTracks().forEach((t) => t.stop());
          return;
        }
        st.stream = m;
        setStream(m);
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (name === "NotAllowedError" || name === "SecurityError") return fail("The microphone is blocked. Allow microphone access for this site in your browser, then try again.");
        if (name === "NotFoundError") return fail("No microphone was found. Plug one in and try again.");
        // Anything else: dictate without the level meter.
      }
    }
    if (st.wanted) begin();
  }, [begin, fail]);

  /**
   * Stop, and wait until the recognizer has handed over the words still on their way (up to 2.5 s).
   * Resolves with the full text of the box, so a message sent right after is complete.
   */
  const finish = useCallback((): Promise<string> => {
    const st = s.current;
    st.wanted = false;
    if (st.timer) clearTimeout(st.timer);
    st.timer = 0;
    setListening(false);
    const rec = st.rec;
    if (!rec) {
      releaseStream();
      return Promise.resolve(valueRef.current);
    }
    return new Promise((resolve) => {
      let done = false;
      const end = () => {
        if (done) return;
        done = true;
        clearTimeout(giveUp);
        resolve(valueRef.current);
      };
      const giveUp = setTimeout(() => {
        // onend never came: take what is there and let go of the microphone
        if (st.rec === rec) st.rec = null;
        try { rec.abort(); } catch {}
        releaseStream();
        end();
      }, 2500);
      st.finishers.push(end);
      try { rec.stop(); } catch { end(); }
    });
  }, [releaseStream]);

  /** Stop; words already spoken are still delivered and added. */
  const stop = useCallback(() => {
    void finish();
  }, [finish]);

  /** Throw away what was dictated this time: the box goes back to what it held when the mic was switched on. */
  const cancel = useCallback(() => {
    const st = s.current;
    st.wanted = false;
    if (st.timer) clearTimeout(st.timer);
    st.timer = 0;
    const rec = st.rec;
    st.rec = null;
    try { rec?.abort(); } catch {}
    setListening(false);
    releaseStream();
    st.finishers.splice(0).forEach((f) => f());
    valueRef.current = st.startText;
    setTextRef.current(st.startText);
  }, [releaseStream]);

  /** Stop at once and ignore anything still on its way (used when the message is sent). */
  const abort = useCallback(() => {
    const st = s.current;
    st.wanted = false;
    if (st.timer) clearTimeout(st.timer);
    st.timer = 0;
    const rec = st.rec;
    st.rec = null;
    try { rec?.abort(); } catch {}
    setListening(false);
    releaseStream();
  }, [releaseStream]);

  const toggle = useCallback(() => {
    if (s.current.wanted) stop();
    else void start();
  }, [start, stop]);

  /** Call when the user types in the box: what is there now becomes the base, so dictation never overwrites it. */
  const noteEdit = useCallback(
    () => {
      const st = s.current;
      if (!st.rec) return;
      // The words still being recognized are already in the box, so keeping this session would add them twice.
      // Drop it and start a fresh one from what is in the box once typing pauses (begin() reads the box).
      const old = st.rec;
      st.rec = null;
      try { old.abort(); } catch {}
      if (st.timer) clearTimeout(st.timer);
      st.timer = 0;
      if (st.wanted) {
        st.timer = setTimeout(() => {
          st.timer = 0;
          if (st.wanted) beginRef.current();
        }, 400);
      }
    },
    [],
  );

  // Ctrl+D / Cmd+D
  const toggleRef = useRef(toggle);
  useEffect(() => {
    toggleRef.current = toggle;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "d") {
        e.preventDefault(); // otherwise the browser bookmarks the page
        toggleRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Leaving the page: let go of the microphone.
  useEffect(
    () => () => {
      const st = s.current;
      st.wanted = false;
      if (st.timer) clearTimeout(st.timer);
      try { st.rec?.abort(); } catch {}
      st.rec = null;
      st.stream?.getTracks().forEach((t) => t.stop());
      st.stream = null;
    },
    [],
  );

  return { listening, stream, error, heard, toggle, stop, finish, cancel, abort, noteEdit, report: setError, clearError: () => setError(null) };
}
