# The Mayatara

Answer five honest questions and the AI finds you one real match every
Friday: dating, friendship, co-founder or marriage. Free, private, made in India.

Next.js (App Router) + Supabase, using Anthropic/OpenAI for the interview, matching and
moderation, and Resend for email.

## Running it

```bash
npm install
# create .env.local with the variables below
npm run dev
```

Open http://localhost:3000.

Database: run `supabase-schema.sql`, then `supabase-schema-users-v2.sql`,
then `supabase-schema-launch.sql` in the Supabase SQL editor.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run indexnow` | Ping IndexNow with the site's URLs |
| `./deploy.sh` | Deploy to Vercel production |

## Environment

- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **AI:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
- **Email:** `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL`
- **Security / jobs:** `ENCRYPTION_KEY`, `CRON_SECRET`
- **Optional:** `NEXT_PUBLIC_APP_URL`, `MIN_MATCH_SCORE`

## Layout

```
app/          pages (interview, match, compatibility, dashboard, auth) and API routes
lib/          matcher, embeddings, moderation, encryption, email, SEO
public/       icons and static files
scripts/      indexnow.mjs
proposals/    separate: Arka solar proposal document generators (see proposals/README.md)
```
