# Arka

Turn a line of text into a short anime-style video. Built for Indian creators —
twelve languages, vertical by default, priced in rupees.

This is a workflow product, not a chat wrapper: a user submits a job, it is
queued, priced in credits, dispatched to a model vendor, polled, stored, and
delivered — with every step accounted for so we can tell whether it makes money.

---

## Running it

You need Node 20+ and a Postgres database.

```bash
npm install
cp .env.example .env
```

Put a Postgres connection string in `.env` as `DATABASE_URL`. Neon, Supabase and
Railway all have a free tier that takes about a minute to set up; a local
Postgres or a `postgres:17` container works just as well. Then:

```bash
npm run setup   # migrate + generate + seed plans
npm run dev
```

Open http://localhost:3000. Put your email in `ADMIN_EMAILS` before signing up
and your account is promoted to admin automatically.

**It works with zero API keys.** The `mock` providers render an animated
placeholder and a real (tone-based) WAV narration track through the identical
pipeline a live vendor uses — queue, synthesis, muxing, storage, signed URLs,
playback, download, credit settlement. Set `FAL_KEY` and
`VIDEO_PROVIDERS="fal,mock"` when you want real video and speech.

### Other commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Integration suite — needs a Postgres named `*_test` |
| `npm run worker` | Standalone queue worker (optional — see below) |
| `npm run preflight` | The launch checklist, as a program. Exits 1 on anything blocking |
| `npm run backup` | `pg_dump` of the whole database to `.backups/` |
| `npm run db:migrate` | Create a migration from schema changes |
| `npm run db:studio` | Prisma Studio |
| `npx tsx scripts/check-mux.ts` | Verify the narration mux path end to end |
| `npm run probe:quality` | Is the output good enough? Controlled A/B on checkpoint, resolution and the cadence pass. Dry run unless `--yes` |

---

## Architecture

### Folder structure

```
prisma/
  schema.prisma            25 models: auth, projects, jobs, credits, money, ops
                           (see the data-model table below)
  migrations/              SQL, applied with `prisma migrate deploy`
  seed.ts                  Plan catalog

scripts/
  worker.ts                Standalone queue worker
  check-mux.ts             End-to-end check of the narration mux path
  inspect.ts               Ad-hoc database dump

src/
  app/
    (marketing)/           Landing, pricing, legal — public
    (auth)/                Sign in / sign up
    (app)/                 Everything behind auth: dashboard, generate,
                           projects, billing, settings, admin
    api/                   Route handlers
    suspended/             Banned-account page
  components/
    ui/                    shadcn primitives (Base UI)
    app-shell/             Sidebar, nav, user menu, credits badge
    generate/              The generation workspace
    projects/  billing/  settings/  admin/
  lib/
    providers/             Video + voice abstractions — types, mock, fal, routers
    payments/              Payment abstraction — types, razorpay
    db.ts env.ts errors.ts api.ts        Foundations
    credits.ts queue.ts worker.ts        The core workflow
    budget.ts storage.ts settings.ts     Guard rails
    mux.ts mailer.ts api-auth.ts         Media, email, bearer-key auth
    projects.ts billing.ts admin.ts      Services
  proxy.ts                 Optimistic route protection (Next 16 `proxy`)
```

### The generation pipeline

```
POST /api/projects
  └─ one transaction: create project → enqueue job → reserve credits
                      (insufficient balance rolls back all three)
  └─ nudgeQueue()  — a queue tick runs after the response is sent

worker tick (step function, one step per tick, against a time budget)
  ├─ dispatch step
  │    ├─ render cache hit?  → copy object, settle credits, done. Cost: zero.
  │    ├─ daily budget full? → defer to tomorrow, credits stay reserved
  │    └─ router.dispatch()  → cheapest healthy provider, failover on transient
  └─ poll step
       ├─ still running  → update progress, reschedule in 5s
       ├─ failed         → drop the provider handle, refund the budget
                           estimate, retry from dispatch — or dead-letter
       ├─ succeeded but  → hand the job straight back; the next tick finishes it
       │  out of time
       └─ succeeded      → fetch render → narrate (if a voice was chosen)
                           → cadence pass + mux → store → Video + Generation
                           → settle credits → done
```

