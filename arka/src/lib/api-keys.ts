import crypto from "node:crypto";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * API keys.
 *
 * The plaintext key exists exactly once, in the response that creates it. We
 * store a SHA-256 hash and an eight-character prefix — enough to identify a key
 * in the UI, useless to anyone who steals the database. A plain hash rather
 * than bcrypt is the right call here: the key is 256 bits of our own entropy,
 * so there is no dictionary to attack, and verification happens on every
 * request where a slow KDF would be a real cost.
 */

const PREFIX = "arka_sk_";

function hash(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export async function issue(userId: string, name: string) {
  const count = await db.apiKey.count({ where: { userId, revokedAt: null } });
  if (count >= 10) {
    throw new AppError("CONFLICT", "You can have at most 10 active keys.");
  }

  const secret = crypto.randomBytes(24).toString("base64url");
  const key = `${PREFIX}${secret}`;

  const record = await db.apiKey.create({
    data: {
      userId,
      name: name.trim() || "Untitled key",
      prefix: key.slice(0, 16),
      hashedKey: hash(key),
    },
    select: { id: true, name: true, prefix: true, createdAt: true },
  });

  logger.event("api", "API key issued", { userId, keyId: record.id });

  // The only time the caller ever sees this.
  return { ...record, key };
}

export async function list(userId: string) {
  return db.apiKey.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
  });
}

export async function revoke(userId: string, keyId: string) {
  const result = await db.apiKey.updateMany({
    where: { id: keyId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (result.count === 0) throw notFound("Key not found.");
  logger.event("api", "API key revoked", { userId, keyId });
}

/**
 * Resolve an `Authorization: Bearer arka_sk_…` header to a user.
 *
 * Returns null rather than throwing so callers can fall through to cookie
 * auth without treating a missing key as an error.
 */
export async function authenticate(authorization: string | null) {
  if (!authorization?.startsWith("Bearer ")) return null;

  const key = authorization.slice(7).trim();
  if (!key.startsWith(PREFIX)) return null;

  const record = await db.apiKey.findUnique({
    where: { hashedKey: hash(key) },
    include: {
      user: {
        select: { id: true, name: true, email: true, planCode: true, banned: true },
      },
    },
  });

  if (!record || record.revokedAt) return null;
  if (record.user.banned) return null;

  // Fire-and-forget: a last-used timestamp is not worth blocking a request for.
  void db.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return record.user;
}
