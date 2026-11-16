-- Ironlog: coach tools (PR #93), all seven parts in one script.
-- Supabase -> SQL Editor -> New query -> paste all of this -> Run.
--
-- All or nothing: the whole script is one transaction. If anything fails,
-- nothing is changed and you see the error. Running it twice is harmless.
--
-- It first checks that the earlier SQL (second coach, notification wording,
-- nutrition, coach tasks) is already in the database, and stops with
-- "MISSING: ..." if not.
--
-- Changes to things the live app already uses (identical behaviour while no
-- coach has saved Coach settings): refresh_coach_tasks, send_pr_alert,
-- notify_coach_pr, the food_logs meal check (two more slots allowed),
-- new columns and a "meal slots are the coach's" trigger on nutrition_targets,
-- and a "messages switched off" rule on
-- coach_messages. supabase-coach-tools-rollback.sql puts those back.

begin;

do $$
declare
  missing text[] := '{}';
  t text;
begin
  foreach t in array array['profiles','nutrition_targets','food_logs','coach_messages','coach_tasks','push_config','waist_logs','body_weight_logs','sessions'] loop
    if to_regclass('public.' || t) is null then missing := missing || ('table ' || t); end if;
  end loop;
  foreach t in array array['can_coach(uuid)','is_coach()','am_removed()','refresh_coach_tasks(date)','send_pr_alert(text,text,text,text)','notify_coach_pr(uuid,text,text)','owner_lang()','html_escape(text)'] loop
    if to_regprocedure('public.' || t) is null then missing := missing || ('function ' || t); end if;
  end loop;
  if to_regprocedure('public.refresh_coach_tasks(date)') is not null
     and pg_get_functiondef('public.refresh_coach_tasks(date)'::regprocedure) not like '%g.author_id = coalesce(p.coach_id%' then
    missing := missing || 'the second-coach version of refresh_coach_tasks'::text;
  end if;
  if array_length(missing, 1) > 0 then
    raise exception 'MISSING: %. Run the earlier SQL first; nothing was changed.', array_to_string(missing, ', ');
  end if;
end $$;

-- ================= supabase-custom-measurements.sql =================
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

-- ================= supabase-coach-preferences.sql =================
-- Ironlog: coach settings for alerts and the To do list.
--
-- Run after supabase-custom-measurements.sql (it creates coach_settings).
-- Safe to run more than once. Nothing changes for a coach until they save
-- Coach settings: every value below defaults to how the app worked before.
--
-- - tasks_off: To do item kinds this coach doesn't want (quiet, food,
--   birthday, checkin, weigh, welcome).
-- - weigh_days: days without a weigh-in before a To do item (was 14).
-- - food_days: finished days without food logs before a To do item (was 3).
-- - behind_pct: People flags a trainee under this % of their plan (was 60).
-- - checkin_days: "Check-in done" moves the next check-in this many days (was 7).
-- - pr_alerts: email/push when a trainee sets a record (records still show
--   in the app either way).

alter table public.coach_settings add column if not exists tasks_off text[] not null default '{}';
alter table public.coach_settings add column if not exists weigh_days integer not null default 14;
alter table public.coach_settings add column if not exists food_days integer not null default 3;
alter table public.coach_settings add column if not exists behind_pct integer not null default 60;
alter table public.coach_settings add column if not exists checkin_days integer not null default 7;
alter table public.coach_settings add column if not exists pr_alerts boolean not null default true;

alter table public.coach_settings drop constraint if exists coach_settings_prefs_check;
alter table public.coach_settings add constraint coach_settings_prefs_check check (
  tasks_off <@ array['quiet', 'food', 'birthday', 'checkin', 'weigh', 'welcome']
  and weigh_days between 3 and 90
  and food_days between 1 and 30
  and behind_pct between 10 and 100
  and checkin_days between 1 and 90
);

