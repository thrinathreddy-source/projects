import crypto from "crypto";

if (!process.env.ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY env var is not set");
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
const ALGO = "aes-256-gcm";

// aes-256 needs exactly 32 bytes. Buffer.from(…, "hex") doesn't complain about
// a short or non-hex value — it just returns fewer bytes — so a mistyped key
// used to sail through boot and fail inside createCipheriv on the first
// registration instead, as a generic 500.
if (KEY.length !== 32) {
  throw new Error(
    `ENCRYPTION_KEY must be 64 hex characters (32 bytes); got ${KEY.length} bytes`
  );
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv:tag:ciphertext — all hex
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, dataHex] = ciphertext.split(":");
  // Callers distinguish "this row predates encryption" from "the key is wrong"
  // by catching this. A malformed value used to reach Buffer.from(undefined)
  // and throw a TypeError about arguments instead of saying what was wrong.
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Malformed ciphertext: expected iv:tag:data");
  }
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final("utf8");
}
