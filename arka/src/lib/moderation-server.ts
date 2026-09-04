import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";
import { moderate, needsReview } from "@/lib/moderation";

/**
 * The enforcing half of content moderation.
 *
 * Split from `moderation.ts` because that module is reached from
 * `catalog.ts`, which client components import — so a single `logger` import
 * there pulled `db`, Prisma and `pg` into the browser bundle and failed the
 * build on `Can't resolve 'dns'`. The matching rules have to stay portable;
 * the parts that log and throw do not, so they live here.
 */

/**
 * Throw if a submission is refused, and record that it was.
 *
 * The log line matters as much as the block: a rule that fires constantly is
 * either catching an attack or is wrong about ordinary language, and there is
 * no way to tell which without counting. Only the rule id and the user are
 * recorded, never the prompt — storing the worst thing anybody typed creates a
 * liability rather than removing one.
 */
export function enforceModeration(
  input: { prompt: string; script?: string | null; title?: string },
  userId: string,
): void {
  const combined = [input.title, input.prompt, input.script]
    .filter(Boolean)
    .join("\n");

  const verdict = moderate(combined);
  if (verdict.allowed) return;

  logger.warn("api", "Refused a generation on content policy", {
    userId,
    rule: verdict.rule,
  });

  throw new AppError("FORBIDDEN", verdict.message, {
    details: { policy: verdict.rule },
  });
}

/**
 * Queue a rendered project for a human to look at.
 *
 * Never throws and never blocks: the render has already been paid for and is
 * proceeding. A review queue that can fail a generation would be a worse
 * problem than the one it exists to solve.
 *
 * The excerpt is kept because a reviewer cannot judge a decision without seeing
 * what was asked for, and it is deleted when the item is resolved.
 */
export async function flagForReview(
  input: { prompt: string; script?: string | null; title?: string },
  context: { userId: string; projectId: string },
): Promise<void> {
  const combined = [input.title, input.prompt, input.script].filter(Boolean).join("\n");
  const flag = needsReview(combined);
  if (!flag) return;

  try {
    await db.reviewItem.create({
      data: {
        userId: context.userId,
        projectId: context.projectId,
        reason: flag.reason,
        excerpt: combined.slice(0, 1000),
      },
    });

    logger.info("api", "Queued a generation for review", {
      userId: context.userId,
      projectId: context.projectId,
      reason: flag.reason,
    });
  } catch (error) {
    logger.error("api", "Could not queue a generation for review", {
      projectId: context.projectId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