**Retrying means re-rendering.** A job's provider handle is how the worker
decides which step to run, so a retry drops it — otherwise the next tick asks
the vendor about the attempt that just failed, gets the same failure, and burns
the attempt ceiling without ever rendering again. Dropping the handle also means
the budget estimate charged at dispatch has to go back, because the next
dispatch charges its own.

**A tick works against a clock.** The step function was already built so that
stopping between steps loses nothing; the budget is what makes it stop between
steps rather than wherever the platform pulls the plug. Nothing starts the
finish step — fetch, encode, upload, the only genuinely expensive thing here —
without enough budget left to complete it, because being killed halfway through
means the provider has been paid and the render is gone. `WORKER_TICK_BUDGET_MS`
defaults to 50s, sized for the `maxDuration = 60` the routes declare, which is
the lowest ceiling any Vercel plan imposes. Raise both together or neither.

Narration is its own vendor call inside the success step: synthesise speech,
store it, and mux it onto the video with ffmpeg in the same pass as the cadence
filter. That pass re-encodes — a filter cannot be a stream copy — which makes it
the most expensive thing a worker does and the reason the finish step has a
budget of its own.

If narration does not make it into the delivered file, the surcharge is
refunded. That covers both routes to the same outcome: synthesis failing, and
synthesis succeeding but the mux not. They used to be treated differently, which
meant a customer could pay for narration, get a silent download, and be told
nothing — the player would lay the separate audio track over the video, but the
download endpoint hands over the video object and nothing else.

The worker is a **step function**, not a loop: each tick either dispatches or
polls, then hands the job back. That keeps every invocation short and bounded,
so the same code runs under a Vercel cron and as a long-lived process, and a
deploy mid-render loses nothing.

**How work actually gets driven.** Vercel's cron floor is one minute, which
would make a ten-second render feel like seventy. So the requests already
happening — submitting a generation, polling its progress — each run a queue
tick via `after()`. The person waiting on their render is the thing advancing
it, at zero infrastructure cost. `vercel.json` still schedules a cron tick for
jobs nobody is watching: deferred work waiting on tomorrow's budget, and leases
abandoned by a crashed worker.

### Provider abstraction

`VideoProvider` is the only thing the app knows about model vendors:

```ts
interface VideoProvider {
  isConfigured(): boolean
  supports(request): boolean
  estimateCostUsdMicro(request): number
  modelFor(request): string
  generate(request): Promise<GenerateResult>
  status(providerJobId): Promise<ProviderStatus>
  cancel(providerJobId): Promise<void>
}
```

No vendor SDK type escapes `src/lib/providers/`. The router picks by
capability, health and cost, and fails over on transient errors. Providers that
fail repeatedly are taken out of rotation on a backoff, then let back in.

`VoiceProvider` is a deliberately separate interface in the same directory: the
best text-to-video vendor and the best Indian-language TTS vendor are rarely the
same company. `PaymentProvider` in `src/lib/payments/` follows the same shape,
so Stripe drops in beside Razorpay when there is a reason to.

Adding a vendor is one file plus one line in the registry.

### Credits

Append-only ledger with a cached balance, maintained in the same transaction:

```
reserve   credits -= n, creditsHeld += n, ledger(-n, GENERATION_HOLD)
settle    creditsHeld -= n                (the hold was the spend)
release   credits += n, creditsHeld -= n, ledger(+n, GENERATION_REFUND)
```

`SUM(ledger.delta) == user.credits`, always. Charging at reserve time is
deliberate — otherwise one account queues fifty jobs against a balance covering
one. Reservation uses a guarded `updateMany` (`credits >= amount`), so two
concurrent submissions cannot both spend the last credit.

