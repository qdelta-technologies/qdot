export const AUTH_COOKIE_NAME = "opendot_session";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, enforced on the server as well as by the cookie

const enc = new TextEncoder();
const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Key for signing sessions. It mixes in the password, so changing the password signs everyone out, and an optional
 * server secret (SESSION_SECRET, or VAULT_KEY) so a copied cookie can't be used to guess the password offline.
 */
function sessionKeyMaterial(): string {
  const secret = process.env.SESSION_SECRET || process.env.VAULT_KEY || "";
  return `opendot-auth-v2|${secret}|${process.env.ACCESS_PASSWORD?.trim() || ""}`;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(sessionKeyMaterial()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

/** Compares two strings without stopping at the first difference. */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** A signed login cookie value: "<expires-at>.<signature>". */
export async function createSessionToken(): Promise<string> {
  const exp = String(Date.now() + SESSION_MS);
  return `${exp}.${await sign(exp)}`;
}

/** True when the cookie value was signed by this server, with this password, and has not expired. */
export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await sign(exp));
}

/** Returns true if ACCESS_PASSWORD is set and non-empty. */
export function isAuthEnabled(): boolean {
  const pwd = process.env.ACCESS_PASSWORD;
  return Boolean(pwd && pwd.trim().length > 0);
}
