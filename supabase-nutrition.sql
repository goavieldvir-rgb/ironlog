-- Nutrition beta: food diary tables.
-- Run once in the Supabase SQL Editor. Safe to re-run. supabase/schema.sql
-- carries the same tables, policies and functions.
--
-- Visibility: only admins can use nutrition until a trainee's
-- profiles.nutrition_enabled is switched on (by an admin). Every table below
-- enforces that in RLS, not only the UI.

create extension if not exists pg_trgm;

-- Per-trainee switch. Clients cannot change it themselves (trigger below).
alter table profiles add column if not exists nutrition_enabled boolean not null default false;

create or replace function protect_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only requests that come through the app's public API (signed in or not)
  -- are checked. The SQL Editor and server-side jobs have no such role.
  if coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_admin := false;
    new.nutrition_enabled := false;
  elsif not public.is_admin() then
    if new.is_admin is distinct from old.is_admin then
      raise exception 'ADMIN_FLAG_PROTECTED';
    end if;
    if new.nutrition_enabled is distinct from old.nutrition_enabled then
      raise exception 'NUTRITION_FLAG_PROTECTED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_admin_flag_trg on profiles;
create trigger protect_admin_flag_trg
  before insert or update on profiles
  for each row execute function protect_admin_flag();

-- "May the current user use nutrition?" for policies.
create or replace function nutrition_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin or nutrition_enabled from profiles where id = auth.uid()), false);
$$;

-- New security definer functions are callable by anyone by default.
revoke all on function nutrition_allowed() from public, anon;
grant execute on function nutrition_allowed() to authenticated;

-- Foods: one shared table that learns. Values are per 100 g (or 100 ml).
--   source 'moh'   Ministry of Health (Tzameret) generic foods, imported
--   source 'off'   Open Food Facts product, cached on first scan (ODbL: keep tagged)
--   source 'user'  typed from a label by a trainee, private until verified
--   source 'coach' entered by the coach
create table if not exists foods (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('moh', 'off', 'user', 'coach')),
  source_ref text,                -- Tzameret code or OFF barcode
  barcode text check (barcode ~ '^[0-9]{8,14}$'),
  name_he text,
  name_en text,
  brand text,
  kcal numeric not null check (kcal >= 0 and kcal <= 900),
  protein numeric not null default 0 check (protein >= 0 and protein <= 100),
  carbs numeric not null default 0 check (carbs >= 0 and carbs <= 100),
  fat numeric not null default 0 check (fat >= 0 and fat <= 100),
  fiber numeric check (fiber >= 0 and fiber <= 100),
  -- household units, e.g. [{"he":"פרוסה בינונית","en":"medium slice","g":34}]
  units jsonb not null default '[]'::jsonb,
  search_text text not null default '', -- normalised he+en+brand, filled by the app
  verified boolean not null default false,
  label_photo_path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (coalesce(name_he, name_en) is not null)
);

create unique index if not exists foods_source_ref_uniq on foods (source, source_ref) where source_ref is not null;
create index if not exists foods_barcode_idx on foods (barcode) where barcode is not null;
create index if not exists foods_search_trgm on foods using gin (search_text gin_trgm_ops);

alter table foods enable row level security;

drop policy if exists "foods readable" on foods;
create policy "foods readable" on foods for select to authenticated using (
  nutrition_allowed() and (verified or source in ('moh', 'off') or created_by = auth.uid() or is_admin())
);

-- A trainee may only add a label they typed (private until verified). Only
-- the coach adds shared rows: the OFF cache, coach and moh foods. A trainee's
-- scan still works when its OFF cache insert is refused; the log just has no
-- food_id. This stops a trainee planting fake macros under a real barcode.
drop policy if exists "foods insert" on foods;
create policy "foods insert" on foods for insert to authenticated with check (
  nutrition_allowed() and created_by = auth.uid()
  and (is_admin() or (source = 'user' and not verified))
);

drop policy if exists "foods update" on foods;
create policy "foods update" on foods for update to authenticated
  using (is_admin() or (created_by = auth.uid() and not verified and source = 'user'))
  with check (is_admin() or (created_by = auth.uid() and not verified and source = 'user'));

drop policy if exists "foods delete" on foods;
create policy "foods delete" on foods for delete to authenticated
  using (is_admin() or (created_by = auth.uid() and not verified and source = 'user'));

-- Diary entries. Name and macros are copied in at log time so later edits to
-- a food never rewrite history. food_id is null for quick adds.
create table if not exists food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_id uuid references foods(id) on delete set null,
  name text not null,
  grams numeric check (grams > 0),
  unit_label text,               -- e.g. "פרוסה בינונית"
  unit_qty numeric,              -- e.g. 2
  kcal numeric not null check (kcal >= 0),
  protein numeric not null default 0 check (protein >= 0),
  carbs numeric not null default 0 check (carbs >= 0),
  fat numeric not null default 0 check (fat >= 0),
  created_at timestamptz not null default now()
);

create index if not exists food_logs_user_date on food_logs (user_id, date);

alter table food_logs enable row level security;

drop policy if exists "own food logs or admin" on food_logs;
create policy "own food logs or admin" on food_logs for all to authenticated
  using ((auth.uid() = user_id and nutrition_allowed()) or is_admin())
  with check ((auth.uid() = user_id and nutrition_allowed()) or is_admin());

-- Saved meals: items is a list of {food_id, name, grams, unit_label, unit_qty, kcal, protein, carbs, fat}.
create table if not exists saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table saved_meals enable row level security;

drop policy if exists "own saved meals or admin" on saved_meals;
create policy "own saved meals or admin" on saved_meals for all to authenticated
  using ((auth.uid() = user_id and nutrition_allowed()) or is_admin())
  with check ((auth.uid() = user_id and nutrition_allowed()) or is_admin());

-- Daily targets, set by the coach from the trainee's plan.
create table if not exists nutrition_targets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kcal integer check (kcal > 0),
  protein numeric(6,1) check (protein >= 0),
  carbs numeric(6,1) check (carbs >= 0),
  fat numeric(6,1) check (fat >= 0),
  updated_at timestamptz not null default now()
);

alter table nutrition_targets enable row level security;

drop policy if exists "read own targets or admin" on nutrition_targets;
create policy "read own targets or admin" on nutrition_targets for select to authenticated
  using ((auth.uid() = user_id and nutrition_allowed()) or is_admin());

drop policy if exists "admin writes targets" on nutrition_targets;
create policy "admin writes targets" on nutrition_targets for all to authenticated
  using (is_admin()) with check (is_admin());

-- Account deletion also removes nutrition data and the trainee's unverified
-- label entries. Shared rows (verified, Open Food Facts cache) stay; their
-- created_by is cleared by the foreign key.
create or replace function delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if exists (select 1 from profiles where id = uid and is_admin) then
    raise exception 'ADMIN_CANNOT_SELF_DELETE';
  end if;

  delete from food_logs where user_id = uid;
  delete from saved_meals where user_id = uid;
  delete from nutrition_targets where user_id = uid;
  delete from foods where created_by = uid and source = 'user' and not verified;
  delete from weekly_schedule where user_id = uid;
  delete from sessions where user_id = uid;
  delete from routines where user_id = uid;
  delete from exercises where user_id = uid;
  delete from body_weight_logs where user_id = uid;
  delete from admin_notifications where trainee_id = uid;
  update error_logs set user_id = null where user_id = uid;
  delete from profiles where id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