Failed and cancelled renders are refunded automatically. Nobody pays for a
video they did not receive.

**Refunding money and refunding credits are one operation.** Issuing a refund
from the Razorpay dashboard returns the money and leaves the credits sitting in
the account, spendable — a free-renders bug wearing a customer-service hat. So
`refundTransaction` claims the transaction, claws back credits in proportion to
the amount being returned, and only then calls the provider. The balance floors
at zero: somebody who spent their credits and then asked for a refund is a
conversation about whether to refund at all, not a debt to collect.

### Invoices

A `transaction` row records that money moved; it is not a tax invoice. India
requires supplier GSTIN, SAC code, place of supply, the tax split, and a
**gapless** sequential number per financial year. Prices are GST-inclusive at
checkout, because someone who sees ₹499 should pay ₹499 — so the tax is backed
out of the total rather than added to it. Numbers are allocated at fulfilment
under a serializable transaction, because "next in a gapless sequence" is
exactly the read that cannot tolerate a concurrent one.

### What Arka will not generate

`src/lib/moderation.ts`, enforced in `projects.create` before anything is
reserved. The vendor's safety checker handles nudity and gore; it does not
handle the two things specific to this product — a likeness of a real person,
and a religious figure depicted degradingly. Both rules match *combinations*,
never topics: "Shiva" is the product working, "Shiva" beside a slur is not. The
filter is a floor and is documented as one; `/acceptable-use`, the audit log and
the admin takedown are what handle everyone it does not stop.

Those rules are word lists, and they only read English and romanised names.
Arka takes requests in twelve languages and speaks the narration aloud, with no
safety negatives or output classifier on the audio — so a script in Tamil or
Devanagari used to reach the voice model unread. `src/lib/moderation-ai.ts`
adds a second reader, OpenAI's moderation model, when `OPENAI_API_KEY` is set.
It refuses only sexual content and threats against a group, sends threats and
graphic violence to the review queue, and ignores plain violence, because the
canon is Kurukshetra. It fails open: an outage there must not stop every render.

### Guard rails

- **Daily spend cap** — provider spend is charged against a per-UTC-day counter
  *before* dispatch, with a conditional `ON CONFLICT ... WHERE` so concurrent
  workers cannot both slip past the last cent. Past the cap, jobs defer to
  tomorrow rather than fail. Default $30/day, editable in Admin → Settings.
- **Render cache** — identical parameters reuse the stored render. Zero
  provider cost, recorded as a cache hit so the saving is visible. Scoped to the
  user: a global cache is strictly cheaper and was the wrong trade, because with
  a fixed style catalogue and short prompts two customers typing the same thing
  is not a corner case, and both would have received — and posted — the
  byte-identical clip.
- **Rate limits** — per-user, in Postgres, on every endpoint that costs
  something. Better Auth covers its own routes and nothing else; the expensive
  surface is elsewhere. The status poll matters most, because it runs a queue
  tick, so an unthrottled loop is not just reads but worker load for the whole
  system. Ticks are throttled globally for the same reason.
- **Retention** — a nightly pass that deletes previews superseded by a full
  render, objects a failed delete left behind, idle cache rows and old logs.
  Without it `costs.overheadPerMinuteUsdMicro` is a number typed into a form
  with no process behind it.
- **Preview-first** — every generation renders cheap and small. Full quality is
  a separate, explicit, more expensive step. Nobody pays full rate to discover
  their prompt was wrong.
- **Per-plan concurrency** — one account cannot occupy the whole queue.
- **Signup grant** — 40 credits, about four clips. Bounded, so a wave of
  throwaway accounts cannot run up an unbounded bill.

### The metric

Admin → Overview leads with **gross profit per generated minute**: revenue,
minus payment fees, minus provider cost, minus amortised storage and bandwidth,
divided by minutes of finished video. If that is positive, growth is safe. If it
is not, growth is just a faster way to run out of money.