-- ---------- the To do list reads the coach's settings ----------
CREATE OR REPLACE FUNCTION public.refresh_coach_tasks(p_today date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  added integer := 0;
  c integer;
begin
  -- Signed-in callers must be the coach; the cron job runs with no user.
  if auth.uid() is not null and not public.is_coach() then
    raise exception 'coaches only' using errcode = '42501';
  end if;

  -- Close tasks whose reason went away.
  update coach_tasks t set done_at = now(), auto_done = true
  where t.done_at is null and t.trainee_id is not null and (
    (t.kind = 'quiet' and exists (select 1 from sessions s where s.user_id = t.trainee_id and s.date > t.since))
    or (t.kind = 'food' and exists (select 1 from food_logs f where f.user_id = t.trainee_id and f.date > coalesce(t.since, '-infinity'::date)))
    or (t.kind = 'weigh' and exists (select 1 from body_weight_logs b where b.user_id = t.trainee_id and b.date > t.since))
    or (t.kind = 'checkin' and not exists (select 1 from coach_goals g where g.trainee_id = t.trainee_id and g.next_checkin = t.since))
  );

  -- Gone quiet: no session for their alert days (default 5).
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, n, due)
  select p.id, 'quiet', 'quiet:' || p.id || ':' || l.last, l.last, p_today - l.last, p_today
  from profiles p
  join lateral (select max(s.date) as last from sessions s where s.user_id = p.id) l on true
  left join coach_settings cs on cs.coach_id = public.coach_for(p.id)
  where not p.is_admin and not p.is_coach and l.last is not null
    and p_today - l.last >= coalesce(p.inactivity_alert_days, 5)
    and not ('quiet' = any(coalesce(cs.tasks_off, '{}')))
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- Not logging food: nutrition on with a calorie target, account older than
  -- three days, and nothing logged in the coach's number of finished days
  -- (default 3).
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, n, due)
  select p.id, 'food', 'food:' || p.id || ':' || coalesce(l.last::text, 'none'), l.last,
         case when l.last is null then null else p_today - l.last end, p_today
  from profiles p
  join nutrition_targets nt on nt.user_id = p.id and nt.kcal is not null
  join lateral (select max(f.date) as last from food_logs f where f.user_id = p.id and f.date < p_today) l on true
  left join coach_settings cs on cs.coach_id = public.coach_for(p.id)
  where not p.is_admin and not p.is_coach and p.nutrition_enabled
    and p.created_at::date <= p_today - 3
    and (l.last is null or l.last < p_today - coalesce(cs.food_days, 3))
    and not ('food' = any(coalesce(cs.tasks_off, '{}')))
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- Birthday today (29 Feb birthdays on 28 Feb in other years).
  insert into coach_tasks (trainee_id, kind, dedupe_key, n, due)
  select p.id, 'birthday', 'birthday:' || p.id || ':' || extract(year from p_today),
         extract(year from age(p_today, p.birthday))::int, p_today
  from profiles p
  left join coach_settings cs on cs.coach_id = public.coach_for(p.id)
  where not p.is_admin and not p.is_coach and p.birthday is not null
    and not ('birthday' = any(coalesce(cs.tasks_off, '{}')))
    and (to_char(p.birthday, 'MM-DD') = to_char(p_today, 'MM-DD')
      or (to_char(p.birthday, 'MM-DD') = '02-29' and to_char(p_today, 'MM-DD') = '02-28'
          and extract(day from (date_trunc('year', p_today) + interval '1 month 28 days')) <> 29))
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- Check-in date reached (set on the trainee's coach page).
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, due)
  select g.trainee_id, 'checkin', 'checkin:' || g.trainee_id || ':' || g.next_checkin, g.next_checkin, g.next_checkin
  from coach_goals g
  join profiles p on p.id = g.trainee_id and not p.is_admin and not p.is_coach
    and g.author_id = coalesce(p.coach_id, (select o.id from profiles o where o.is_admin order by o.created_at limit 1))
  left join coach_settings cs on cs.coach_id = g.author_id
  where g.next_checkin is not null and g.next_checkin <= p_today
    and not ('checkin' = any(coalesce(cs.tasks_off, '{}')))
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- No weigh-in for the coach's number of days (default 14), for people who
  -- do weigh in.
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, n, due)
  select p.id, 'weigh', 'weigh:' || p.id || ':' || l.last, l.last, p_today - l.last, p_today
  from profiles p
  join lateral (select max(b.date) as last from body_weight_logs b where b.user_id = p.id) l on true
  left join coach_settings cs on cs.coach_id = public.coach_for(p.id)
  where not p.is_admin and not p.is_coach and l.last is not null and l.last <= p_today - coalesce(cs.weigh_days, 14)
    and not ('weigh' = any(coalesce(cs.tasks_off, '{}')))
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- New trainee, three days in: see how the first week is going.
  insert into coach_tasks (trainee_id, kind, dedupe_key, due)
  select p.id, 'welcome', 'welcome:' || p.id, p_today
  from profiles p
  left join coach_settings cs on cs.coach_id = public.coach_for(p.id)
  where not p.is_admin and not p.is_coach
    and p.created_at::date between p_today - 10 and p_today - 3
    and not ('welcome' = any(coalesce(cs.tasks_off, '{}')))
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  return case when auth.uid() is null then added
    else (select count(*)::integer from coach_tasks t
          where t.created_at = now() and t.trainee_id is not null and public.can_coach(t.trainee_id)) end;
