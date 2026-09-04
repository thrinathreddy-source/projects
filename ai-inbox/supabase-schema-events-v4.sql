-- ══════════════════════════════════════════════════════════
-- MAYATARA · EVENTS v4 — reporting (safety backstop for unlawful
-- or unsafe events). Mirrors the existing Mayatara match-report
-- pattern: 2 distinct reporters auto-unpublishes the event pending
-- review, rather than one person being able to take it down solo.
-- Paste into Supabase SQL Editor and run. Additive only.
-- ══════════════════════════════════════════════════════════

create table public.event_reports (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid references public.events(id) on delete cascade not null,
  reporter_hash  text not null, -- sha256 of reporter IP, never the raw IP
  reason         text,
  created_at     timestamptz default now(),
  unique(event_id, reporter_hash)
);

alter table public.event_reports enable row level security;
-- Intentionally no policies — service role only.
