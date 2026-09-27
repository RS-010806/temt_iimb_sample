import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// scrypt cost parameters are stored with each hash, so they can be raised later without resetting passwords.
const N = 32768, R = 8, P = 1, KEY_LENGTH = 64;
const MAX_MEMORY = 128 * N * R * 2;

function derive(password: string, salt: Buffer, n = N, r = R, p = P, length = KEY_LENGTH) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, length, { N: n, r, p, maxmem: Math.max(MAX_MEMORY, 128 * n * r * 2) }, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, n, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !key) return false;
  const expected = Buffer.from(key, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummy: Promise<string> | undefined;
/** Hash to verify against when an email is unknown, so response time does not reveal which accounts exist. */
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(12).toString("hex")));

export const newToken = () => randomBytes(32).toString("base64url");
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    try { out[name] = decodeURIComponent(part.slice(index + 1).trim()); } catch { /* ignore malformed cookie */ }
  }
  return out;
}

export function serializeCookie(name: string, value: string, options: { maxAge: number; secure: boolean }) {
  return [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${Math.max(0, Math.floor(options.maxAge))}`, ...(options.secure ? ["Secure"] : [])].join("; ");
}

/** Strip control characters and trim; names and organisations are shown back in the UI and in exports. */
export const cleanText = (value: string) => value.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, "").trim();
