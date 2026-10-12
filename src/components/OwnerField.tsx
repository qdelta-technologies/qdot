"use client";

import { useMemo } from "react";
import { Folder } from "lucide-react";
import { useStore } from "@/lib/store";
import { useMe } from "@/lib/me";
import { foldersOf } from "@/lib/dots";

/** Which folder a dot is in. Free text, with one-tap chips for the folders already in use. */
export default function OwnerField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const dots = useStore((s) => s.dots);
  const stored = useStore((s) => s.folders);
  const me = useMe();
  const names = useMemo(() => {
    const all = foldersOf(dots, stored, me);
    if (me && !all.some((o) => o.toLowerCase() === me.toLowerCase())) all.unshift(me);
    return all;
  }, [dots, stored, me]);

  return (
    <label className="block">
      <span className="eyebrow mb-1.5 block">Folder</span>
      <input className="field" value={value} maxLength={40} onChange={(e) => onChange(e.target.value)} placeholder="Which folder? e.g. your name, Sales, Research" />
      {names.length > 0 && (
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          {names.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`rounded-full border px-2.5 py-0.5 text-[12px] transition-colors ${value.trim().toLowerCase() === n.toLowerCase() ? "border-foreground bg-foreground text-card" : "border-black/10 text-foreground/55 hover:border-black/25 hover:text-foreground dark:border-white/10"}`}
            >
              <Folder className="mr-1 inline size-3 -translate-y-px" strokeWidth={1.75} />
              {n}
              {me && n.toLowerCase() === me.toLowerCase() ? " (mine)" : ""}
            </button>
          ))}
        </span>
      )}
    </label>
  );
}
