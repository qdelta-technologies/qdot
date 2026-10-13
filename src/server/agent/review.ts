import "server-only";
import * as repo from "../repo";
import type { Rule, RuleDecision } from "@/lib/types";

// "Your dot knows when to take action, and when to ask for approval."
// Each dot has one approval mode, picked in its Setup page:
//   allow: it never asks, every action runs on its own.
//   ask:   each action follows its own default, so reading and searching run and anything that changes things asks first.
//   never: actions that would ask are refused instead; reading and searching still run.

export type Verdict = { decision: RuleDecision; rule: Rule | null };

export async function review(dotId: string, _action: string, fallback: RuleDecision): Promise<Verdict> {
  const mode = repo.approvalMode(dotId);
  if (mode === "allow") return { decision: "allow", rule: null };
  if (mode === "never" && fallback !== "allow") return { decision: "never", rule: null };
  return { decision: fallback, rule: null };
}
