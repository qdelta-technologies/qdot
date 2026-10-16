"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowUpRight, Folder, Plus } from "lucide-react";
import { resolveCard, startConversation } from "@/app/actions";
import { markRead, useStore } from "@/lib/store";
import { DEFAULT_LOOK } from "@/lib/look";
import { statusDot, statusLabel, timeAgo } from "@/lib/status";
import { groupByOwner } from "@/lib/dots";
import { setHomeDot, useHomeDot, useMe } from "@/lib/me";
import Dot3DLazy from "./Dot3DLazy";
import DotOrb from "./DotOrb";
import { DictationControl, DictationError } from "./DictationControl";
import { useDictation } from "@/lib/useDictation";
import { useDraft } from "@/lib/drafts";

export default function Home() {
  const router = useRouter();
  const dots = useStore((s) => s.dots);
  const loaded = useStore((s) => s.loaded);
  const messages = useStore((s) => s.messages);
  const me = useMe();
  // My dots first, then each teammate's, then unassigned; A to Z inside each group.
  const groups = useMemo(() => groupByOwner(dots, me), [dots, me]);
  const sortedDots = useMemo(() => groups.flatMap((g) => g.dots), [groups]);
  const picked = useHomeDot();
  const setPicked = setHomeDot;
  // Kept, so leaving this page and coming back does not lose what you typed.
  const [text, setText] = useDraft("home");
  const [pending, start] = useTransition();
  const [confirmAll, setConfirmAll] = useState(false);
  // Set the moment a task is sent: holding Enter fires many key events before React re-renders, so state alone can't stop the repeats.
  const sending = useRef(false);

  // Dictation: the same engine as the chat box (Ctrl+D starts and stops it).
  const taRef = useRef<HTMLTextAreaElement>(null);
  const dict = useDictation(text, setText);
  const listening = dict.listening;
  const dictate = () => {
    dict.toggle();
    taRef.current?.focus();
  };

  const latest = useMemo(
    () => messages.filter((m) => !m.channelId && ((m.role === "dot" && m.text) || (m.role === "card" && m.card?.status === "pending"))).slice(-60).reverse(),
    [messages],
  );

  if (loaded && !dots.length) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="rails mx-auto flex min-h-full max-w-[880px] flex-col items-center justify-center px-4 sm:px-8 py-16 text-center">
          <div className="dot-grid rounded-full">
            <Dot3DLazy look={DEFAULT_LOOK} size={240} stage />
          </div>
          <div className="eyebrow mt-6 text-brand-readable/80">Personal agents</div>
          <h1 className="text-display mt-3">Meet your dots</h1>
          <p className="text-body-lg mt-4 max-w-[520px] text-foreground/60">
            Dots work on their own. Each one has its own computer and browser, remembers what matters, runs routines on a schedule, and knows when to ask for your approval.
          </p>
          <Link href="/new" className="btn-primary mt-8 h-10 px-5 text-[15px]">
            Create your first dot
          </Link>
        </div>
      </div>
    );
  }

  // The dot you used last; otherwise the first of yours (or A to Z when no project is yours yet).
  const target = dots.find((d) => d.id === picked) ?? sortedDots[0] ?? dots[0];
  const waitingCards = latest.filter((m) => m.role === "card" && m.card?.status === "pending");

  const submit = () => {
    const value = text.trim();
    if (!value || !target || sending.current) return;
    dict.abort();
    sending.current = true;
    start(async () => {
      try {
        const convId = await startConversation(target.id, value);
        markRead(target.id);
        router.push(`/dots/${target.id}?c=${convId}`);
      } catch (err) {
        sending.current = false;
        throw err;
      }
    });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="rails mx-auto min-h-full max-w-[880px] px-4 sm:px-8 pb-16">
        <section className="flex flex-col items-center pt-16 pb-10 text-center">
          {target && (
            <div className="dot-grid rounded-full">
              <Dot3DLazy look={target.look} status={target.status} size={128} />
            </div>
          )}
          <div className="eyebrow mt-5 text-brand-readable/80">Hand off a task</div>
          <h1 className="text-display mt-3">What should {target?.name ?? "your dot"} do?</h1>
          <p className="text-body-lg mt-4 max-w-[520px] text-foreground/55">It works on its own and messages you when it&apos;s done.</p>

          <div className="mt-8 w-full max-w-[640px] text-left">
            <div className="rounded-2xl border border-black/10 bg-card/95 p-3 pl-5 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.15)] transition-shadow focus-within:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.2)]">
              <textarea
                ref={taRef}
                autoFocus
                rows={2}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  dict.noteEdit();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    if (!e.repeat) submit();
                  }
                }}
                placeholder={target ? `Ask ${target.name} to research, browse, plan, or build something…` : "Loading…"}
                className={`max-h-60 min-h-[72px] w-full resize-none bg-transparent py-1.5 text-[17px] leading-[1.45] tracking-default outline-none [field-sizing:content] placeholder:text-foreground/35 ${listening ? "italic text-foreground/60" : ""}`}
              />
              <div className="flex items-center gap-2 pt-1">
                <div className="flex flex-1 flex-wrap gap-1.5">
                  {sortedDots.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setPicked(d.id)}
                      className={`flex h-7 items-center gap-1.5 rounded-md border pr-2.5 pl-1 text-[13px] transition-colors ${d.id === target?.id ? "border-foreground bg-foreground text-card" : "border-black/10 text-foreground/60 hover:border-black/20 hover:text-foreground"}`}
                    >
                      <DotOrb look={d.look} status={d.status} size={18} />
                      {d.name}
                    </button>
                  ))}
                </div>
                <DictationControl listening={listening} stream={dict.stream} onToggle={dictate} size="lg" />
                <button
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-card transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-25"
                  disabled={pending || !text.trim()}
                  onClick={submit}
                  aria-label="Send"
                >
                  <ArrowUp className="size-4" strokeWidth={2.25} />
                </button>
              </div>
            </div>
            <DictationError message={dict.error} />
          </div>
        </section>

        <AppsStrip />

        <section className="border-t border-black/[0.06] pt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="eyebrow">Your dots · {dots.length}</h2>
            <Link href="/new" className="btn-quiet">
              <Plus className="size-3.5" strokeWidth={1.75} /> New dot
            </Link>
          </div>
          <div className="space-y-6">
            {groups.map((g) => (
              <div key={g.owner || "unassigned"}>
                {g.label && (
                  <h3 className="mb-2 flex items-center gap-2 text-[13px] font-medium text-foreground/70">
                    <Folder className="size-3.5 text-foreground/45" strokeWidth={1.75} />
                    {g.label}
                    {g.mine && <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] tracking-wide text-brand-readable uppercase">You</span>}
                    <span className="font-mono text-[11px] font-normal text-foreground/40">{g.dots.length}</span>
                  </h3>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {g.dots.map((d) => (
                    <Link
                      key={d.id}
                      href={`/dots/${d.id}`}
                      onClick={() => markRead(d.id)}
                      className="surface group flex items-start gap-3.5 p-4 transition-[border-color,box-shadow] hover:border-black/15 hover:shadow-elevated"
                    >
                      <DotOrb look={d.look} status={d.status} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[15px] font-medium">{d.name}</span>
                          <ArrowUpRight className="size-4 text-foreground/30 transition-colors group-hover:text-foreground" strokeWidth={1.5} />
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-body-sm text-foreground/55">{d.purpose || "General helper"}</p>
                        <div className="mt-2.5 flex items-center gap-1.5 font-mono text-[11px] tracking-wider text-foreground/45 uppercase">
                          <span className={`size-1.5 rounded-full ${statusDot(d)}`} />
                          {d.status === "working" ? d.activity ?? "Working" : statusLabel(d)}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {latest.length > 0 && (
          <section className="mt-10">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="eyebrow">Latest from your dots</h2>
              {waitingCards.length > 0 &&
                (confirmAll ? (
                  <span className="flex items-center gap-1.5 text-[12px]">
                    <span className="text-foreground/60">Deny all {waitingCards.length}?</span>
                    <button
                      type="button"
                      className="btn-quiet h-7 px-2 text-[12px] text-destructive"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          for (const m of waitingCards) await resolveCard(m.id, "deny");
                          setConfirmAll(false);
                        })
                      }
                    >
                      Yes, deny all
                    </button>
                    <button type="button" className="btn-quiet h-7 px-2 text-[12px]" onClick={() => setConfirmAll(false)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button type="button" className="btn-quiet h-7 px-2 text-[12px] text-destructive" onClick={() => setConfirmAll(true)}>
                    Deny all waiting ({waitingCards.length})
                  </button>
                ))}
            </div>
            <div className="surface max-h-[300px] divide-y divide-black/[0.06] overflow-y-auto">
              {latest.map((m) => {
                const d = dots.find((x) => x.id === m.dotId);
                if (!d) return null;
                return (
                  <Link key={m.id} href={`/dots/${d.id}`} onClick={() => markRead(d.id)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-popover">
                    <DotOrb look={d.look} status={d.status} size={24} />
                    <span className="w-20 shrink-0 truncate text-[14px]">{d.name}</span>
                    {m.role === "card" && <span className="shrink-0 rounded-xs bg-warning/15 px-1.5 py-0.5 font-mono text-[11px] tracking-wider text-warning uppercase">Needs you</span>}
                    {m.title && <span className="shrink-0 rounded-xs bg-highlight px-1.5 py-0.5 font-mono text-[11px] tracking-wider uppercase">{m.title}</span>}
                    <span className="min-w-0 flex-1 truncate text-body-sm text-foreground/55">{m.role === "card" ? m.card?.title : m.text.replace(/[#*_`>|]/g, "").slice(0, 200)}</span>
                    {m.role === "card" && m.card?.status === "pending" && (
                      <button
                        type="button"
                        className="btn-secondary h-7 shrink-0 px-2.5 text-[12px] text-destructive"
                        title="Deny this request without opening it"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          start(() => resolveCard(m.id, "deny"));
                        }}
                      >
                        Deny
                      </button>
                    )}
                    <span className="shrink-0 font-mono text-[11px] tracking-wider text-foreground/35 uppercase">{timeAgo(m.createdAt)}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** Composio For You: which apps the dots can use, or a nudge to sign in. */
function AppsStrip() {
  const apps = useStore((s) => s.apps);
  const signedIn = useStore((s) => s.computer.composio);
  const connected = apps.filter((a) => a.connected);
  const logos = (slugs: string[]) =>
    slugs.slice(0, 8).map((slug) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img key={slug} src={`https://logos.composio.dev/api/${slug}`} alt="" className="size-7 rounded-full border-2 border-card bg-card object-contain p-1 shadow-sm" />
    ));

  return (
    <Link
      href="/settings#apps"
      className="surface mx-auto -mt-2 mb-10 grid max-w-[640px] grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:flex transition-[border-color,box-shadow] hover:border-black/15 hover:shadow-elevated"
    >
      <div className="flex -space-x-2">{logos(signedIn && connected.length ? connected.map((a) => a.slug) : ["gmail", "googlecalendar", "slack", "notion", "github"])}</div>
      <div className="col-span-2 row-start-2 min-w-0 flex-1 text-body-sm sm:row-auto">
        {signedIn ? (
          <>
            <span className="text-foreground">Your dots can use {connected.length || "your"} app{connected.length === 1 ? "" : "s"}</span>
            <span className="text-foreground/45"> · via Composio</span>
          </>
        ) : (
          <>
            <span className="text-foreground">Give your dots your apps</span>
            <span className="text-foreground/45"> · Gmail, Calendar, Slack, Notion and 500+ more</span>
          </>
        )}
      </div>
      <span className="font-mono text-[11px] tracking-wider text-brand-readable uppercase">{signedIn ? "Manage" : "Sign in with Composio"}</span>
    </Link>
  );
}
