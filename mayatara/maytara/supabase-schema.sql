-- ══════════════════════════════════════════════════════════
-- MAYATARA — Paste this entire file into Supabase SQL Editor
-- Dashboard → SQL Editor → New query → paste → Run
-- ══════════════════════════════════════════════════════════

-- 1. Extensions
create extension if not exists vector;

-- 2. Users (supplements Supabase auth.users)
create table public.users (
  id               uuid primary key references auth.users(id) on delete cascade,
  name             text not null,
  phone_encrypted  text not null,
  looking_for      text not null,
  created_at       timestamptz default now()
);

-- 3. Profiles — AI-generated profile + vector embedding
create table public.profiles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.users(id) on delete cascade unique,
  looking_for       text not null,
  profile_json      jsonb not null,
  embedding         vector(1536),
  contact_encrypted text not null,
  contact_type      text not null default 'phone',
  is_active         boolean default true,
  matched           boolean default false,
  created_at        timestamptz default now()
);

-- 4. Matches — confirmed pairs
create table public.matches (
  id          uuid primary key default gen_random_uuid(),
  profile_a   uuid references public.profiles(id) not null,
  profile_b   uuid references public.profiles(id) not null,
  score       float not null,
  match_reason text,
  notified_a  boolean default false,
  notified_b  boolean default false,
  created_at  timestamptz default now(),
  unique(profile_a, profile_b)
);

-- 5. Notifications — match alerts + no-match alerts (replaces SMS)
create table public.notifications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete cascade,
  type             text not null,
  title            text not null,
  body             text not null,
  contact_revealed text,
  contact_type     text,
  match_name       text,
  matched_user_id  uuid references public.users(id) on delete set null,
  read             boolean default false,
  created_at       timestamptz default now()
);

-- 6. Feedback — match quality signal
create table public.feedback (
  id               uuid primary key default gen_random_uuid(),
  notification_id  uuid references public.notifications(id),
  liked            boolean not null,
  created_at       timestamptz default now()
);

-- 7. Reports — matched users reporting each other (consent/safety violations)
create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid references public.users(id) on delete cascade not null,
  reported_id      uuid references public.users(id) on delete cascade not null,
  reported_name    text not null,
  notification_id  uuid references public.notifications(id) on delete set null,
  reason           text,
  status           text not null default 'pending',
  created_at       timestamptz default now()
);

-- ── Indexes ──────────────────────────────────────────────
-- HNSW index (works on empty tables, unlike ivfflat)
create index on public.profiles using hnsw (embedding vector_cosine_ops);
create index on public.profiles (looking_for, is_active, matched);

-- ── Row Level Security ────────────────────────────────────
alter table public.users         enable row level security;
alter table public.profiles      enable row level security;
alter table public.matches       enable row level security;
alter table public.notifications enable row level security;
alter table public.feedback      enable row level security;
alter table public.reports       enable row level security;

-- Users
create policy "users: own row" on public.users
  using (id = auth.uid()) with check (id = auth.uid());
create policy "service: all users" on public.users
  to service_role using (true) with check (true);

-- Profiles
create policy "profiles: own row" on public.profiles
  using (user_id = auth.uid());
create policy "service: all profiles" on public.profiles
  to service_role using (true) with check (true);

-- Matches
create policy "matches: own rows" on public.matches
  using (
    profile_a in (select id from public.profiles where user_id = auth.uid())
    or
    profile_b in (select id from public.profiles where user_id = auth.uid())
  );
create policy "service: all matches" on public.matches
  to service_role using (true) with check (true);

-- Notifications
create policy "notifications: own rows" on public.notifications
  using (user_id = auth.uid());
create policy "service: all notifications" on public.notifications
  to service_role using (true) with check (true);

-- Feedback
create policy "service: all feedback" on public.feedback
  to service_role using (true) with check (true);

-- Reports — a user can see reports they filed, never reports filed against them
create policy "reports: own filed reports" on public.reports
  for select using (reporter_id = auth.uid());
create policy "service: all reports" on public.reports
  to service_role using (true) with check (true);

-- ── Vector search function ────────────────────────────────
create or replace function match_profiles(
  query_embedding    vector(1536),
  looking_for_filter text,
  exclude_user_id    uuid,
  match_count        int default 1
)
returns table (
  id                uuid,
  user_id           uuid,
  profile_json      jsonb,
  contact_encrypted text,
  contact_type      text,
  similarity        float
)
language sql stable
as $$
  select
    p.id,
    p.user_id,
    p.profile_json,
    p.contact_encrypted,
    p.contact_type,
    1 - (p.embedding <=> query_embedding) as similarity
  from public.profiles p
  where
    p.looking_for  = looking_for_filter
    and p.is_active  = true
    and p.matched    = false
    and p.user_id   != exclude_user_id
    and p.embedding is not null
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

-- ══════════════════════════════════════════════════════════
-- MIGRATION — safe to run standalone against an already-deployed
-- database (adds abuse reporting). Skip if running the full file above.
-- ══════════════════════════════════════════════════════════

alter table public.notifications
  add column if not exists matched_user_id uuid references public.users(id) on delete set null;

create table if not exists public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid references public.users(id) on delete cascade not null,
  reported_id      uuid references public.users(id) on delete cascade not null,
  reported_name    text not null,
  notification_id  uuid references public.notifications(id) on delete set null,
  reason           text,
  status           text not null default 'pending',
  created_at       timestamptz default now()
);

alter table public.reports enable row level security;

drop policy if exists "reports: own filed reports" on public.reports;
create policy "reports: own filed reports" on public.reports
  for select using (reporter_id = auth.uid());

drop policy if exists "service: all reports" on public.reports;
create policy "service: all reports" on public.reports
  to service_role using (true) with check (true);
