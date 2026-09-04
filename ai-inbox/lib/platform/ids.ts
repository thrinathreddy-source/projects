import crypto from "crypto";

export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base || "event"}-${suffix}`;
}

export function manageToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function checkinCode(): string {
  return crypto.randomBytes(5).toString("hex").toUpperCase().slice(0, 8);
}
