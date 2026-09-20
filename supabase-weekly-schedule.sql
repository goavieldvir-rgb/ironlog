-- Weekly recurring training schedule — "what routine is on which day" as
-- a standing pattern (Sunday is always Pull Day, etc.) rather than a
-- per-calendar-week thing. A day with no row, or a row with routine_id
-- set to null, both mean "rest day" — the app treats these identically,
-- so there's never an ambiguous blank slot.
--
-- day_of_week: 0 = Sunday ... 6 = Saturday.

create table if not exists weekly_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  routine_id uuid references routines(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (user_id, day_of_week)
);

alter table weekly_schedule enable row level security;

-- Same "own data, or admin can see/manage everyone's" pattern already
-- used throughout the rest of the app (routines, sessions, exercises).
drop policy if exists "own or admin can read schedule" on weekly_schedule;
create policy "own or admin can read schedule" on weekly_schedule
  for select using (auth.uid() = user_id or is_admin());

drop policy if exists "own or admin can insert schedule" on weekly_schedule;
create policy "own or admin can insert schedule" on weekly_schedule
  for insert with check (auth.uid() = user_id or is_admin());

drop policy if exists "own or admin can update schedule" on weekly_schedule;
create policy "own or admin can update schedule" on weekly_schedule
  for update using (auth.uid() = user_id or is_admin());

drop policy if exists "own or admin can delete schedule" on weekly_schedule;
create policy "own or admin can delete schedule" on weekly_schedule
  for delete using (auth.uid() = user_id or is_admin());

-- Per-person choice of which Dashboard style to show — 'cards' (the
-- original three stat boxes) or 'schedule' (the new weekly view).
-- Defaults to 'cards' so nobody's Dashboard changes until they actually
-- choose to switch.
alter table profiles add column if not exists dashboard_style text not null default 'cards';
