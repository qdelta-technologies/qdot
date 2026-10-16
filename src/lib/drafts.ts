"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

// A message you typed but did not send is kept per box (localStorage), so leaving for another dot, another tab or a
// reload does not lose it. It is removed when the box is emptied, which is also what sending does.

const PREFIX = "qdot-draft:";

function read(key: string): string {
  try {
    return localStorage.getItem(PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string) {
  try {
    if (value) localStorage.setItem(PREFIX + key, value);
    else localStorage.removeItem(PREFIX + key);
  } catch {}
}

/** Like useState(""), but the text is restored on return and saved on every change. */
export function useDraft(key: string): [string, Dispatch<SetStateAction<string>>] {
  const [text, setText] = useState("");
  const loaded = useRef<string | null>(null);
  const restoring = useRef(false); // a saved draft is on its way into the box: do not save the empty box over it
  const latest = useRef({ key, text });
  useEffect(() => {
    latest.current = { key, text };
  });

  // Load after mount, not during the first render, so the server and browser render the same thing.
  useEffect(() => {
    loaded.current = key;
    const saved = read(key);
    restoring.current = Boolean(saved);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount so the server and browser first render match
    if (saved) setText((cur) => cur || saved);
  }, [key]);

  // Save on every change (small text, so no delay: nothing is lost if the page closes straight away).
  useEffect(() => {
    if (loaded.current !== key) return;
    if (restoring.current) {
      if (text) restoring.current = false;
      return;
    }
    write(key, text);
  }, [key, text]);

  // Leaving the page: write what is there now.
  useEffect(() => {
    const flush = () => {
      if (!restoring.current && loaded.current === latest.current.key) write(latest.current.key, latest.current.text);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  return [text, setText];
}
