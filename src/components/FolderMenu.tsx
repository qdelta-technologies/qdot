"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, ChevronDown, Folder, FolderPlus } from "lucide-react";
import { updateDot } from "@/app/actions";
import { useStore } from "@/lib/store";
import { foldersOf } from "@/lib/dots";
import { useMe } from "@/lib/me";
import type { Dot } from "@/lib/types";

/** Which folder a dot is in, and a quick way to move it, including into a folder that is still empty. */
export default function FolderMenu({ dot }: { dot: Dot }) {
  const dots = useStore((s) => s.dots);
  const stored = useStore((s) => s.folders);
  const me = useMe();
  const folders = useMemo(() => foldersOf(dots, stored, me), [dots, stored, me]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const current = dot.owner.trim();

  const move = (folder: string) => {
    setOpen(false);
    setDraft("");
    if (folder.trim() === current) return;
    start(async () => {
      await updateDot(dot.id, { owner: folder });
    });
  };

  return (
    <div className="relative hidden shrink-0 sm:block">
      <button
        type="button"
        className="btn-quiet h-8 cursor-pointer gap-1.5 px-2 text-[13px]"
        title="Move this dot to a folder"
        aria-label="Folder"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
      >
        <Folder className="size-3.5" strokeWidth={1.75} />
        <span className="max-w-32 truncate">{current || "No folder"}</span>
        <ChevronDown className="size-3 text-foreground/40" strokeWidth={1.75} />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="qdot-menu absolute top-full left-0 z-50 mt-1 w-56 rounded-xl border border-black/10 bg-popover p-1.5 shadow-elevated dark:border-white/10">
            <div className="eyebrow px-2 pt-1 pb-1.5">Move {dot.name} to</div>
            {folders.map((f) => (
              <button key={f} type="button" onClick={() => move(f)} className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-black/[0.05] dark:hover:bg-white/[0.08]">
                <Folder className="size-3.5 shrink-0 text-foreground/50" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{f}</span>
                {f.toLowerCase() === current.toLowerCase() && <Check className="size-3.5 text-brand-readable" strokeWidth={2} />}
              </button>
            ))}
            {current && (
              <button type="button" onClick={() => move("")} className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-foreground/60 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]">
                Take out of folder
              </button>
            )}
            <form
              className="mt-1 flex items-center gap-1 border-t border-black/[0.06] pt-1.5 dark:border-white/[0.08]"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) move(draft);
              }}
            >
              <FolderPlus className="ml-1.5 size-3.5 shrink-0 text-foreground/50" strokeWidth={1.75} />
              <input className="h-7 min-w-0 flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-foreground/40" placeholder="New folder name" maxLength={40} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <button className="btn-primary h-6 px-2 text-[12px]" disabled={!draft.trim()}>
                Add
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
