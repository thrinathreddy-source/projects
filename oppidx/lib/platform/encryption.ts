import crypto from "crypto";

const ALGO = "aes-256-gcm";

// Lazy — resolved on first real encrypt/decrypt call, not at module
// evaluation. Five API routes import this module; Next's build-time page
// data collection loads every route file it can reach, so throwing here
// at the top level crashed the whole build in any environment missing
// ENCRYPTION_KEY (CI in particular, which never sets it) — not just a
// request that actually needed to encrypt something. Same fix as the
// lazy Proxy in lib/platform/supabase.ts, for the same reason.
let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (!cachedKey) {
    if (!process.env.ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY env var is not set");
    cachedKey = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
  }
  return cachedKey;
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv:tag:ciphertext — all hex
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, dataHex] = ciphertext.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final("utf8");
}
