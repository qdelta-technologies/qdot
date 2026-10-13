"use client";

import { useSyncExternalStore } from "react";

// Per-browser memory of who is using the shared workspace, and which owner's dots the sidebar is showing.
// There are no accounts: this lives in localStorage only, so each teammate's browser keeps its own answer.

function localString(key: string) {
  let value: string | null = null; // null = not read from storage yet
  const listeners = new Set<() => void>();

  const read = (): string => {
    if (value === null) {
      try {
        value = localStorage.getItem(key) ?? "";
      } catch {
        value = "";
      }
    }
    return value;
  };

  const set = (next: string) => {
    value = next;
    try {
      if (next) localStorage.setItem(key, next);
      else localStorage.removeItem(key);
    } catch {}
    for (const l of listeners) l();
  };

  const use = (): string =>
    useSyncExternalStore(
      (l) => {
        listeners.add(l);
        // Another tab changed it.
        const onStorage = (e: StorageEvent) => {
          if (e.key === key) {
            value = null;
            l();
          }
        };
        window.addEventListener("storage", onStorage);
        return () => {
          listeners.delete(l);
          window.removeEventListener("storage", onStorage);
        };
      },
      read,
      () => "",
    );

  return { use, set };
}

const me = localString("qdot-me");
const ownerFilter = localString("qdot-sidebar-owner");
const homeDot = localString("qdot-home-dot");

/** The name this browser's user gave for themselves ("" until they say). */
export const useMe = me.use;
export const setMe = me.set;

/** The dot the Home task box was last pointed at in this browser (a dot id, "" until chosen). */
export const useHomeDot = homeDot.use;
export const setHomeDot = homeDot.set;

/** Sidebar filter: "" = default (Mine when I have a name, else everyone), "all", or an owner's name. */
export const useOwnerFilter = ownerFilter.use;
export const setOwnerFilter = ownerFilter.set;
