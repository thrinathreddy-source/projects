-- ══════════════════════════════════════════════════════════
-- MAYATARA · EVENTS v3 — private-by-default, matching real Doorlist/
-- Partiful behavior (confirmed: their events are private/unlisted by
-- default, accessible by link/invite only, not a public directory).
-- Paste into Supabase SQL Editor and run. Additive only.
-- ══════════════════════════════════════════════════════════

alter table public.events
  add column if not exists is_listed boolean not null default false;
