-- ══════════════════════════════════════════════════════════
-- MAYATARA · THE PULSE v4 — discussion threads on each headline.
-- Paste into Supabase SQL Editor and run. Additive only.
-- Same pattern as event_reports (supabase-schema-events-v4.sql):
-- RLS enabled, zero policies, service-role (supabaseAdmin) only.
-- ══════════════════════════════════════════════════════════

-- Anonymous, no-login comment threads on individual live headlines.
-- author_name is free text, optional — there is no account behind it,
-- so it's a display label only, never treated as an identity. hidden
-- flips to true once 2 distinct commenter/reporter hashes report the
-- same comment, mirroring the events auto-unpublish threshold — the
-- one moderation backstop that matters given Pulse's explicit
-- apolitical positioning and open (no-login) commenting.
create table public.pulse_comments (
  id             uuid primary key default gen_random_uuid(),
  headline_id    uuid references public.pulse_headlines(id) on delete cascade not null,
  author_name    text,
  body           text not null,
  commenter_hash text not null, -- sha256 of commenter IP, never the raw IP
  hidden         boolean not null default false,
  created_at     timestamptz default now()
);

create index on public.pulse_comments (headline_id, created_at);

create table public.pulse_comment_reports (
  id             uuid primary key default gen_random_uuid(),
  comment_id     uuid references public.pulse_comments(id) on delete cascade not null,
  reporter_hash  text not null,
  created_at     timestamptz default now(),
  unique(comment_id, reporter_hash)
);

alter table public.pulse_comments enable row level security;
alter table public.pulse_comment_reports enable row level security;
-- Intentionally no policies — service role only.
