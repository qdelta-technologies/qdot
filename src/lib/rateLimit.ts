import { headers } from "next/headers";
import type { NextRequest } from "next/server";

interface RateLimitState {
  count: number;
  resetAt: number;
}

const MAX_ATTEMPTS = 5;
// Across every address combined. A guesser who changes the address on each try still runs into this.
const GLOBAL_MAX_ATTEMPTS = 25;
const GLOBAL_KEY = "*all*";
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// In-memory store for tracking failed login attempts by IP
const attemptsMap = new Map<string, RateLimitState>();

// Periodic cleanup of expired entries
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, state] of attemptsMap.entries()) {
      if (now > state.resetAt) {
        attemptsMap.delete(ip);
      }
    }
  }, 5 * 60 * 1000);
  if (timer.unref) {
    timer.unref();
  }
}

/** The address our own proxy added at the end of the list. The first entries are written by the visitor, so they can't be trusted. */
function lastForwarded(header: string): string {
  const parts = header.split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] || "unknown";
}

/** Extracts client IP from incoming Next.js server headers. */
export async function getClientIp(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) {
      return lastForwarded(forwarded);
    }
    return h.get("x-real-ip") || h.get("cf-connecting-ip") || "unknown";
  } catch {
    return "unknown";
  }
}

/** Extracts client IP from NextRequest (API routes / middleware). */
export function getRequestIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return lastForwarded(forwarded);
  }
  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "unknown";
}

/** Checks whether the given IP is currently locked out. */
export function checkRateLimit(ip: string): { allowed: boolean; waitMinutes?: number } {
  const own = checkBucket(ip, MAX_ATTEMPTS);
  return own.allowed ? checkBucket(GLOBAL_KEY, GLOBAL_MAX_ATTEMPTS) : own;
}

function checkBucket(ip: string, max: number): { allowed: boolean; waitMinutes?: number } {
  const now = Date.now();
  const entry = attemptsMap.get(ip);

  if (!entry) return { allowed: true };

  // Lockout period has passed
  if (now > entry.resetAt) {
    attemptsMap.delete(ip);
    return { allowed: true };
  }

  if (entry.count >= max) {
    const remainingSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    const waitMinutes = Math.max(1, Math.ceil(remainingSeconds / 60));
    return { allowed: false, waitMinutes };
  }

  return { allowed: true };
}

/** Increments failed attempt counter for an IP. */
export function recordFailedAttempt(ip: string): { count: number; remaining: number } {
  const own = bump(ip, MAX_ATTEMPTS);
  const all = bump(GLOBAL_KEY, GLOBAL_MAX_ATTEMPTS);
  return { count: own.count, remaining: Math.min(own.remaining, all.remaining) };
}

function bump(key: string, max: number): { count: number; remaining: number } {
  const now = Date.now();
  const entry = attemptsMap.get(key);

  if (!entry || now > entry.resetAt) {
    attemptsMap.set(key, { count: 1, resetAt: now + LOCKOUT_MS });
    return { count: 1, remaining: max - 1 };
  }

  entry.count += 1;
  return { count: entry.count, remaining: Math.max(0, max - entry.count) };
}

/** Clears rate limit state upon successful authentication. */
export function resetRateLimit(ip: string): void {
  attemptsMap.delete(ip);
}
