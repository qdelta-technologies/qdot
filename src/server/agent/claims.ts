// Catches a dot that says "done, the leads are saved / the sheet is updated" when nothing was actually saved or written.
// Weak models do this: they end the run with a confident summary without ever calling the saving or sheet tool.

export type RunCall = { name: string; args: string; output: string };

/** Did this tool call fail? Composio replies are JSON ({"successful": false, "error": ...}); our own tools reply in plain text. */
export function failed(output: string): boolean {
  const t = output.trim();
  try {
    const j: unknown = JSON.parse(t);
    if (j && typeof j === "object") {
      const o = j as { successful?: unknown; error?: unknown };
      if (o.successful === false) return true;
      return typeof o.error === "string" && o.error.trim().length > 0;
    }
  } catch {
    // not JSON: fall through to the plain-text check
  }
  return /^(error|failed|couldn'?t|could not|unable|not allowed|unknown tool|loop breaker|timed out|not run)/i.test(t);
}

const LEAD_TOOLS = /^(save_lead|update_lead|instagram_collect_leads)$/;
const SHEET_WORDS = /sheet/i;
const WRITE_WORDS = /append|add|update|create|batch|write|insert|values/i;

/** At least one call that really saved a lead or wrote to a sheet, and did not fail. */
export function savedSomething(calls: RunCall[]): boolean {
  return calls.some((c) => {
    if (failed(c.output)) return false;
    if (LEAD_TOOLS.test(c.name)) return true;
    const text = `${c.name} ${c.args}`;
    return SHEET_WORDS.test(text) && WRITE_WORDS.test(text);
  });
}

const CLAIM = /\b(done|added|saved|updated|inserted|appended|recorded|logged|completed|finished|stored)\b/i;
const SUBJECT = /\b(leads?|sheets?|spreadsheets?|rows?|google sheets)\b/i;
const HONEST = /\b(not|n't|unable|couldn'?t|failed|error|problem|sorry|unfortunately|didn'?t|can'?t|wasn'?t|no leads)\b/i;

/** The final message claims leads were saved or a sheet was updated, but no such call succeeded in this run. */
export function unverifiedClaim(finalText: string, calls: RunCall[]): boolean {
  return CLAIM.test(finalText) && SUBJECT.test(finalText) && !HONEST.test(finalText) && !savedSomething(calls);
}

/** The most recent failed call, to tell the dot what went wrong. */
export function lastFailure(calls: RunCall[]): RunCall | undefined {
  return [...calls].reverse().find((c) => failed(c.output));
}
