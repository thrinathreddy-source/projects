-- ══════════════════════════════════════════════════════════
-- MAYATARA · THE PULSE — Paste into Supabase SQL Editor and run.
-- Additive only. Same pattern as supabase-schema-events.sql:
-- RLS enabled, zero policies, service-role (supabaseAdmin) only.
-- ══════════════════════════════════════════════════════════

create table public.newsletter_subscribers (
  id          uuid primary key default gen_random_uuid(),
  email       text unique not null,
  created_at  timestamptz default now()
);

alter table public.newsletter_subscribers enable row level security;
-- Intentionally no policies — service role only.
