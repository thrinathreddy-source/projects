-- ══════════════════════════════════════════════════════════
-- MAYATARA · THE PULSE v5 — country, so Pulse (and the OppIDX
-- opportunity-card policy-reads edge) can cover more than India.
-- Paste into Supabase SQL Editor and run. Additive only.
-- ══════════════════════════════════════════════════════════

-- ISO country code ('IN', 'US', ...) — see lib/mayatara/pulseFeed.ts's
-- SUPPORTED_COUNTRIES / COUNTRY_SOURCES for what's actually ingested.
-- Defaults to 'IN' so every existing row (all India, pre-dating this
-- column) stays correctly tagged without a backfill.
alter table public.pulse_headlines
  add column if not exists country text not null default 'IN';

create index if not exists pulse_headlines_country_idx on public.pulse_headlines (country);
