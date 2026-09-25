-- ══════════════════════════════════════════════════════════
-- MAYATARA · THE PULSE v3 — source_type (government vs newspaper).
-- Paste into Supabase SQL Editor and run. Additive only.
-- ══════════════════════════════════════════════════════════

alter table public.pulse_headlines
  add column if not exists source_type text not null default 'government';

create index if not exists pulse_headlines_source_type_idx on public.pulse_headlines (source_type);
