import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Object storage.
 *
 * Cloudflare R2 in production — S3-compatible, and crucially zero egress fees,
 * which matters a great deal when the product is people downloading video.
 * When R2 is not configured we fall back to the local filesystem so a fresh
 * clone runs end to end; both drivers expose the same interface and issue
 * expiring signed URLs, so nothing downstream knows which is in use.
 *
 * Rendered files are never public: access is always a short-lived signed URL.
 */

export type StoredObject = {
  key: string;
  sizeBytes: number;
  contentType: string;
};

interface StorageDriver {
  readonly kind: "r2" | "local";
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  remove(key: string): Promise<void>;
  /**
   * Duplicate an object without the bytes passing through this process.
   *
   * The render cache is supposed to make a repeat render nearly free; pulling
   * fifty megabytes into a Buffer and pushing it back would spend most of a
   * worker step's time and memory budget doing it.
   */
  copy(fromKey: string, toKey: string): Promise<StoredObject>;
  /**
   * `downloadAs` turns the link into a save-to-disk with that filename rather
   * than something the browser plays inline.
   */
  signedUrl(key: string, expiresInSec: number, downloadAs?: string): Promise<string>;
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>;
}

// ---------------------------------------------------------------------------
// R2
// ---------------------------------------------------------------------------

class R2Driver implements StorageDriver {
  readonly kind = "r2" as const;
  private client: S3Client;
  private bucket: string;

  constructor() {
    const config = env();
    this.bucket = config.R2_BUCKET;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.R2_ACCESS_KEY_ID,
        secretAccessKey: config.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Renders are immutable once written, so they cache forever.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    return { key, sizeBytes: body.byteLength, contentType };
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async copy(fromKey: string, toKey: string): Promise<StoredObject> {
    // R2 does the copy internally; we never see the bytes.
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        // CopySource is a URL path, not a key: S3 decodes it before looking the
        // object up, so an unencoded key containing a space, a plus or a
        // percent resolves to a different object — or to nothing at all. The
        // slashes are separators and must survive.
        CopySource: `${this.bucket}/${fromKey.split("/").map(encodeURIComponent).join("/")}`,
        Key: toKey,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    // The copy response carries no size, and the caller records one, so ask.
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: toKey }),
    );

    return {
      key: toKey,
      sizeBytes: head.ContentLength ?? 0,
      contentType: head.ContentType ?? "application/octet-stream",
    };
  }

  async signedUrl(
    key: string,
    expiresInSec: number,
    downloadAs?: string,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: downloadAs
          ? `attachment; filename="${downloadAs.replace(/["\\]/g, "")}"`
          : undefined,
      }),
      { expiresIn: expiresInSec },
    );
  }

  async get(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await response.Body?.transformToByteArray();
      if (!bytes) return null;
      return {
        body: Buffer.from(bytes),
        contentType: response.ContentType ?? "application/octet-stream",
      };
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Local filesystem
// ---------------------------------------------------------------------------

const LOCAL_ROOT = path.join(process.cwd(), ".storage");

/**
 * Reject keys that would escape the storage root. Keys are built by us, but a
 * path-traversal guard on the one function that touches the filesystem is
 * cheaper than auditing every caller forever.
 */
function localPath(key: string): string {
  const resolved = path.resolve(LOCAL_ROOT, key);
  if (!resolved.startsWith(LOCAL_ROOT + path.sep)) {
    throw new AppError("VALIDATION", "Invalid storage key.");
  }
  return resolved;
}

class LocalDriver implements StorageDriver {
  readonly kind = "local" as const;

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    const target = localPath(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    await fs.writeFile(`${target}.type`, contentType, "utf8");
    return { key, sizeBytes: body.byteLength, contentType };
  }

  async remove(key: string): Promise<void> {
    const target = localPath(key);
    await fs.rm(target, { force: true });
    await fs.rm(`${target}.type`, { force: true });
  }

  async copy(fromKey: string, toKey: string): Promise<StoredObject> {
    const source = localPath(fromKey);
    const target = localPath(toKey);

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
    await fs.copyFile(`${source}.type`, `${target}.type`).catch(() => {});

    const [stat, contentType] = await Promise.all([
      fs.stat(target),
      fs.readFile(`${target}.type`, "utf8").catch(() => "application/octet-stream"),
    ]);

    return { key: toKey, sizeBytes: stat.size, contentType: contentType.trim() };
  }

  async signedUrl(
    key: string,
    expiresInSec: number,
    downloadAs?: string,
  ): Promise<string> {
    const expiresAt = Date.now() + expiresInSec * 1000;
    const signature = signLocalKey(key, expiresAt);
    const params = new URLSearchParams({ e: String(expiresAt), s: signature });
    // Not part of the signature: the filename only affects presentation, and
    // signing it would break links whenever a project is renamed.
    if (downloadAs) params.set("d", downloadAs);
    return `/api/storage/${key}?${params.toString()}`;
  }

  async get(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    try {
      const target = localPath(key);
      const body = await fs.readFile(target);
      const contentType = await fs
        .readFile(`${target}.type`, "utf8")
        .catch(() => "application/octet-stream");
      return { body, contentType: contentType.trim() };
    } catch {
      return null;
    }
  }
}

/**
 * HMAC over key + expiry. The local driver has to enforce expiry itself, since
 * unlike R2 there is no service checking the signature for us.
 */
function signLocalKey(key: string, expiresAt: number): string {
  return crypto
    .createHmac("sha256", env().BETTER_AUTH_SECRET)
    .update(`${key}:${expiresAt}`)
    .digest("base64url");
}

export function verifyLocalSignature(
  key: string,
  expiresAt: number,
  signature: string,
): boolean {
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const expected = signLocalKey(key, expiresAt);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (!driver) {
    /**
     * Refuse the local driver in production.
     *
     * The fallback exists so a fresh clone runs end to end, and that is worth
     * keeping — but on a serverless host it writes renders to a container
     * filesystem that is discarded when the instance goes away. Everything
     * would look correct: the job succeeds, the project shows as complete, the
     * video plays for a few minutes. Then the URL 404s forever, for every
     * customer, and the credits are already spent.
     *
     * Silently losing paid work is worse than not starting, so a deployment
     * missing the R2 credentials fails on first use with the reason.
     */
    if (env().isProduction && !env().hasR2) {
      throw new Error(
        "Refusing to start: R2 is not configured in production. Set R2_ACCOUNT_ID, " +
          "R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET. Without them renders " +
          "would be written to an ephemeral filesystem and lost.",
      );
    }

    driver = env().hasR2 ? new R2Driver() : new LocalDriver();
    if (driver.kind === "local") {
      logger.warn("storage", "R2 is not configured — renders go to the local filesystem");
    }
  }
  return driver;
}

/** Deterministic, collision-free key layout. */
export function storageKey(parts: {
  userId: string;
  projectId: string;
  tier: string;
  kind: "video" | "thumb" | "audio";
  extension: string;
}): string {
  return [
    "renders",
    parts.userId,
    parts.projectId,
    `${parts.tier.toLowerCase()}-${parts.kind}.${parts.extension}`,
  ].join("/");
}

const EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
};

