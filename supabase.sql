-- Ironlog database setup for Supabase.
-- Paste this whole file into the Supabase SQL Editor (SQL Editor -> New query)
-- and click "Run". It creates the three tables the app needs and locks each
-- row to its owner with Row Level Security, so every person's data stays
-- private even though everyone shares the same Supabase project.

create extension if not exists "pgcrypto";

-- ---------- exercises ----------
create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category text not null default 'strength' check (category in ('strength', 'mobility')),
  video_url text default '',
  notes text default '',
  unit text not null default 'kg',
  last_weight numeric,
  last_reps integer,
  last_date date,
  last_sets jsonb,
  created_at timestamptz not null default now()
);

-- ---------- routines ----------
create table if not exists routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category text not null default 'strength' check (category in ('strength', 'mobility')),
  exercises jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- ---------- sessions ----------
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  routine_id uuid,
  routine_name text not null default 'Freestyle',
  category text not null default 'strength' check (category in ('strength', 'mobility')),
  date date not null,
  notes text default '',
  entries jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- ---------- row level security: each user only ever sees their own rows ----------
alter table exercises enable row level security;
alter table routines enable row level security;
alter table sessions enable row level security;

create policy "own exercises" on exercises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own routines" on routines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own sessions" on sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
