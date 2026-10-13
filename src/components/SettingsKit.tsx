"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, Pencil, X } from "lucide-react";
import * as actions from "@/app/actions";

/** Two-column settings block: label + description on the left, controls on the right. Optionally foldable (the choice is remembered). */
export function Section({
  id,
  eyebrow,
  title,
  description,
  collapsible = false,
  defaultOpen = false,
  openOnHash,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Extra element ids inside this section that should open it when they are in the page address (#...). */
  openOnHash?: string[];
  children: React.ReactNode;
}) {
  const key = `qdot-settings-open:${id ?? eyebrow ?? title}`;
  const [open, setOpen] = useState(!collapsible || defaultOpen);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!collapsible) return;
    try {
      const saved = localStorage.getItem(key);
      if (saved === "1") setOpen(true);
      else if (saved === "0") setOpen(false);
    } catch {
      // storage unavailable
    }
    const hash = window.location.hash.replace(/^#/, "");
    if (hash && (hash === id || openOnHash?.includes(hash))) {
      setOpen(true);
      setTimeout(() => (document.getElementById(hash) ?? ref.current)?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(key, next ? "1" : "0");
    } catch {
      // ignore
    }
  };

  const showBody = !collapsible || open;
  return (
    <section
      ref={ref}
      id={id}
      className={`grid gap-5 border-t border-black/[0.06] first:border-t-0 first:pt-2 md:grid-cols-[240px_1fr] md:gap-10 ${collapsible && !open ? "py-4" : "py-8"}`}
    >
      <div>
        {collapsible ? (
          <button type="button" onClick={toggle} aria-expanded={open} className="group flex w-full items-start gap-3 text-left">
            <span className="min-w-0 flex-1">
              {eyebrow && <span className="eyebrow mb-1.5 block">{eyebrow}</span>}
              <span className="block text-[15px] leading-snug font-medium">{title}</span>
            </span>
            <ChevronDown className={`mt-1 size-4 shrink-0 text-foreground/45 transition-transform duration-200 group-hover:text-foreground ${open ? "rotate-180" : ""}`} strokeWidth={1.75} />
          </button>
        ) : (
          <>
            {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
            <h2 className="text-[15px] leading-snug font-medium">{title}</h2>
          </>
        )}
        {description && showBody && <p className="mt-1.5 text-body-sm text-foreground/55">{description}</p>}
      </div>
      {showBody && <div className="min-w-0">{children}</div>}
    </section>
  );
}

export function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="pt-10 pb-6">
      <div className="eyebrow text-brand-readable/80">{eyebrow}</div>
      <h1 className="text-h1 mt-2">{title}</h1>
      {description && <p className="mt-2 max-w-[560px] text-body-sm text-foreground/55">{description}</p>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-black/10 px-4 py-5 text-center text-body-sm text-foreground/45">{children}</div>;
}

export function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button className="flex size-7 shrink-0 items-center justify-center rounded-md text-foreground/35 transition-colors hover:bg-black/[0.05] hover:text-foreground" onClick={onClick} aria-label={label}>
      <X className="size-3.5" strokeWidth={1.75} />
    </button>
  );
}

export function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="flex size-7 shrink-0 items-center justify-center rounded-md text-foreground/35 transition-colors hover:bg-black/[0.05] hover:text-foreground" onClick={onClick} aria-label={label}>
      <Pencil className="size-3.5" strokeWidth={1.75} />
    </button>
  );
}

type Mode = "allow" | "ask" | "never";

const MODES: { value: Mode; label: string; tone: string; hint: (name: string) => string }[] = [
  { value: "allow", label: "Allow", tone: "border-success/50 bg-success/10 text-success", hint: (n) => `${n} does everything on its own and never asks.` },
  { value: "ask", label: "Ask", tone: "border-warning/50 bg-warning/15 text-warning", hint: (n) => `${n} reads and searches freely, but asks before it sends, posts, edits or deletes.` },
  { value: "never", label: "Never", tone: "border-destructive/40 bg-destructive/10 text-destructive", hint: (n) => `${n} only reads and answers. It won't send, post, edit or delete anything.` },
];

/** One choice per dot: how much it may do without checking with you. */
export function ApprovalMode({ dotId, name }: { dotId: string; name: string }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [, start] = useTransition();
  useEffect(() => {
    let live = true;
    void actions.getApprovalMode(dotId).then((m) => live && setMode(m));
    return () => {
      live = false;
    };
  }, [dotId]);
  const pick = (m: Mode) => {
    setMode(m);
    start(() => actions.setApprovalMode(dotId, m));
  };
  const current = MODES.find((m) => m.value === mode);
  return (
    <div className="surface space-y-3 p-4">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Approval setting">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mode === m.value}
            onClick={() => pick(m.value)}
            className={`h-10 min-w-24 flex-1 rounded-lg border px-4 text-[14px] transition-colors sm:flex-none ${mode === m.value ? `${m.tone} font-medium` : "border-black/10 text-foreground/70 hover:border-black/25 dark:border-white/10"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-caption text-foreground/55">{current ? current.hint(name) : " "}</p>
    </div>
  );
}

/** Which connected account of an app (Instagram, LinkedIn…) a dot always uses. Shown when more than one is connected. */
export function AppAccountPicker({ dotId, name, toolkit, appName }: { dotId: string; name: string; toolkit: string; appName: string }) {
  const [accounts, setAccounts] = useState<{ id: string; alias: string | null; label: string | null }[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [, start] = useTransition();
  useEffect(() => {
    let live = true;
    void Promise.all([actions.getAppAccounts(toolkit), actions.getAppAccountChoice(dotId, toolkit)]).then(([r, saved]) => {
      if (!live) return;
      setAccounts(r.accounts);
      setChosen(saved);
    });
    return () => {
      live = false;
    };
  }, [dotId, toolkit]);
  if (!accounts || (accounts.length < 2 && !chosen)) return null;
  const pick = (value: string) => {
    setChosen(value);
    start(() => actions.setAppAccountChoice(dotId, toolkit, value));
  };
  return (
    <Section eyebrow="Accounts" title={appName} description={`Which connected ${appName} account ${name} uses.`}>
    <div className="surface space-y-3 p-4">
      <div className="flex flex-col gap-2" role="radiogroup" aria-label={`${appName} account`}>
        {accounts.map((a) => {
          const value = a.alias ?? a.id;
          const on = chosen === value || chosen === a.id;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pick(value)}
              className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 text-left text-[14px] transition-colors ${on ? "border-foreground/40 bg-black/[0.04] font-medium dark:bg-white/[0.06]" : "border-black/10 text-foreground/70 hover:border-black/25 dark:border-white/10"}`}
            >
              <span className={`size-3.5 shrink-0 rounded-full border ${on ? "border-foreground bg-foreground" : "border-foreground/30"}`} />
              <span className="min-w-0 flex-1 truncate">{a.label ?? a.alias ?? "Default account"}</span>
              <span className="shrink-0 font-mono text-[11px] text-foreground/45">{a.alias ?? "no alias"}</span>
            </button>
          );
        })}
      </div>
      <p className="text-caption text-foreground/55">{chosen ? `${name} only uses this ${appName} account.` : `Pick one so ${name} knows which ${appName} account to use.`}</p>
      {accounts.some((a) => !a.alias) && <p className="text-caption text-foreground/45">To give an account a name, use Settings → Apps → {appName} → Rename.</p>}
    </div>
    </Section>
  );
}
