import "server-only";
import { clientFor, models } from "./client";
import { needsCompat } from "./compat";
import * as repo from "../repo";
import type { Rule, RuleDecision } from "@/lib/types";

// "Your dot knows when to take action, and when to ask for approval."
// Users write rules as "When your dot wants to <action>, it should <allow|ask|never>".
// A small model checks a concrete pending action against those rules. "Ask first" wins conflicts.

export type Verdict = { decision: RuleDecision; rule: Rule | null };

const FILLER = new Set([
  "the", "a", "an", "to", "of", "on", "in", "for", "me", "my", "and", "or", "with", "via", "using", "use", "when", "you", "your", "want", "wants", "it", "is", "from", "this", "that", "do", "dot", "any", "all",
  // boilerplate people add when they phrase a rule as a permission
  "always", "allow", "allowed", "never", "without", "requiring", "require", "required", "approval", "approve", "permission", "ask", "asking", "can", "may", "should", "must", "have", "has", "access", "free", "freely", "automatically", "first", "i", "you", "are", "be", "also",
]);

// Different words for the same kind of action compare equal ("update" and "edit").
const VERB_CLASS: Record<string, string> = {
  update: "edit", edit: "edit", modify: "edit", change: "edit", write: "edit", append: "edit", insert: "edit", batch: "edit", set: "edit", rename: "edit", format: "edit",
  add: "create", new: "create", make: "create", create: "create",
  remove: "delete", delete: "delete", trash: "delete", clear: "delete",
  reply: "send", respond: "send", forward: "send", draft: "send", send: "send",
  publish: "post", tweet: "post", post: "post", share: "post",
};
// "...all operations / anything / everything" means any action on the app, so the verb doesn't have to match.
const WILDCARD = new Set(["operation", "operations", "action", "actions", "anything", "everything", "task", "tasks"]);

// A word in the action also stands for the family or kind it belongs to, so a rule about "Google Drive" or "email" covers them.
const KIND: Record<string, string[]> = {
  sheet: ["google", "drive", "spreadsheet"], googlesheet: ["google", "sheet", "drive", "spreadsheet"], doc: ["google", "drive"], googledoc: ["google", "doc", "drive"],
  slide: ["google", "drive"], googleslide: ["google", "slide", "drive"], form: ["google", "drive"], file: ["drive"],
  gmail: ["google", "email", "mail"], outlook: ["email", "mail"], mail: ["email"], calendar: ["google", "event"], googlecalendar: ["google", "calendar", "event"],
  twitter: ["social", "post"], instagram: ["social", "post"], linkedin: ["social", "post"], facebook: ["social", "post"],
};

function baseStem(w: string): string {
  let s = w.length > 4 ? w.replace(/(ing|ed)$/, "") : w;
  s = s.replace(/ies$/, "y").replace(/([^s])s$/, "$1");
  return s.length > 3 ? s.replace(/e$/, "") : s; // "update"/"updated"/"updating" all become "updat"
}

// The tables above are written in plain words; compare them in stemmed form.
const verbClass = new Map(Object.entries(VERB_CLASS).map(([k, v]) => [baseStem(k), baseStem(v)]));
const kinds = new Map(Object.entries(KIND).map(([k, v]) => [baseStem(k), v.map(baseStem)]));
const wildcards = new Set([...WILDCARD].map(baseStem));
const verbs = new Set(verbClass.values());

function stem(w: string): string {
  const s = baseStem(w);
  return verbClass.get(s) ?? s;
}

/** Lower-case word stems without filler, so "sending emails" and "send the email" compare equal. */
function stems(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!w || FILLER.has(w)) continue;
    out.add(stem(w));
  }
  return out;
}

function expandKinds(have: Set<string>): Set<string> {
  const text = [...have];
  for (const w of text) for (const k of kinds.get(w) ?? []) have.add(k);
  // "google sheets" arrives as two words; join neighbours so the app-family entries above can fire.
  if (have.has("google")) for (const w of text) for (const k of kinds.get("google" + w) ?? []) have.add(k);
  return have;
}