export function extensionFor(contentType: string): string {
  return EXTENSIONS[contentType.split(";")[0].trim()] ?? "bin";
}

/** How long a download link stays valid. Long enough to click, short enough
 *  that a leaked URL is not a permanent hole. */
export const SIGNED_URL_TTL_SEC = 60 * 60;

export async function signedUrl(key: string, ttlSec = SIGNED_URL_TTL_SEC) {
  return storage().signedUrl(key, ttlSec);
}

/** A link that saves to disk under `filename` instead of playing inline. */
export async function signedDownloadUrl(
  key: string,
  filename: string,
  ttlSec = SIGNED_URL_TTL_SEC,
) {
  return storage().signedUrl(key, ttlSec, filename);
}

/** Turn a project title into something safe for a filesystem. */
export function safeFilename(title: string, extension: string): string {
  const base =
    title
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60)
      .toLowerCase() || "arka-video";
  return `${base}.${extension}`;
}

export async function remove(key: string | null | undefined) {
  if (!key) return;
  try {
    await storage().remove(key);
  } catch (error) {
    // A failed delete leaves an orphan object, which costs pennies. Failing the
    // user's delete request over it would be the worse outcome.
    logger.warn("storage", "Failed to delete object", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Cap on what we will pull from a provider, as a crude corruption guard. */
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;

export type FetchedAsset = { body: Buffer; contentType: string };

/**
 * Pull a provider's output into memory.
 *
 * Separate from storing it because narration has to be muxed onto the video
 * before either is worth persisting. Handles `data:` URLs, which is how the
 * mock providers return their assets.
 */
export async function fetchAsset(
  sourceUrl: string,
  fallbackContentType: string,
): Promise<FetchedAsset> {
  if (sourceUrl.startsWith("data:")) {
    const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(sourceUrl);
    if (!match) throw new AppError("PROVIDER_FAILED", "Malformed data URL from provider.");

    const [, contentType, isBase64, payload] = match;
    return {
      body: Buffer.from(payload, isBase64 ? "base64" : "utf8"),
      contentType: contentType || fallbackContentType,
    };
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new AppError(
      "PROVIDER_FAILED",
      `Could not download the render (HTTP ${response.status}).`,
      { retryable: response.status >= 500 || response.status === 429 },
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new AppError("PROVIDER_FAILED", "Provider returned an empty file.", {
      retryable: true,
    });
  }
  if (buffer.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new AppError("PROVIDER_FAILED", "Render is implausibly large; refusing it.");
  }

  const contentType =
    response.headers.get("content-type")?.split(";")[0].trim() || fallbackContentType;

  return { body: buffer, contentType };
}

/** Persist bytes under our own key. */
export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<StoredObject> {
  return storage().put(key, body, contentType);
}

/**
 * Fetch a provider's output and persist it in one step.
 *
 * Provider URLs expire, so a render only becomes durable once it lands here.
 */
export async function ingest(
  sourceUrl: string,
  key: string,
  fallbackContentType: string,
): Promise<StoredObject> {
  const asset = await fetchAsset(sourceUrl, fallbackContentType);
  return putObject(key, asset.body, asset.contentType);
}

/** Copy an already-stored object to a new key — used by the render cache. */
export async function copyObject(fromKey: string, toKey: string): Promise<StoredObject> {
  try {
    return await storage().copy(fromKey, toKey);
  } catch (error) {
    // A missing source is the expected failure: the cache row outlived the
    // object it points at. Say so in the shape the caller already handles,
    // which evicts the entry and renders fresh.
    throw new AppError("NOT_FOUND", "Cached render is missing.", {
      details: { fromKey, reason: error instanceof Error ? error.message : String(error) },
    });
  }
}
