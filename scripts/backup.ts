import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * A logical backup of the whole database — `npm run backup`.
 *
 * Your hosting provider's point-in-time recovery is the real backup and this is
 * not a replacement for it. It exists for the two things PITR does not give
 * you: a copy that survives the provider account itself, and a file you can
 * load locally to answer "what did this row look like last Tuesday" without
 * touching production.
 *
 * `credit_ledger` is the reason to care. Every other table can be rebuilt from
 * the vendors — projects re-render, transactions are mirrored in Razorpay — but
 * the ledger is the only record of what each customer is owed, and there is
 * nowhere to recover it from.
 *
 * Run it from a machine with `pg_dump` on the PATH, at a version at least as
 * new as the server. Put it on a schedule outside this app: a backup that only
 * runs when the app is healthy is not a backup.
 */

const OUT = process.env.BACKUP_DIR || path.join(process.cwd(), ".backups");

function main() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    console.error("\n  DATABASE_URL is not set.\n");
    process.exit(1);
  }

  if (/localhost|127\.0\.0\.1/.test(url) && !process.argv.includes("--local")) {
    console.error(
      "\n  DATABASE_URL points at localhost. Backing up a dev database is\n" +
        "  probably not what you meant — pass --local if it is.\n",
    );
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });

  // Sortable, and safe on every filesystem.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const target = path.join(OUT, `arka-${stamp}.dump`);

  console.log(`\n  Dumping to ${path.relative(process.cwd(), target)}…`);

  try {
    execFileSync(
      "pg_dump",
      [
        url,
        // Custom format: compressed, and restorable table by table with
        // pg_restore, which is what you want at 3am.
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        `--file=${target}`,
      ],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
  } catch (error) {
    console.error(
      "\n  pg_dump failed. Is it installed, and is its version >= the server's?\n" +
        `  ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }

  const size = statSync(target).size;

  // A dump that is suspiciously small usually means it connected and found
  // nothing — a wrong database name, most often. Better to say so.
  if (size < 20_000) {
    console.warn(
      `\n  ! The dump is only ${size} bytes. Check DATABASE_URL names the right database.\n`,
    );
  }

  console.log(`  Done — ${(size / 1_048_576).toFixed(1)} MB\n`);
  console.log("  Restore with:");
  console.log(`    pg_restore --clean --no-owner -d "$DATABASE_URL" ${target}\n`);
  console.log(
    "  Copy it somewhere off this machine and off the database provider.\n" +
      "  A backup stored beside the thing it backs up is a rehearsal, not a backup.\n",
  );
}

main();