### Complaints

`/grievance` is the complaint route the IT Rules 2021 require, as a form rather
than only an address, and it works signed out: the person with a complaint about
a video has usually never heard of Arka. Every complaint gets a reference and a
deadline set by its category (`src/lib/grievance-catalog.ts`) — 24 hours for a
likeness, a deepfake or sexual content, 72 for other takedown requests, 15 days
for everything else, each at or inside the legal limit. Confirm them with
counsel before launch.

The row is the record; mail is only notification. The complainant's
acknowledgement is recorded only when the mail provider accepted it, and
`alerts.ts` mails the admins about anything unacknowledged after 12 hours, due
within 12, or overdue. Admin → Grievances closes each one with a written reason
that is sent to the complainant.

### Knowing when it breaks

`alerts.ts` watches for a stalled queue, a provider refusing everything, a
budget that quietly stopped all work, and — since `instrumentation.ts` routes
every uncaught server error into `system_log` — a spike of errors nobody wrote a
check for.

It has one blind spot it cannot close from the inside: it runs on this app's own
cron, so a dead deployment sends no alert, and that silence looks exactly like
health. `/api/health` exists for an external monitor to poll, and preflight
fails in production until `EXTERNAL_MONITOR_URL` says one is pointed at it. Same
for `BACKUP_POLICY` — `credit_ledger` is the only record of what customers are
owed, and it cannot be rebuilt from any vendor.

Every provider call writes a `Generation` row — provider, model, credits
charged, actual USD cost, duration, resolution, latency, success, cache hit. That
table is the only reason the question can be answered at all.

### Data model

25 tables. The ones that matter:

| Table | Why it exists |
| --- | --- |
| `user` | Better Auth core + `credits`, `creditsHeld`, `planCode`, `role` |
| `project` | One generation request and its settings |
| `video` | A rendered file: storage key, dimensions, tier |
| `job` | Queue row: status, lease, attempts, reserved credits, provider handle |
| `api_key` | SHA-256 hashes only; the plaintext key exists once, in its response |
| `generation` | One provider call — **charged vs cost**, per tier. The profitability table |
| `credit_ledger` | Append-only, every credit movement |
| `transaction` / `subscription` / `plan` | Money |
| `render_cache` | Parameter hash → stored render |
| `daily_spend` | The budget guard's counter |
| `provider_health` | Failure backoff per vendor |
| `app_setting` | Runtime-tunable pricing, caps and kill switches |
| `api_rate_limit` | Per-user request counters. Ours; `rate_limit` is Better Auth's |
| `grievance` | A complaint, its deadline, and what was decided |
| `audit_log` / `system_log` / `feedback` | Ops |

### API

Every route returns the same envelope, so the client has one shape to parse:

```json
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": { "code": "INSUFFICIENT_CREDITS", "message": "…" } }
```

`handler()` wraps each route: `AppError`s pass through with a stable code, and
anything else is logged and reported as a generic 500 — no stack trace or vendor
response ever reaches a client.

| Route | |
| --- | --- |
| `POST /api/projects` | Create + queue a generation |
| `GET /api/projects` | List, cursor-paginated |
| `GET /api/projects/[id]/status` | Progress poll (also nudges the queue) |
| `POST /api/projects/[id]/final` | Queue the full-quality render |
| `POST /api/projects/[id]/cancel` | Cancel and refund |
| `GET /api/projects/[id]/download` | Redirect to a signed download URL |
| `POST /api/estimate` | Price a render before committing |
| `POST /api/billing/checkout` | Razorpay order or subscription |
| `POST /api/webhooks/razorpay` | Fulfilment — idempotent, signature-verified |
| `GET /api/billing/invoices/[id]` | The customer's own GST invoice |
| `POST /api/admin/refunds` | Return money and claw back credits, together |
| `GET /api/health` | For an external monitor. Unauthenticated, deliberately dull |
| `POST /api/grievances` | File a complaint. Unauthenticated, limited by IP |
| `POST /api/admin/grievances/[id]` | Acknowledge, resolve or dismiss a complaint |
| `GET /api/cron/worker` | Scheduled queue tick |
| `GET /api/cron/retention` | Nightly storage and log housekeeping |
| `POST /api/admin/users/[id]` | Ban / unban / adjust credits |
| `PATCH /api/admin/settings` | Live configuration |