end;
$function$;

revoke execute on function public.refresh_coach_tasks(date) from public, anon;
grant execute on function public.refresh_coach_tasks(date) to authenticated;

-- ---------- record alerts can be switched off ----------
-- Same as supabase-notification-wording.sql, plus the pr_alerts check.
create or replace function public.send_pr_alert(trainee_name text, ex_name text, detail_en text, detail_he text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- The owner can switch record alerts off (Coach settings).
  if exists (select 1 from coach_settings cs join profiles o on o.id = cs.coach_id and o.is_admin where not cs.pr_alerts) then
    return;
  end if;
  if owner_lang() = 'he' then
    perform send_admin_email(
      'שיא חדש של ' || trainee_name || ' 🏆',
      '<p dir="rtl">שיא אישי חדש של <strong>' || public.html_escape(trainee_name) || '</strong> ב-<strong>' ||
      public.html_escape(ex_name) || '</strong>: <span dir="ltr">' || public.html_escape(detail_he) || '</span>.</p>'
    );
    perform send_admin_push('🏆 שיא חדש: ' || trainee_name, ex_name || ' — ' || detail_he);
  else
    perform send_admin_email(
      trainee_name || ' just hit a new PR 🏆',
      '<p><strong>' || public.html_escape(trainee_name) || '</strong> just set a new personal record on <strong>' ||
      public.html_escape(ex_name) || '</strong>: ' || public.html_escape(detail_en) || '.</p>'
    );
    perform send_admin_push('🏆 New PR: ' || trainee_name, ex_name || ' — ' || detail_en);
  end if;
end;
$function$;
revoke execute on function public.send_pr_alert(text, text, text, text) from public, anon, authenticated;

create or replace function public.notify_coach_pr(trainee uuid, detail text, detail_he text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
begin
  -- The coach can switch record alerts off (Coach settings).
  if exists (select 1 from public.coach_settings cs where cs.coach_id = public.coach_for(trainee) and not cs.pr_alerts) then
    return;
  end if;
  select value into secret from public.push_config where key = 'cron_secret';
  if secret is null then return; end if;
  perform net.http_post(
    url := 'https://hwdgjkiwanxluicdpndh.supabase.co/functions/v1/send-workout-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := jsonb_build_object('pr_trainee_id', trainee, 'pr_detail', detail, 'pr_detail_he', detail_he)
  );
exception when others then
  raise warning 'notify_coach_pr failed: %', sqlerrm;
end;
$$;
revoke execute on function public.notify_coach_pr(uuid, text, text) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ================= supabase-nutrition-coach-options.sql =================
-- Ironlog: coach options on a trainee's nutrition targets.
--
-- Run after supabase-food-fiber-own-targets.sql. Safe to run more than once.
-- Until it runs, the app works as before (four fixed meals, no fibre
-- target, on target within 10%).
--
-- - fiber: a daily fibre target in grams.
-- - kcal_band: how close to the calorie target counts as on target, in %.
-- - meals: which meal slots the diary shows and what they're called, as
--   [{ "key": "breakfast", "en": "...", "he": "..." }, ...] in order. Empty
--   names use the built-in ones. Null means the usual four meals.
--   Two extra slots, snack2 and snack3, let a coach plan five or six meals.

alter table public.nutrition_targets add column if not exists fiber numeric;
alter table public.nutrition_targets add column if not exists kcal_band integer not null default 10;
alter table public.nutrition_targets add column if not exists meals jsonb;

alter table public.nutrition_targets drop constraint if exists nutrition_targets_fiber_check;
alter table public.nutrition_targets add constraint nutrition_targets_fiber_check check (fiber is null or (fiber > 0 and fiber < 200));
alter table public.nutrition_targets drop constraint if exists nutrition_targets_kcal_band_check;
alter table public.nutrition_targets add constraint nutrition_targets_kcal_band_check check (kcal_band between 5 and 25);

create or replace function public.valid_meal_layout(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null or (
    jsonb_typeof(p) = 'array'
    and jsonb_array_length(p) between 1 and 6
    and not exists (
      select 1 from jsonb_array_elements(p) e
      where jsonb_typeof(e) <> 'object'
         or coalesce(e ->> 'key', '') not in ('breakfast', 'lunch', 'dinner', 'snack', 'snack2', 'snack3')
         or char_length(coalesce(e ->> 'en', '')) > 30
         or char_length(coalesce(e ->> 'he', '')) > 30)
    and (select count(distinct e ->> 'key') from jsonb_array_elements(p) e) = jsonb_array_length(p));
$$;
alter table public.nutrition_targets drop constraint if exists nutrition_targets_meals_check;
alter table public.nutrition_targets add constraint nutrition_targets_meals_check check (public.valid_meal_layout(meals));

-- The two extra meal slots.
alter table public.food_logs drop constraint if exists food_logs_meal_check;
alter table public.food_logs add constraint food_logs_meal_check
  check (meal in ('breakfast', 'lunch', 'dinner', 'snack', 'snack2', 'snack3'));

-- Meal slots are the coach's choice: a trainee who edits their own targets
-- keeps whatever slots the coach set.
create or replace function public.keep_coach_meals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.can_coach(new.user_id)
     or (new.user_id = auth.uid() and public.is_coach()) then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.meals := old.meals;
  else
    new.meals := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.keep_coach_meals() from public, anon, authenticated;
drop trigger if exists keep_coach_meals on public.nutrition_targets;
create trigger keep_coach_meals before insert or update on public.nutrition_targets
  for each row execute function public.keep_coach_meals();

notify pgrst, 'reload schema';

-- ================= supabase-coach-extras.sql =================
-- Ironlog: per-trainee feature switches, saved feedback snippets and the
-- coach's own invite message.
--
-- Run after supabase-coach-preferences.sql. Safe to run more than once.
-- Until it runs, the app works as before.
--
-- - trainee_settings: what a coach turned off for one trainee. Messages off
--   hides the Messages screen and thread on both sides and stops new
--   messages; weigh prompt off hides the daily weigh-in card on Home.
-- - coach_settings.snippets: short feedback lines the coach reuses on
--   workouts.
-- - coach_settings.invite_text: the coach's invite message; {name} and
--   {link} are filled in. Empty uses the built-in message.

create table if not exists public.trainee_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  messages_off boolean not null default false,
  weigh_prompt_off boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.trainee_settings enable row level security;

drop policy if exists "read own or coached trainee settings" on public.trainee_settings;
create policy "read own or coached trainee settings" on public.trainee_settings
  for select using (auth.uid() = user_id or public.can_coach(user_id));
drop policy if exists "coach sets trainee settings" on public.trainee_settings;
create policy "coach sets trainee settings" on public.trainee_settings
  for all using (public.can_coach(user_id))
  with check (public.can_coach(user_id));

grant select, insert, update, delete on public.trainee_settings to authenticated;

drop policy if exists "removed people cannot add" on public.trainee_settings;
create policy "removed people cannot add" on public.trainee_settings as restrictive for insert to authenticated
  with check (not public.am_removed());
drop policy if exists "removed people cannot change" on public.trainee_settings;
create policy "removed people cannot change" on public.trainee_settings as restrictive for update to authenticated
  using (not public.am_removed()) with check (not public.am_removed());

-- No new messages in a thread the coach switched off (either side).
create or replace function public.messages_allowed(p_trainee uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Only answers for the trainee or their coach; anyone else gets true (the
  -- other insert policies still decide), so the flag never leaks.
  select not ((auth.uid() = p_trainee or public.can_coach(p_trainee))
    and coalesce((select messages_off from public.trainee_settings where user_id = p_trainee), false));
$$;
revoke execute on function public.messages_allowed(uuid) from public, anon;
grant execute on function public.messages_allowed(uuid) to authenticated;

drop policy if exists "messages switched off" on public.coach_messages;
create policy "messages switched off" on public.coach_messages as restrictive for insert to authenticated
  with check (public.messages_allowed(trainee_id));

-- ---------- coach settings ----------
alter table public.coach_settings add column if not exists snippets text[] not null default '{}';
alter table public.coach_settings add column if not exists invite_text text;

create or replace function public.valid_snippets(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_length(p, 1), 0) <= 30
     and not exists (select 1 from unnest(p) s where char_length(s) not between 1 and 500);
$$;
alter table public.coach_settings drop constraint if exists coach_settings_extras_check;
alter table public.coach_settings add constraint coach_settings_extras_check check (
  public.valid_snippets(snippets)
  and (invite_text is null or char_length(invite_text) <= 1000)
);

notify pgrst, 'reload schema';

-- ================= supabase-weekly-checkins.sql =================
-- Ironlog: weekly check-in questions written by the coach.
--
-- Run after supabase-coach-extras.sql. Safe to run more than once.
--
-- - coach_settings.checkin_questions: the coach's questions, in order, as
--   [{ "id": "q1", "en": "...", "he": "...", "type": "scale" | "number" | "text" }].
--   Empty means no weekly check-in for their trainees.
-- - checkin_answers: one row per trainee per week (the week starts on
--   Sunday, as everywhere in the app). Answers are { "<question id>": value }
--   with the question text copied in, so editing questions later never
--   changes what an old answer meant.
-- - my_checkin_questions(): the signed-in person's coach's questions.

alter table public.coach_settings add column if not exists checkin_questions jsonb not null default '[]';

create or replace function public.valid_checkin_questions(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 12 and not exists (
    select 1 from jsonb_array_elements(p) q
    where jsonb_typeof(q) <> 'object'
       or coalesce(q ->> 'id', '') !~ '^[a-z0-9_-]{1,40}$'
       or coalesce(q ->> 'type', '') not in ('scale', 'number', 'text')
       or (coalesce(btrim(q ->> 'en'), '') = '' and coalesce(btrim(q ->> 'he'), '') = '')
       or char_length(coalesce(q ->> 'en', '')) > 200
       or char_length(coalesce(q ->> 'he', '')) > 200);
$$;
alter table public.coach_settings drop constraint if exists coach_settings_checkin_check;
alter table public.coach_settings add constraint coach_settings_checkin_check check (public.valid_checkin_questions(checkin_questions));

create table if not exists public.checkin_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 20000),
  questions jsonb not null default '[]' check (jsonb_typeof(questions) = 'array' and pg_column_size(questions) < 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);
create index if not exists checkin_answers_user_week on public.checkin_answers (user_id, week_start desc);

alter table public.checkin_answers enable row level security;

-- The trainee writes their own; their coach reads them.
drop policy if exists "read own or coached checkins" on public.checkin_answers;
create policy "read own or coached checkins" on public.checkin_answers
  for select using (auth.uid() = user_id or public.can_coach(user_id));
drop policy if exists "write own checkins" on public.checkin_answers;
create policy "write own checkins" on public.checkin_answers
  for insert with check (auth.uid() = user_id);
drop policy if exists "change own checkins" on public.checkin_answers;
create policy "change own checkins" on public.checkin_answers
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "delete own checkins" on public.checkin_answers;
create policy "delete own checkins" on public.checkin_answers
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.checkin_answers to authenticated;

drop policy if exists "removed people cannot add" on public.checkin_answers;
create policy "removed people cannot add" on public.checkin_answers as restrictive for insert to authenticated
  with check (not public.am_removed());
drop policy if exists "removed people cannot change" on public.checkin_answers;
create policy "removed people cannot change" on public.checkin_answers as restrictive for update to authenticated
  using (not public.am_removed()) with check (not public.am_removed());

create or replace function public.my_checkin_questions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select cs.checkin_questions from public.coach_settings cs
                   where cs.coach_id = public.coach_for(auth.uid())), '[]'::jsonb);
$$;
revoke execute on function public.my_checkin_questions() from public, anon;
grant execute on function public.my_checkin_questions() to authenticated;

notify pgrst, 'reload schema';

-- ================= supabase-coach-reminders.sql =================
-- Ironlog: the coach sets a trainee's daily workout reminder.
--
-- Run after supabase-coach-extras.sql. Safe to run more than once.
-- Then deploy the send-workout-reminders function again
-- (supabase functions deploy send-workout-reminders) so it reads these.
--
-- remind_time / remind_days on trainee_settings override the time and
-- weekdays the trainee picked on their phone. Null keeps the trainee's own
-- choice. The trainee still decides whether reminders are on at all (they
-- need to allow notifications on their phone).

alter table public.trainee_settings add column if not exists remind_time time;
alter table public.trainee_settings add column if not exists remind_days smallint[];

alter table public.trainee_settings drop constraint if exists trainee_settings_remind_days_check;
alter table public.trainee_settings add constraint trainee_settings_remind_days_check check (
  remind_days is null or (array_length(remind_days, 1) between 1 and 7 and remind_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
);

notify pgrst, 'reload schema';

-- ================= supabase-coach-branding.sql =================
-- Ironlog: a coach's own look for their trainees' app.
--
-- Run after supabase-coach-extras.sql. Safe to run more than once.
--
-- - brand_name: shown to their trainees as "Coached by <name>".
-- - brand_color: one of the app's accent colours (all readable with the
--   app's dark text), by name. Null keeps the usual orange.
-- - brand_logo: a small square logo, resized in the browser and stored as a
--   data: URL (under ~90 KB), so no storage bucket is needed.
-- - my_brand(): the signed-in person's coach's look.

alter table public.coach_settings add column if not exists brand_name text;
alter table public.coach_settings add column if not exists brand_color text;
alter table public.coach_settings add column if not exists brand_logo text;

alter table public.coach_settings drop constraint if exists coach_settings_brand_check;
alter table public.coach_settings add constraint coach_settings_brand_check check (
  (brand_name is null or char_length(brand_name) between 1 and 40)
  and (brand_color is null or brand_color in ('ember', 'gold', 'lime', 'mint', 'teal', 'sky', 'violet', 'pink'))
  and (brand_logo is null or (brand_logo ~ '^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$' and char_length(brand_logo) < 120000))
);

create or replace function public.my_brand()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object('name', cs.brand_name, 'color', cs.brand_color, 'logo', cs.brand_logo)
    from public.coach_settings cs where cs.coach_id = public.coach_for(auth.uid())), '{}'::jsonb);
$$;
revoke execute on function public.my_brand() from public, anon;
grant execute on function public.my_brand() to authenticated;

notify pgrst, 'reload schema';

commit;
