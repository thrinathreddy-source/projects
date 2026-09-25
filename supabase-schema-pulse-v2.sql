-- ══════════════════════════════════════════════════════════
-- MAYATARA · THE PULSE v2 — real news + real government figures.
-- Paste into Supabase SQL Editor and run. Additive only —
-- does not touch anything from supabase-schema-pulse.sql.
-- Same pattern: RLS enabled, zero policies, service-role only.
-- ══════════════════════════════════════════════════════════

-- Real headlines, pulled daily from the Government of India's own
-- official PIB press-release feed. No AI involved — plain keyword
-- classification. See lib/pulseFeed.ts.
create table public.pulse_headlines (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  url           text unique not null,
  category      text not null,
  source        text not null default 'Press Information Bureau, Govt. of India',
  fetched_at    timestamptz default now()
);

create index on public.pulse_headlines (fetched_at desc);
create index on public.pulse_headlines (category);

-- Real numeric figures, pulled from data.gov.in's official API once a
-- free API key is configured (DATA_GOV_IN_API_KEY). Never fabricated —
-- stays empty until a real, sourced figure is fetched. See lib/govStats.ts.
create table public.pulse_datapoints (
  id            uuid primary key default gen_random_uuid(),
  category      text not null,
  label         text not null,
  value         text not null,
  unit          text not null default '',
  as_of         text not null,
  source_name   text not null,
  source_url    text not null,
  fetched_at    timestamptz default now(),
  unique(category, label)
);

alter table public.pulse_headlines  enable row level security;
alter table public.pulse_datapoints enable row level security;
-- Intentionally no policies — service role only.
