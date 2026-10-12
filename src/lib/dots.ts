import type { Dot } from "./types";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const byName = (a: Dot, b: Dot) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/** Sidebar view keys: every dot, or the dots that are in no folder. Anything else is a folder name. */
export const ALL_FOLDERS = "all";
export const NONE_FOLDER = "__none";

/** Every folder name: the ones saved on the server (they may be empty) plus any a dot uses. Mine first, then A to Z. */
export function foldersOf(dots: Dot[], stored: string[], me: string): string[] {
  const seen = new Map<string, string>();
  for (const n of [...stored, ...ownersOf(dots)]) {
    const t = n.trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].sort((a, b) => Number(!!me && same(b, me)) - Number(!!me && same(a, me)) || a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export type OwnerGroup = { owner: string; label: string; mine: boolean; dots: Dot[] };

/** The distinct owner names in use, A to Z (case-insensitive; the first spelling seen wins). */
export function ownersOf(dots: Dot[]): string[] {
  const seen = new Map<string, string>();
  for (const d of dots) {
    const o = d.owner.trim();
    if (o && !seen.has(o.toLowerCase())) seen.set(o.toLowerCase(), o);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** Whether a dot belongs to the given owner name ("" matches only unassigned dots). */
export function ownedBy(dot: Dot, owner: string): boolean {
  return same(dot.owner, owner);
}

/**
 * Dots grouped by owner, each group A to Z. Order: my dots first, other owners A to Z, unassigned last.
 * A single group (nobody has an owner yet) comes back with an empty label so callers can skip the heading.
 */
export function groupByOwner(dots: Dot[], me: string): OwnerGroup[] {
  const groups: OwnerGroup[] = [];
  for (const owner of ownersOf(dots)) {
    groups.push({ owner, label: owner, mine: !!me && same(owner, me), dots: dots.filter((d) => ownedBy(d, owner)).sort(byName) });
  }
  groups.sort((a, b) => Number(b.mine) - Number(a.mine));
  const unassigned = dots.filter((d) => !d.owner.trim()).sort(byName);
  if (unassigned.length) groups.push({ owner: "", label: groups.length ? "No project" : "", mine: false, dots: unassigned });
  return groups;
}