Plus a public API for Studio-plan keys, authenticated with
`Authorization: Bearer arka_sk_…` — `POST /api/v1/videos`, `GET /api/v1/videos`,
`GET|DELETE /api/v1/videos/[id]`. It runs through the same service layer as the
dashboard, so credits, plan limits, concurrency caps and the budget guard all
apply identically; there is no second code path with different rules.

---

## Deploying

1. **Database** — Neon, Supabase or Railway. Set `DATABASE_URL`.
2. **Storage** — a Cloudflare R2 bucket. Set the four `R2_*` variables. R2 is
   the right choice here specifically because egress is free, and this product
   is people downloading video. Without them, the local filesystem driver is
   used, which will not survive a serverless deploy.
3. **Provider** — set `FAL_KEY` and `VIDEO_PROVIDERS="fal,mock"`. Verify the
   model endpoint ids in `src/lib/providers/fal.ts` against fal's current
   catalog; vendors rename and retire endpoints.
4. **Payments** — Razorpay keys, plus `NEXT_PUBLIC_RAZORPAY_KEY_ID`. Point a
   webhook at `/api/webhooks/razorpay` for `payment.captured`,
   `payment.failed`, `subscription.charged`, `subscription.cancelled`. To sell
   subscriptions, create plans in the Razorpay dashboard and put each id in the
   `plan.providerPlanId` column — tiers without one show "Coming soon" rather
   than opening a checkout that would fail.
5. **Email** — a Resend API key and a verified `EMAIL_FROM`. Without it,
   password-reset links are printed to the server log instead of sent, which is
   right for local development and very wrong in production.
6. **Secrets** — a real `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and
   `CRON_SECRET`.
7. **Deploy to Vercel.** `vercel.json` registers the cron ticks. Run
   `npx prisma migrate deploy && npx tsx prisma/seed.ts` once against production.
   `ffmpeg-static` ships a ~80 MB binary that must be traced into the function
   bundle — check it survives your first deploy. Without it every render ships
   smooth rather than held on twos, and narration stops being muxed in. The
   narration half now refunds itself and logs loudly; the cadence half cannot,
   because there is no way to tell from the output that it was skipped.
8. **Function timeouts.** Every route that carries a queue tick declares
   `maxDuration = 60`. If your plan allows more and you want longer renders in
   one tick, raise `WORKER_TICK_BUDGET_MS` to match — the worker stops on its
   own clock, so raising `maxDuration` alone buys nothing.

9. **Content screening** — optional but recommended before selling in Indian
   languages: set `OPENAI_API_KEY` so request text in any script is screened.
   Without it, only the English word lists run.

### Before taking real money

- Fill in every highlighted placeholder in `/terms`, `/privacy`, `/refunds` and
  `/contact`, and have a lawyer read them. Razorpay will not activate a live
  account without reachable versions of all four.
- True up the cost estimates in `src/lib/providers/fal.ts` against a real
  invoice. They drive the budget guard, so they should over-estimate rather than
  under-estimate until you have real numbers.
- Set `fx.inrPerUsd`, `costs.paymentFeePercent` and
  `costs.overheadPerMinuteUsdMicro` in Admin → Settings to your actual figures,
  or the margin dashboard is fiction.

---

## Deliberate omissions

No social feed, comments, likes, AI chat, marketplace or mobile app. No
unlimited plan — every render costs real money, and a tier that pretends
otherwise either loses money on power users or hides a fair-use clause. Credits
are the honest version of the same thing.
