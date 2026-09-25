-- AlterTable
ALTER TABLE "user" ADD COLUMN     "signupGrantedAt" TIMESTAMP(3);

-- Anyone who was granted welcome credits under the old rule (granted at signup,
-- before this column existed) must be marked as already paid out. Otherwise the
-- first time they verify their email they would collect a second grant.
UPDATE "user" u
   SET "signupGrantedAt" = l."createdAt"
  FROM (
    SELECT "userId", MIN("createdAt") AS "createdAt"
      FROM "credit_ledger"
     WHERE "reason" = 'SIGNUP_GRANT'
     GROUP BY "userId"
  ) l
 WHERE l."userId" = u."id";