/** Rules whose every key word shows up in the action. Cheap and always available, so rules work even if the AI reviewer is down. */
function keywordMatches(rules: Rule[], action: string): Rule[] {
  const have = expandKinds(stems(action));
  return rules.filter((r) => {
    const need = stems(r.action);
    const wild = [...need].some((w) => wildcards.has(w));
    for (const w of [...need]) if (wildcards.has(w) || (wild && verbs.has(w))) need.delete(w);
    return need.size > 0 && [...need].every((w) => have.has(w));
  });
}

export async function review(dotId: string, action: string, fallback: RuleDecision): Promise<Verdict> {
  const rules = repo.rulesFor(dotId);
  if (!rules.length) return { decision: fallback, rule: null };

  const byWords = keywordMatches(rules, action);
  const list = rules.map((r, i) => `${i + 1}. When the dot wants to ${r.action} → ${r.decision === "allow" ? "allow automatically" : r.decision === "ask" ? "ask first" : "never allow"}`).join("\n");
  try {
    const { client, model, stateless } = clientFor((await models()).review);
    const instructions =
      "You gate actions of a personal AI agent. Decide which of the user's rules (if any) apply to the pending action. " +
      "A rule applies only if the action clearly falls under it. A rule naming an app family covers its member apps (a Google Drive rule covers Google Sheets, Docs and Slides; an email rule covers Gmail), " +
      "and 'all edits/operations' covers every kind of change to that app. Return the numbers of every applying rule; return an empty list if none apply.";
    const input = `Rules:
${list}

Pending action: the dot wants to ${action}`;
    let raw: string;
    if (needsCompat((await models()).review)) {
      // Google and Anthropic have no Responses API, so ask through Chat Completions and read the JSON out of the reply.
      const res = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: `${input}

Reply with only JSON like {"applying_rules": [1, 3]}, or {"applying_rules": []} if none apply.` },
        ],
        max_tokens: 200,
      });
      raw = res.choices[0]?.message?.content?.match(/\{[\s\S]*\}/)?.[0] ?? "{}";
    } else {
      const res = await client.responses.create({
        model,
        ...(stateless ? { store: false } : {}),
        instructions,
        input,
        text: {
          format: {
            type: "json_schema",
            name: "verdict",
            strict: true,
            schema: {
              type: "object",
              properties: { applying_rules: { type: "array", items: { type: "integer" } } },
              required: ["applying_rules"],
              additionalProperties: false,
            },
          },
        },
      });
      raw = res.output_text;
    }
    const parsed = JSON.parse(raw) as { applying_rules?: number[] };
    const matched = [...new Set([...byWords, ...(parsed.applying_rules ?? []).map((n) => rules[n - 1]).filter(Boolean)])];
    if (!matched.length) {
      console.log(`[dots] rules: none of ${rules.length} rule(s) matched "${action.slice(0, 120)}" (reviewer ${model}); using default "${fallback}"`);
      return { decision: fallback, rule: null };
    }
    const pick = (d: RuleDecision) => matched.find((r) => r.decision === d);
    const rule = pick("never") ?? pick("ask") ?? pick("allow")!;
    return { decision: rule.decision, rule };
  } catch (err) {
    console.warn("[dots] rules: reviewer failed, so no rule was applied:", err instanceof Error ? err.message : err);
    // The reviewer is down: rules whose key words match the action still apply.
    if (byWords.length) {
      const pick = (d: RuleDecision) => byWords.find((r) => r.decision === d);
      const rule = pick("never") ?? pick("ask") ?? pick("allow")!;
      return { decision: rule.decision, rule };
    }
    // Otherwise be conservative for anything not explicitly safe.
    return { decision: fallback === "allow" ? "allow" : "ask", rule: null };
  }
}
