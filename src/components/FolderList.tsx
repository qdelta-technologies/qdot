"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Folder, FolderOpen, FolderPlus, Pencil, Pin, PinOff, Trash2, X } from "lucide-react";
import { createFolder, deleteFolder, renameFolder } from "@/app/actions";
import { ALL_FOLDERS, NONE_FOLDER, ownedBy } from "@/lib/dots";
import type { Dot } from "@/lib/types";
import DotOrb from "./DotOrb";

/** The sidebar's top level: your projects, with + New project. Opening one shows its dots and chats. */
export default function FolderList({
  folders,
  dots,
  me,
  onOpen,
}: {
  folders: string[];
  dots: Dot[];
  me: string;
  onOpen: (key: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [rename, setRename] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [, start] = useTransition();
  const loose = dots.filter((d) => !d.owner.trim());
  // Pinned projects float to the top. Kept in this browser only, like other per-person view settings.
  const [pinned, setPinned] = useState<string[]>([]);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem("qdot:pinned-folders") ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after mount so server and client markup match
      if (Array.isArray(v)) setPinned(v.filter((x): x is string => typeof x === "string"));
    } catch {}
  }, []);
  const isPinned = (f: string) => pinned.some((p) => p.toLowerCase() === f.toLowerCase());
  const togglePin = (f: string) => {
    const next = isPinned(f) ? pinned.filter((p) => p.toLowerCase() !== f.toLowerCase()) : [...pinned, f];
    setPinned(next);
    try {
      localStorage.setItem("qdot:pinned-folders", JSON.stringify(next));
    } catch {}
  };
  const ordered = [...folders.filter(isPinned), ...folders.filter((f) => !isPinned(f))];

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    start(async () => {
      await createFolder(name);
      onOpen(name);
    });
    setDraft("");
    setAdding(false);
  };

  const row = (key: string, label: string, list: Dot[], opts: { icon?: "folder" | "open"; mine?: boolean; manage?: boolean } = {}) => {
    if (opts.manage && editing === key) {
      return (
        <form
          key={key}
          className="my-0.5 flex items-center gap-1.5 rounded-xl bg-black/[0.04] px-2.5 py-2 dark:bg-white/[0.06]"
          onSubmit={(e) => {
            e.preventDefault();
            const name = rename.trim();
            setEditing(null);
            if (name && name !== key) start(() => renameFolder(key, name));
          }}
        >
          <Folder className="size-4 shrink-0 text-foreground/45" strokeWidth={1.75} />
          <input autoFocus className="field h-7 min-w-0 flex-1 text-[13px]" maxLength={40} value={rename} onChange={(e) => setRename(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setEditing(null)} />
          <button className="btn-quiet size-7 p-0" aria-label="Save name" disabled={!rename.trim()}>
            <Check className="size-3.5" strokeWidth={2} />
          </button>
          <button type="button" className="btn-quiet size-7 p-0" aria-label="Cancel" onClick={() => setEditing(null)}>
            <X className="size-3.5" strokeWidth={2} />
          </button>
        </form>
      );
    }
    if (opts.manage && removing === key) {
      return (
        <div key={key} className="my-0.5 rounded-xl bg-destructive/[0.06] px-3 py-2.5">
          <p className="text-[13px] text-destructive">Delete the project “{label}”?</p>
          <p className="mt-0.5 text-[12px] text-foreground/55">Its {list.length === 1 ? "dot stays" : "dots stay"} and just {list.length === 1 ? "has" : "have"} no project.</p>
          <div className="mt-2 flex gap-1.5">
            <button
              className="btn-quiet h-7 px-2 text-[12px] text-destructive"
              onClick={() => {
                setRemoving(null);
                start(() => deleteFolder(key));
              }}
            >
              Delete project
            </button>
            <button className="btn-quiet h-7 px-2 text-[12px]" onClick={() => setRemoving(null)}>
              Cancel
            </button>
          </div>
        </div>
      );
    }
    return (
      <div key={key} className="group relative flex items-center rounded-xl transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
        <button type="button" onClick={() => onOpen(key)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-2.5 py-2.5 text-left [@media(hover:none)]:pr-16">
          {opts.icon === "open" ? (
            <FolderOpen className="size-5 shrink-0 text-foreground/50" strokeWidth={1.5} />
          ) : (
            <>
              <Folder className="size-5 shrink-0 text-foreground/50 group-hover:hidden" strokeWidth={1.5} />
              <FolderOpen className="hidden size-5 shrink-0 text-foreground/70 group-hover:block" strokeWidth={1.5} />
            </>
          )}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-[15px] font-medium">{label}</span>
              {opts.mine && <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] tracking-wide text-brand-readable uppercase">You</span>}
              {opts.manage && isPinned(key) && <Pin className="size-3 shrink-0 fill-current text-foreground/45 group-hover:hidden" strokeWidth={1.75} aria-label="Pinned" />}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-foreground/45">
              <span className="flex -space-x-1.5">
                {list.slice(0, 4).map((d) => (
                  <span key={d.id} className="rounded-full ring-2 ring-background">
                    <DotOrb look={d.look} size={18} still />
                  </span>
                ))}
              </span>
              {list.length} {list.length === 1 ? "dot" : "dots"}
            </span>
          </span>
        </button>
        {opts.manage && (
          <span className="absolute top-1/2 right-1.5 hidden -translate-y-1/2 items-center group-hover:flex [@media(hover:none)]:flex">
            <button className="btn-quiet size-7 cursor-pointer p-0 text-foreground/45 [@media(hover:none)]:size-9" aria-label={`${isPinned(key) ? "Unpin" : "Pin"} ${label}`} title={isPinned(key) ? "Unpin project" : "Pin project to the top"} onClick={() => togglePin(key)}>
              {isPinned(key) ? <PinOff className="size-3.5" strokeWidth={1.75} /> : <Pin className="size-3.5" strokeWidth={1.75} />}
            </button>
            <button className="btn-quiet size-7 cursor-pointer p-0 text-foreground/45 [@media(hover:none)]:size-9" aria-label={`Rename ${label}`} title="Rename project" onClick={() => (setRename(key), setEditing(key))}>
              <Pencil className="size-3.5" strokeWidth={1.75} />
            </button>
            <button className="btn-quiet size-7 cursor-pointer p-0 text-foreground/45 hover:text-destructive [@media(hover:none)]:size-9" aria-label={`Delete ${label}`} title="Delete project" onClick={() => setRemoving(key)}>
              <Trash2 className="size-3.5" strokeWidth={1.75} />
            </button>
          </span>
        )}
      </div>
    );
  };

  return (
    <nav className="qdot-pane-left qdot-stagger min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label="Projects">
      <div className="mb-1 px-1">
        {adding ? (
          <form
            className="flex items-center gap-1.5 rounded-xl border border-black/10 bg-popover/60 px-2.5 py-1.5 dark:border-white/10"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <FolderPlus className="size-4 shrink-0 text-foreground/45" strokeWidth={1.75} />
            <input autoFocus className="h-7 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-foreground/40" placeholder="Project name" maxLength={40} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Escape" && (setAdding(false), setDraft(""))} />
            <button className="btn-primary h-6 px-2 text-[12px]" disabled={!draft.trim()}>
              Add
            </button>
            <button type="button" className="btn-quiet size-6 p-0" aria-label="Cancel" onClick={() => (setAdding(false), setDraft(""))}>
              <X className="size-3.5" strokeWidth={2} />
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="group/new flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-black/[0.08] bg-card px-2.5 py-2 text-[14px] font-medium text-foreground/80 shadow-xs transition-all hover:border-black/20 hover:text-foreground hover:shadow-sm active:scale-[0.99] dark:border-white/[0.08] dark:hover:border-white/20">
            <span className="flex size-7 items-center justify-center rounded-lg bg-black/[0.05] text-foreground/65 transition-colors group-hover/new:bg-foreground group-hover/new:text-card dark:bg-white/[0.08]">
              <FolderPlus className="size-4" strokeWidth={1.75} />
            </span>
            New project
          </button>
        )}
      </div>

      {row(ALL_FOLDERS, "All dots", dots, { icon: "open" })}
      {ordered.map((f) => row(f, f, dots.filter((d) => ownedBy(d, f)), { mine: !!me && f.toLowerCase() === me.toLowerCase(), manage: true }))}
      {loose.length > 0 && row(NONE_FOLDER, "No project", loose)}
    </nav>
  );
}
