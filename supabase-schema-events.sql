-- ══════════════════════════════════════════════════════════
-- MAYATARA · EVENTS — Paste into Supabase SQL Editor and run.
-- Additive only — does not touch users/profiles/matches/etc.
-- No RLS policies are defined on purpose: these tables are only
-- ever read/written through server API routes using the service-
-- role client (supabaseAdmin), which bypasses RLS. With RLS
-- enabled and zero policies, the anon/public key gets zero access —
-- host contact info and manage tokens can never leak client-side.
-- ══════════════════════════════════════════════════════════

create table public.events (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  title         text not null,
  description   text not null,
  category      text not null default 'Gathering',
  location      text not null,
  event_time    timestamptz not null,
  host_name     text not null,
  host_contact_encrypted text not null,
  manage_token  text not null,
  is_published  boolean default true,
  created_at    timestamptz default now()
);

create table public.event_rsvps (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid references public.events(id) on delete cascade not null,
  name             text not null,
  contact_encrypted text not null,
  checkin_code     text unique not null,
  checked_in       boolean default false,
  checked_in_at    timestamptz,
  created_at       timestamptz default now()
);

create index on public.events (event_time) where is_published = true;
create index on public.events (slug);
create index on public.event_rsvps (event_id);
create index on public.event_rsvps (checkin_code);

alter table public.events      enable row level security;
alter table public.event_rsvps enable row level security;
-- Intentionally no policies — service role only. See note above.
