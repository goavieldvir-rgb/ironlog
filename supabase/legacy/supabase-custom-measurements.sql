-- Ironlog: each coach chooses which body measurements their trainees log.
--
-- Run after supabase-coach-controls.sql. Safe to run more than once.
--
-- - Waist stays where it is (waist_logs), so nothing already logged moves.
--   Every other measurement goes in body_measurements: hips, chest, upper
--   arm, thigh, calf, neck, body fat, or one the coach made up.
-- - measurement_types: a coach's own measurements, named in English and/or
--   Hebrew, measured in cm/in, % or a plain number.
-- - measurement_settings: which measurements one person logs. A coach sets
--   it for their trainees; a coach can also set their own.
-- - coach_settings: one row per coach. For now it holds the measurements a
--   trainee logs until the coach chooses for them (waist when unset).
-- - measurement_setup(): what one person should log, read by the app.
--
-- Until this runs, the app keeps showing waist only, as before.

-- ---------- who is someone's coach ----------
-- A coach (or the owner) is their own coach; a trainee without one belongs
-- to the owner, as everywhere else.
create or replace function public.coach_for(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when p.is_admin or p.is_coach then p.id
              else coalesce(p.coach_id, (select o.id from public.profiles o where o.is_admin order by o.created_at limit 1))
         end
  from public.profiles p where p.id = p_user;
$$;
revoke execute on function public.coach_for(uuid) from public, anon, authenticated;

-- ---------- tables ----------
create table if not exists public.coach_settings (
  coach_id uuid primary key references public.profiles (id) on delete cascade,
  default_measurements text[] not null default '{waist}',
  updated_at timestamptz not null default now()
);

create table if not exists public.measurement_types (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  label_en text check (label_en is null or char_length(label_en) <= 40),
  label_he text check (label_he is null or char_length(label_he) <= 40),
  unit_kind text not null check (unit_kind in ('length', 'percent', 'number')),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  constraint measurement_types_named check (coalesce(btrim(label_en), '') <> '' or coalesce(btrim(label_he), '') <> '')
);
create index if not exists measurement_types_coach on public.measurement_types (coach_id);

create table if not exists public.measurement_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  kinds text[] not null default '{waist}',
  updated_at timestamptz not null default now()
);

-- Deleting the account removes the rows (cascade).
create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  kind text not null check (kind ~ '^(hips|chest|upper_arm|thigh|calf|neck|body_fat|c_[0-9a-f-]{36})$'),
  value numeric not null check (value >= 0 and value < 10000),
  unit text not null default 'cm' check (unit in ('cm', 'in', '%', '')),
  created_at timestamptz not null default now()
);
create index if not exists body_measurements_user_kind_date on public.body_measurements (user_id, kind, date desc);

-- A list of measurement keys: built-in names or c_<id> for a coach's own.
create or replace function public.valid_measurement_kinds(p_kinds text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_length(p_kinds, 1), 0) <= 30 and not exists (
    select 1 from unnest(p_kinds) k
    where k !~ '^(waist|hips|chest|upper_arm|thigh|calf|neck|body_fat|c_[0-9a-f-]{36})$');
$$;
alter table public.coach_settings drop constraint if exists coach_settings_measurements_check;
alter table public.coach_settings add constraint coach_settings_measurements_check check (public.valid_measurement_kinds(default_measurements));
alter table public.measurement_settings drop constraint if exists measurement_settings_kinds_check;
alter table public.measurement_settings add constraint measurement_settings_kinds_check check (public.valid_measurement_kinds(kinds));

-- ---------- who can do what ----------
alter table public.coach_settings enable row level security;
alter table public.measurement_types enable row level security;
alter table public.measurement_settings enable row level security;
alter table public.body_measurements enable row level security;

-- A coach's own settings and measurement names are theirs alone. Trainees
-- read what they need through measurement_setup().
drop policy if exists "own coach settings" on public.coach_settings;
create policy "own coach settings" on public.coach_settings
  for all using (coach_id = auth.uid() and public.is_coach())
  with check (coach_id = auth.uid() and public.is_coach());

drop policy if exists "own measurement types" on public.measurement_types;
create policy "own measurement types" on public.measurement_types
  for all using (coach_id = auth.uid() and public.is_coach())
  with check (coach_id = auth.uid() and public.is_coach());

-- The person can read their list; only their coach changes it (a coach
-- also sets their own).
drop policy if exists "read own or coached measurement settings" on public.measurement_settings;
create policy "read own or coached measurement settings" on public.measurement_settings
  for select using (auth.uid() = user_id or public.can_coach(user_id));
drop policy if exists "coach sets measurement settings" on public.measurement_settings;
create policy "coach sets measurement settings" on public.measurement_settings
  for all using (public.can_coach(user_id) or (auth.uid() = user_id and public.is_coach()))
  with check (public.can_coach(user_id) or (auth.uid() = user_id and public.is_coach()));

-- Like waist and body weight: the person and their coach.
drop policy if exists "own or coach measurements" on public.body_measurements;
create policy "own or coach measurements" on public.body_measurements
  for all using (auth.uid() = user_id or public.can_coach(user_id))
  with check (auth.uid() = user_id or public.can_coach(user_id));

grant select, insert, update, delete on public.coach_settings to authenticated;
grant select, insert, update, delete on public.measurement_types to authenticated;
grant select, insert, update, delete on public.measurement_settings to authenticated;
grant select, insert, update, delete on public.body_measurements to authenticated;

-- Someone removed from the app can read and delete but not add or change
-- (same two policies supabase-coach-controls.sql gives every table).
do $$
declare tb text;
begin
  foreach tb in array array['coach_settings', 'measurement_types', 'measurement_settings', 'body_measurements'] loop
    execute format('drop policy if exists "removed people cannot add" on public.%I', tb);
    execute format('drop policy if exists "removed people cannot change" on public.%I', tb);
    execute format('create policy "removed people cannot add" on public.%I as restrictive for insert to authenticated with check (not public.am_removed())', tb);
    execute format('create policy "removed people cannot change" on public.%I as restrictive for update to authenticated using (not public.am_removed()) with check (not public.am_removed())', tb);
  end loop;
end $$;

-- ---------- what one person logs ----------
-- kinds: this person's list (their own, else their coach's default, else
-- waist). own: whether the list was set for them. types: the coach's own
-- measurements, so names show for anything logged, even archived ones.
create or replace function public.measurement_setup(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c uuid;
  own_kinds text[];
  def_kinds text[];
begin
  if not (auth.uid() = p_user or public.can_coach(p_user)) then
    raise exception 'NOT_ALLOWED';
  end if;
  c := public.coach_for(p_user);
  select kinds into own_kinds from public.measurement_settings where user_id = p_user;
  select default_measurements into def_kinds from public.coach_settings where coach_id = c;
  return jsonb_build_object(
    'kinds', to_jsonb(coalesce(own_kinds, def_kinds, array['waist'])),
    'own', own_kinds is not null,
    'default_kinds', to_jsonb(coalesce(def_kinds, array['waist'])),
    'types', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'label_en', t.label_en, 'label_he', t.label_he,
                                          'unit_kind', t.unit_kind, 'archived', t.archived) order by t.created_at)
      from public.measurement_types t where t.coach_id = c), '[]'::jsonb));
end;
$$;
revoke execute on function public.measurement_setup(uuid) from public, anon;
grant execute on function public.measurement_setup(uuid) to authenticated;

notify pgrst, 'reload schema';
