# OppIDX

The opportunity board: internships, scholarships, fellowships, grants and
competitions for students, early-career job seekers and founders, all in one
place, updated constantly and free to browse.

Next.js (App Router) + Prisma. Uses SQLite locally and Turso (libSQL) in production.

## Running it

```bash
npm install          # also runs `prisma generate`
echo 'DATABASE_URL="file:./dev.db"' > .env
npm run setup-db     # creates the local SQLite database
npm run seed-opportunities
npm run dev
```

Open http://localhost:3000.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run setup-db` | `prisma db push` + `prisma generate` |
| `npm run seed-opportunities` | Load `data/opportunities-import.json` |
| `npm run seed-resources` | Seed the resources directory |

One-off maintenance scripts (backfills, Turso migrations, cleanup) live in `scripts/`.

## Environment

Local development needs only `DATABASE_URL="file:./dev.db"`. Each feature
below turns on when its variables are set.

- **Database (prod):** `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- **Auth / sessions:** `SESSION_SECRET`, `ENCRYPTION_KEY`, `ADMIN_EMAIL`, `ADMIN_SETUP_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Email:** `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`
- **AI:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
- **Payments:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_ID_MONTHLY`, `RAZORPAY_PLAN_ID_ANNUAL`, `RAZORPAY_SUBSCRIPTION_YEARS`
- **Push / SMS / chat:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DISCORD_WEBHOOK_URL`
- **Scraper sources:** `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `USAJOBS_API_KEY`, `USAJOBS_USER_AGENT_EMAIL`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `DATA_GOV_IN_API_KEY`
- **Cron / SEO:** `CRON_SECRET`, `GOOGLE_SEARCH_CONSOLE_SITE_URL`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

## Layout

```
app/          pages and API routes (app/api/*)
components/   UI components
lib/          domain logic: scraper, feeds, digests, billing, SEO …
prisma/       schema.prisma
scripts/      seed, backfill and migration scripts
data/         opportunities-import.json (seed data)
supabase-schema*.sql   Supabase tables for events, pulse and users
.github/      CI + scheduled scrape/SEO workflows (see note below)
```

Instagram posting setup: [INSTAGRAM_SETUP.md](INSTAGRAM_SETUP.md).

> **Note:** GitHub only runs workflows from the repository root's `.github/`.
> The workflows in `oppidx/.github/workflows/` are kept here for reference and
> do not run while this project lives inside the `projects` monorepo.
