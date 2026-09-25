-- ══════════════════════════════════════════════════════════
-- MAYATARA · EVENTS v2 — capacity, waitlist, cancellation.
-- Paste into Supabase SQL Editor and run. Additive only —
-- does not touch existing events/event_rsvps rows or columns.
-- ══════════════════════════════════════════════════════════

alter table public.events
  add column if not exists capacity     integer,
  add column if not exists is_cancelled boolean not null default false;

alter table public.event_rsvps
  add column if not exists waitlisted boolean not null default false;
