-- ══════════════════════════════════════════════════════════════════════════
-- LAUNCH MIGRATION — safe to run standalone against the deployed database.
-- Adds: shared rate limiting, grievance/contact intake, signup attribution.
-- Idempotent: every statement is guarded, so re-running is harmless.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Shared rate limiting ───────────────────────────────────────────────
-- The in-memory limiter in lib/security.ts is per-lambda: every cold start
-- gets a fresh, empty window, so under load the effective limit is the
-- configured limit multiplied by however many instances Vercel happens to be
-- running. This table gives the limiter one shared counter instead.
create table if not exists public.rate_limits (
  bucket     text        not null,
  identity   text        not null,
  count      integer     not null default 0,
  reset_at   timestamptz not null,
  primary key (bucket, identity)
);

create index if not exists rate_limits_reset_at_idx on public.rate_limits (reset_at);

alter table public.rate_limits enable row level security;

drop policy if exists "service: all rate limits" on public.rate_limits;
create policy "service: all rate limits" on public.rate_limits
  to service_role using (true) with check (true);

-- Atomic consume-one-token. The whole read-modify-write happens inside a
-- single statement so concurrent requests can't both see the same count.
create or replace function public.consume_rate_limit(
  p_bucket         text,
  p_identity       text,
  p_max            integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now   timestamptz := now();
  v_count integer;
  v_reset timestamptz;
begin
  insert into public.rate_limits (bucket, identity, count, reset_at)
  values (p_bucket, p_identity, 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (bucket, identity) do update
    set count = case
                  when rate_limits.reset_at <= v_now then 1
                  else rate_limits.count + 1
                end,
        reset_at = case
                     when rate_limits.reset_at <= v_now
                       then v_now + make_interval(secs => p_window_seconds)
                     else rate_limits.reset_at
                   end
  returning rate_limits.count, rate_limits.reset_at into v_count, v_reset;

  -- Opportunistic cleanup — roughly 1 call in 100 sweeps expired rows, which
  -- keeps the table small without needing a scheduled job.
  if random() < 0.01 then
    delete from public.rate_limits where reset_at < v_now - interval '1 day';
  end if;

  return query select
    v_count <= p_max,
    greatest(p_max - v_count, 0),
    case when v_count <= p_max then 0
         else ceil(extract(epoch from (v_reset - v_now)))::integer
    end;
end;
$$;

-- ── 2. Grievances / contact intake ────────────────────────────────────────
-- Distinct from public.reports, which is user-to-user abuse reporting and
-- requires two authenticated accounts. This one accepts messages from anyone,
-- signed in or not — which is what a grievance channel and a deletion request
-- route both need.
create table if not exists public.grievances (
  id          uuid primary key default gen_random_uuid(),
  category    text not null,
  name        text,
  email       text not null,
  message     text not null,
  user_id     uuid references public.users(id) on delete set null,
  ip_hash     text,                       -- hashed, never the raw address
  status      text not null default 'open',
  created_at  timestamptz default now()
);

create index if not exists grievances_created_at_idx on public.grievances (created_at desc);
create index if not exists grievances_status_idx on public.grievances (status);

alter table public.grievances enable row level security;

drop policy if exists "service: all grievances" on public.grievances;
create policy "service: all grievances" on public.grievances
  to service_role using (true) with check (true);

-- ── 3. Signup attribution ─────────────────────────────────────────────────
-- First-touch only, and first-party only: UTM tags we put on our own links
-- plus the referring host. No third-party pixel, nothing that would conflict
-- with the "we don't share your profile with third parties" line in the terms.
alter table public.users
  add column if not exists signup_source   text,
  add column if not exists signup_medium   text,
  add column if not exists signup_campaign text,
  add column if not exists signup_referrer text,
  add column if not exists signup_landing  text;

create index if not exists users_signup_source_idx on public.users (signup_source);
