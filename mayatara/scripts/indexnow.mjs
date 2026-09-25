#!/usr/bin/env node
/**
 * Ping IndexNow for the live site: `npm run indexnow`
 *
 * Run it after deploying a change to page content. Bing, Yandex, Seznam and
 * Naver then re-crawl those URLs instead of waiting for their own schedule.
 * Google ignores IndexNow — its equivalent is the sitemap already submitted in
 * Search Console.
 *
 * Reads CRON_SECRET from the environment, falling back to .env.local so this
 * works straight from a checkout.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function fromEnvFile(name) {
  try {
    const line = readFileSync(join(root, ".env.local"), "utf8")
      .split("\n")
      .find((l) => l.trim().startsWith(`${name}=`));
    return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

const secret = process.env.CRON_SECRET || fromEnvFile("CRON_SECRET");
const site = process.env.NEXT_PUBLIC_APP_URL || fromEnvFile("NEXT_PUBLIC_APP_URL") || "https://www.themayatara.com";

if (!secret) {
  console.error("CRON_SECRET not set (checked the environment and .env.local).");
  process.exit(1);
}

const res = await fetch(`${site.replace(/\/$/, "")}/api/indexnow`, {
  method: "POST",
  // proxy.ts rejects /api/ requests with no User-Agent as raw bot traffic, and
  // Node's fetch doesn't set one on its own.
  headers: {
    "x-cron-secret": secret,
    "Content-Type": "application/json",
    "User-Agent": "mayatara-indexnow-script",
  },
  // No body: submit every indexable URL. Pass { urls: [...] } to narrow it.
  body: "{}",
});

const body = await res.text();
console.log(`${res.status} ${res.statusText}`);
console.log(body);
process.exit(res.ok ? 0 : 1);
