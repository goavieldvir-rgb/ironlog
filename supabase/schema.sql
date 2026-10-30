-- ===== 0. Header =====
-- Ironlog database schema: every table with its row level security rules, triggers, functions, grants and scheduled jobs.
-- Generated from the live database on 2026-10-11 and meant to stay the single source of truth.
-- Rule: no table ships without RLS enabled and its policies in this file.
-- Owner-only data uses (auth.uid() = user_id) OR public.is_admin().
-- Secrets (Resend key, ntfy topic, VAPID keys, cron secret) live in Supabase Vault / push_config and are never in this file.
-- The older supabase-*.sql files at the repo root are history; this file supersedes them.
-- Safe to re-run: uses if not exists / create or replace / drop policy if exists.

-- ===== 1. Tables =====
create table if not exists public.admin_notifications (
  id uuid default gen_random_uuid() not null,
  type text not null,
  trainee_id uuid,
  detail text,
  sent_at timestamp with time zone default now() not null,
  constraint admin_notifications_pkey PRIMARY KEY (id),
  constraint admin_notifications_trainee_id_fkey FOREIGN KEY (trainee_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint admin_notifications_type_check CHECK ((type = ANY (ARRAY['pr'::text, 'inactivity'::text])))
);
create table if not exists public.body_weight_logs (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  date date not null,
  weight numeric not null,
  unit text default 'kg'::text not null,
  created_at timestamp with time zone default now() not null,
  constraint body_weight_logs_pkey PRIMARY KEY (id),
  constraint body_weight_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
create table if not exists public.waist_logs (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  date date not null,
  waist numeric not null,
  unit text default 'cm'::text not null,
  created_at timestamp with time zone default now() not null,
  constraint waist_logs_pkey PRIMARY KEY (id),
  constraint waist_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint waist_logs_waist_check CHECK ((waist > 0 AND waist < 400)),
  constraint waist_logs_unit_check CHECK ((unit = ANY (ARRAY['cm'::text, 'in'::text])))
);
create table if not exists public.consents (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  doc_key text not null,
  version integer not null,
  variant text not null,
  lang text not null,
  text_sha256 text not null,
  guardian_name text,
  guardian_contact text,
  accepted_at timestamp with time zone default now() not null,
  constraint consents_pkey PRIMARY KEY (id),
  constraint consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
create table if not exists public.error_logs (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  message text,
  stack text,
  component_stack text,
  url text,
  created_at timestamp with time zone default now() not null,
  constraint error_logs_pkey PRIMARY KEY (id),
  constraint error_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL
);
create table if not exists public.exercises (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  category text default 'strength'::text not null,
  video_url text default ''::text,
  notes text default ''::text,
  unit text default 'kg'::text not null,
  last_weight numeric,
  last_reps integer,
  last_date date,
  last_sets jsonb,
  created_at timestamp with time zone default now() not null,
  bodyweight boolean default false not null,
  intensity_type text default 'rpe'::text not null,
  last_distance numeric,
  name_he text,
  track_rir boolean default false not null,
  last_note text,
  last_note_date date,
  timed boolean default false not null,
  constraint exercises_pkey PRIMARY KEY (id),
  constraint exercises_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint exercises_category_check CHECK ((category = ANY (ARRAY['strength'::text, 'mobility'::text, 'cardio'::text]))),
  constraint exercises_intensity_type_check CHECK ((intensity_type = ANY (ARRAY['rpe'::text, 'hr_zone'::text])))
);
create table if not exists public.global_exercises (
  id uuid default gen_random_uuid() not null,
  name text not null,
  category text default 'strength'::text not null,
  unit text default 'kg'::text not null,
  bodyweight boolean default false not null,
  notes text default ''::text,
  created_at timestamp with time zone default now() not null,
  intensity_type text default 'rpe'::text not null,
  name_he text,
  constraint global_exercises_pkey PRIMARY KEY (id),
  constraint global_exercises_category_check CHECK ((category = ANY (ARRAY['strength'::text, 'mobility'::text, 'cardio'::text]))),
  constraint global_exercises_intensity_type_check CHECK ((intensity_type = ANY (ARRAY['rpe'::text, 'hr_zone'::text])))
);
create table if not exists public.profiles (
  id uuid not null,
  email text,
  full_name text,
  is_admin boolean default false not null,
  created_at timestamp with time zone default now() not null,
  inactivity_alert_days integer default 5 not null,
  dashboard_style text default 'cards'::text not null,
  nutrition_enabled boolean default false not null,
  constraint profiles_pkey PRIMARY KEY (id),
  constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);
create table if not exists public.push_config (
  key text not null,
  value text not null,
  constraint push_config_pkey PRIMARY KEY (key)
);
create table if not exists public.push_subscriptions (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  remind_time time without time zone default '08:00:00'::time without time zone not null,
  tz text default 'UTC'::text not null,
  lang text default 'en'::text not null,
  last_sent_date date,
  last_test_at timestamp with time zone,
  rest_ends_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint push_subscriptions_user_id_endpoint_key UNIQUE (user_id, endpoint),
  constraint push_subscriptions_pkey PRIMARY KEY (id),
  constraint push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint push_subscriptions_endpoint_check CHECK ((endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'::text)),
  constraint push_subscriptions_lang_check CHECK ((lang = ANY (ARRAY['en'::text, 'he'::text])))
);
create table if not exists public.routines (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  category text default 'strength'::text not null,
  exercises jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint routines_pkey PRIMARY KEY (id),
  constraint routines_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint routines_category_check CHECK ((category = ANY (ARRAY['strength'::text, 'mobility'::text, 'cardio'::text])))
);
create table if not exists public.sessions (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  routine_id uuid,
  routine_name text default 'Freestyle'::text not null,
  category text default 'strength'::text not null,
  date date not null,
  notes text default ''::text,
  entries jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  trainer_comment text,
  started_at timestamp with time zone,
  duration_minutes integer,
  constraint sessions_pkey PRIMARY KEY (id),
  constraint sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint sessions_category_check CHECK ((category = ANY (ARRAY['strength'::text, 'mobility'::text, 'cardio'::text])))
);
create table if not exists public.weekly_schedule (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  day_of_week integer not null,
  routine_id uuid,
  updated_at timestamp with time zone default now() not null,
  slot integer default 0 not null,
  constraint weekly_schedule_user_id_day_of_week_slot_key UNIQUE (user_id, day_of_week, slot),
  constraint weekly_schedule_pkey PRIMARY KEY (id),
  constraint weekly_schedule_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE SET NULL,
  constraint weekly_schedule_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint weekly_schedule_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6))),
  constraint weekly_schedule_slot_check CHECK (((slot >= 0) AND (slot <= 2)))
);

create index if not exists consents_user_idx on public.consents using btree (user_id, doc_key, version desc);

-- Nutrition beta (supabase-nutrition.sql). Values in foods are per 100 g.
create extension if not exists pg_trgm;
alter table public.profiles add column if not exists nutrition_enabled boolean not null default false;
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('moh', 'usda', 'off', 'user', 'coach')),
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

create unique index if not exists foods_source_ref_uniq on public.foods (source, source_ref) where source_ref is not null;
create index if not exists foods_barcode_idx on public.foods (barcode) where barcode is not null;
create index if not exists foods_search_trgm on public.foods using gin (search_text gin_trgm_ops);
create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_id uuid references public.foods(id) on delete set null,
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

create index if not exists food_logs_user_date on public.food_logs (user_id, date);
create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.nutrition_targets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kcal integer check (kcal > 0),
  protein numeric(6,1) check (protein >= 0),
  carbs numeric(6,1) check (carbs >= 0),
  fat numeric(6,1) check (fat >= 0),
  updated_at timestamptz not null default now()
);

-- Water tracker (supabase-water.sql). Amounts in ml.
create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  ml integer not null check (ml > 0 and ml <= 5000),
  created_at timestamptz not null default now()
);

create index if not exists water_logs_user_date on public.water_logs (user_id, date);
create table if not exists public.water_goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ml integer not null check (ml >= 500 and ml <= 10000),
  updated_at timestamptz not null default now()
);
create table if not exists public.food_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, food_id)
);

-- ===== 2. Functions (before the policies that call is_admin()) =====
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, full_name, is_admin)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), false)
  on conflict (id) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.protect_admin_flag()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.nutrition_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select is_admin or nutrition_enabled from profiles where id = auth.uid()), false);
$function$;

CREATE OR REPLACE FUNCTION public.delete_my_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.run_workout_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  secret text;
begin
  select value into secret from public.push_config where key = 'cron_secret';
  if secret is null then return; end if;
  perform net.http_post(
    url := 'https://hwdgjkiwanxluicdpndh.supabase.co/functions/v1/send-workout-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.send_admin_email(p_subject text, p_html text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  api_key text;
  admin_row record;
begin
  select decrypted_secret into api_key
  from vault.decrypted_secrets
  where name = 'resend_api_key'
  limit 1;

  if api_key is null then
    raise warning 'resend_api_key not set in Vault — skipping email send';
    return;
  end if;

  for admin_row in select email from profiles where is_admin = true loop
    -- Per-admin error boundary: if sending to one admin fails, the others
    -- (once there's more than one) still get their email.
    begin
      perform net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || api_key,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'from', 'Ironlog <onboarding@resend.dev>',
          'to', admin_row.email,
          'subject', p_subject,
          'html', p_html
        )
      );
    exception when others then
      raise warning 'send_admin_email failed for %: %', admin_row.email, sqlerrm;
    end;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.send_admin_push(p_title text, p_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ntfy_topic text;
begin
  select decrypted_secret into ntfy_topic
  from vault.decrypted_secrets
  where name = 'ntfy_topic'
  limit 1;

  if ntfy_topic is null then
    raise warning 'ntfy_topic not set in Vault — skipping push notification';
    return;
  end if;

  -- Its own error boundary, same principle as everything else here: a
  -- push notification failing should never cascade into anything else
  -- breaking.
  begin
    perform net.http_post(
      url := 'https://ntfy.sh/',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'topic', ntfy_topic,
        'title', p_title,
        'message', p_message,
        'priority', 4
      )
    );
  exception when others then
    raise warning 'send_admin_push failed: %', sqlerrm;
  end;
end;
$function$;

-- html_escape, check_for_new_prs and check_inactive_trainees (from supabase-security-round2.sql)
create or replace function public.html_escape(t text)
 returns text
 language sql
 immutable
 set search_path = ''
as $$
  select replace(replace(replace(replace(coalesce(t,''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;')
$$;

create or replace function public.check_for_new_prs()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  entry jsonb;
  set_row jsonb;
  ex_category text;
  ex_bodyweight boolean;
  ex_name text;
  ex_id text;
  ex_unit text;
  this_top numeric;
  this_top_set jsonb;
  prev_best numeric;
  reps_set jsonb;
  reps_top numeric;
  prev_reps numeric;
  prev_cnt int;
  trainee_name text;
  detail_text text;
  numeric_pattern text := '^-?[0-9]+\.?[0-9]*$';
begin
  begin
    for entry in select * from jsonb_array_elements(NEW.entries)
    loop
      ex_name := entry->>'name';
      ex_id := entry->>'exerciseId';
      ex_category := coalesce(entry->>'category', 'strength');
      ex_bodyweight := coalesce((entry->>'bodyweight')::boolean, false);
      ex_unit := coalesce(entry->>'unit', 'kg');
      this_top := null;
      this_top_set := null;

      for set_row in select * from jsonb_array_elements(entry->'sets')
      loop
        if ex_category = 'cardio' then
          if nullif(set_row->>'duration', '') is not null
            and (set_row->>'duration') ~ numeric_pattern
            and (this_top is null or (set_row->>'duration')::numeric > this_top) then
            this_top := (set_row->>'duration')::numeric;
            this_top_set := set_row;
          end if;
        elsif ex_bodyweight then
          if nullif(set_row->>'reps', '') is not null
            and (set_row->>'reps') ~ numeric_pattern
            and (this_top is null or (set_row->>'reps')::numeric > this_top) then
            this_top := (set_row->>'reps')::numeric;
            this_top_set := set_row;
          end if;
        else
          if nullif(set_row->>'weight', '') is not null
            and (set_row->>'weight') ~ numeric_pattern
            and (this_top is null or (set_row->>'weight')::numeric > this_top) then
            this_top := (set_row->>'weight')::numeric;
            this_top_set := set_row;
          end if;
        end if;
      end loop;

      if this_top is null or this_top = 0 then
        continue;
      end if;

      select max(
        case
          when ex_category = 'cardio' then (s.set_elem->>'duration')::numeric
          when ex_bodyweight then (s.set_elem->>'reps')::numeric
          else (s.set_elem->>'weight')::numeric
        end
      ) into prev_best
      from sessions sess,
        jsonb_array_elements(sess.entries) as e(entry_elem),
        jsonb_array_elements(e.entry_elem -> 'sets') as s(set_elem)
      where sess.user_id = NEW.user_id
        and sess.id != NEW.id
        -- Records count per gym: a machine at one gym isn't the same weight
        -- as at another. No gym (null) is the person's main gym.
        and sess.gym_id is not distinct from NEW.gym_id
        and e.entry_elem ->> 'exerciseId' = ex_id
        and (
          case
            when ex_category = 'cardio' then s.set_elem->>'duration'
            when ex_bodyweight then s.set_elem->>'reps'
            else s.set_elem->>'weight'
          end
        ) ~ numeric_pattern;

      -- First time at this gym but done before at another: no record to
      -- beat yet, the same as the workout screen shows.
      if (prev_best is null and not exists (
            select 1 from sessions sess
            where sess.user_id = NEW.user_id and sess.id != NEW.id
              and sess.entries @> jsonb_build_array(jsonb_build_object('exerciseId', ex_id))))
        or this_top > prev_best then
        select coalesce(full_name, email) into trainee_name from profiles where id = NEW.user_id;

        -- Build a full description of the actual set, not just the one
        -- headline number.
        if ex_category = 'cardio' then
          detail_text := this_top || ' min';
          if nullif(this_top_set->>'intensity', '') is not null then
            detail_text := detail_text || ' · intensity ' || (this_top_set->>'intensity');
          end if;
          if nullif(this_top_set->>'distance', '') is not null then
            detail_text := detail_text || ' · ' || (this_top_set->>'distance') || ' ' || ex_unit;
          end if;
        elsif ex_bodyweight then
          detail_text := this_top || ' reps';
          if nullif(this_top_set->>'weight', '') is not null
            and (this_top_set->>'weight') ~ numeric_pattern
            and (this_top_set->>'weight')::numeric > 0 then
            detail_text := '+' || (this_top_set->>'weight') || ex_unit || ' × ' || detail_text;
          end if;
        else
          detail_text := this_top || ex_unit;
          if nullif(this_top_set->>'reps', '') is not null then
            detail_text := detail_text || ' × ' || (this_top_set->>'reps');
          end if;
        end if;

        perform send_admin_email(
          trainee_name || ' just hit a new PR 🏆',
          '<p><strong>' || public.html_escape(trainee_name) || '</strong> just set a new personal record on <strong>' ||
          public.html_escape(ex_name) || '</strong>: ' || public.html_escape(detail_text) || '.</p>'
        );
        perform send_admin_push(
          '🏆 New PR: ' || trainee_name,
          ex_name || ' — ' || detail_text
        );

        insert into admin_notifications (type, trainee_id, detail)
        values ('pr', NEW.user_id, ex_name || ': ' || detail_text);

      elsif coalesce(ex_category, '') <> 'cardio' and not coalesce(ex_bodyweight, false) then
        -- Not a heavier lift, but maybe more reps than ever at this weight
        -- or heavier (a Reps PR). Needs an earlier set to beat. Mirrors the
        -- app: working sets only, judged against other sessions.
        reps_set := null;
        reps_top := null;
        for set_row in select * from jsonb_array_elements(entry->'sets')
        loop
          -- CASE keeps the numeric casts from running on blank or non-numeric
          -- text (SQL does not promise AND/OR short-circuiting).
          if coalesce(set_row->>'warmup', '') = 'true'
            or coalesce(case when (set_row->>'weight') ~ numeric_pattern then (set_row->>'weight')::numeric end, 0) <= 0
            or coalesce(case when (set_row->>'reps') ~ numeric_pattern then (set_row->>'reps')::numeric end, 0) <= 0 then
            continue;
          end if;

          select max((s.set_elem->>'reps')::numeric), count(*)
            into prev_reps, prev_cnt
          from sessions sess,
            jsonb_array_elements(sess.entries) as e(entry_elem),
            jsonb_array_elements(e.entry_elem -> 'sets') as s(set_elem)
          where sess.user_id = NEW.user_id
            and sess.id != NEW.id
            and sess.gym_id is not distinct from NEW.gym_id
            and e.entry_elem ->> 'exerciseId' = ex_id
            and coalesce(s.set_elem->>'warmup', '') <> 'true'
            and coalesce(case when (s.set_elem->>'weight') ~ numeric_pattern
                               and (s.set_elem->>'reps') ~ numeric_pattern
                              then (s.set_elem->>'weight')::numeric end, -1) >= (set_row->>'weight')::numeric;

          if prev_cnt > 0 and (set_row->>'reps')::numeric > prev_reps
            and (reps_top is null or (set_row->>'reps')::numeric > reps_top) then
            reps_top := (set_row->>'reps')::numeric;
            reps_set := set_row;
          end if;
        end loop;

        if reps_set is not null then
          select coalesce(full_name, email) into trainee_name from profiles where id = NEW.user_id;
          detail_text := 'Reps PR ' || (reps_set->>'weight') || ex_unit || ' × ' || (reps_set->>'reps') || ' reps';

          perform send_admin_email(
            trainee_name || ' just hit a new PR 🏆',
            '<p><strong>' || public.html_escape(trainee_name) || '</strong> just set a new personal record on <strong>' ||
            public.html_escape(ex_name) || '</strong>: ' || public.html_escape(detail_text) || '.</p>'
          );
          perform send_admin_push(
            '🏆 New PR: ' || trainee_name,
            ex_name || ' — ' || detail_text
          );

          insert into admin_notifications (type, trainee_id, detail)
          values ('pr', NEW.user_id, ex_name || ': ' || detail_text);
        end if;
      end if;
    end loop;
  exception when others then
    raise warning 'check_for_new_prs failed (session still saved normally): %', sqlerrm;
  end;

  return NEW;
end;
$function$;

create or replace function public.check_inactive_trainees()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
  last_date date;
  days_since integer;
  already_alerted boolean;
begin
  for r in
    select distinct p.id, coalesce(p.full_name, p.email) as name, p.inactivity_alert_days
    from profiles p
    where p.is_admin = false
      and exists (select 1 from routines rt where rt.user_id = p.id)
  loop
    begin
      select max(date) into last_date from sessions where user_id = r.id;
      if last_date is null then continue; end if;
      days_since := current_date - last_date;
      if days_since < coalesce(r.inactivity_alert_days, 5) then continue; end if;
      select exists (
        select 1 from admin_notifications
        where type = 'inactivity' and trainee_id = r.id and sent_at::date > last_date
      ) into already_alerted;
      if already_alerted then continue; end if;
      perform send_admin_email(
        r.name || ' has gone quiet',
        '<p><strong>' || public.html_escape(r.name) || '</strong> hasn''t logged a session in ' || days_since || ' days (last one: ' || last_date || ').</p>'
      );
      perform send_admin_push('💤 ' || r.name || ' has gone quiet', days_since || ' days since their last session (' || last_date || ')');
      insert into admin_notifications (type, trainee_id, detail) values ('inactivity', r.id, days_since || ' days since last session');
    exception when others then
      raise warning 'check_inactive_trainees failed for %: %', r.name, sqlerrm;
    end;
  end loop;
end;
$function$;

-- Execute rights
-- is_admin(): anon and authenticated keep execute (policies call it).
-- handle_new_user(), protect_admin_flag(), check_for_new_prs(): trigger functions, default grants.
revoke execute on function public.send_admin_email(text, text) from public, anon, authenticated;
revoke execute on function public.send_admin_push(text, text) from public, anon, authenticated;
revoke execute on function public.run_workout_reminders() from public, anon, authenticated;
revoke execute on function public.html_escape(text) from public, anon, authenticated;
revoke execute on function public.check_inactive_trainees() from public, anon, authenticated;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke execute on function public.nutrition_allowed() from public, anon;
grant execute on function public.nutrition_allowed() to authenticated;

-- ===== 3. Row level security =====
alter table public.admin_notifications enable row level security;
alter table public.body_weight_logs enable row level security;
alter table public.waist_logs enable row level security;
alter table public.consents enable row level security;
alter table public.error_logs enable row level security;
alter table public.exercises enable row level security;
alter table public.global_exercises enable row level security;
alter table public.profiles enable row level security;
alter table public.push_config enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.routines enable row level security;
alter table public.sessions enable row level security;
alter table public.weekly_schedule enable row level security;

drop policy if exists "admins can read notification log" on public.admin_notifications;
create policy "admins can read notification log" on public.admin_notifications
  as permissive
  for select
  using (is_admin());

drop policy if exists "own or admin body weight" on public.body_weight_logs;
create policy "own or admin body weight" on public.body_weight_logs
  as permissive
  for all
  using ((auth.uid() = user_id) OR is_admin())
  with check ((auth.uid() = user_id) OR is_admin());

drop policy if exists "own or admin waist" on public.waist_logs;
create policy "own or admin waist" on public.waist_logs
  as permissive
  for all
  using ((auth.uid() = user_id) OR is_admin())
  with check ((auth.uid() = user_id) OR is_admin());

drop policy if exists "insert own consent" on public.consents;
create policy "insert own consent" on public.consents
  as permissive
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "read own or admin" on public.consents;
create policy "read own or admin" on public.consents
  as permissive
  for select
  using ((auth.uid() = user_id) OR is_admin());

drop policy if exists "anyone signed in can log their own error" on public.error_logs;
create policy "anyone signed in can log their own error" on public.error_logs
  as permissive
  for insert
  with check ((auth.uid() = user_id) OR (user_id IS NULL));

drop policy if exists "only admins can delete error logs" on public.error_logs;
create policy "only admins can delete error logs" on public.error_logs
  as permissive
  for delete
  using (is_admin());

drop policy if exists "only admins can read error logs" on public.error_logs;
create policy "only admins can read error logs" on public.error_logs
  as permissive
  for select
  using (is_admin());

drop policy if exists "own or admin exercises" on public.exercises;
create policy "own or admin exercises" on public.exercises
  as permissive
  for all
  using ((auth.uid() = user_id) OR is_admin())
  with check ((auth.uid() = user_id) OR is_admin());

drop policy if exists "anyone signed in can read the library" on public.global_exercises;
create policy "anyone signed in can read the library" on public.global_exercises
  as permissive
  for select
  using (auth.uid() IS NOT NULL);

drop policy if exists "only admins delete from the library" on public.global_exercises;
create policy "only admins delete from the library" on public.global_exercises
  as permissive
  for delete
  using (is_admin());

drop policy if exists "only admins manage the library" on public.global_exercises;
create policy "only admins manage the library" on public.global_exercises
  as permissive
  for insert
  with check (is_admin());

drop policy if exists "only admins update the library" on public.global_exercises;
create policy "only admins update the library" on public.global_exercises
  as permissive
  for update
  using (is_admin())
  with check (is_admin());

drop policy if exists "admins can update any profile including admin flag" on public.profiles;
create policy "admins can update any profile including admin flag" on public.profiles
  as permissive
  for update
  using (is_admin())
  with check (is_admin());

drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  as permissive
  for insert
  with check (auth.uid() = id);

drop policy if exists "read own or admin reads all profiles" on public.profiles;
create policy "read own or admin reads all profiles" on public.profiles
  as permissive
  for select
  using ((auth.uid() = id) OR is_admin());

drop policy if exists "users update their own profile but not their admin flag" on public.profiles;
create policy "users update their own profile but not their admin flag" on public.profiles
  as permissive
  for update
  using (auth.uid() = id)
  with check ((auth.uid() = id) AND (is_admin = (SELECT p.is_admin FROM profiles p WHERE (p.id = auth.uid()))));

-- push_config: RLS on, NO policies on purpose (only the service role reads it).
drop policy if exists "own push subs delete" on public.push_subscriptions;
create policy "own push subs delete" on public.push_subscriptions
  as permissive
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "own push subs insert" on public.push_subscriptions;
create policy "own push subs insert" on public.push_subscriptions
  as permissive
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "own push subs select" on public.push_subscriptions;
create policy "own push subs select" on public.push_subscriptions
  as permissive
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "own push subs update" on public.push_subscriptions;
create policy "own push subs update" on public.push_subscriptions
  as permissive
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own or admin routines" on public.routines;
create policy "own or admin routines" on public.routines
  as permissive
  for all
  using ((auth.uid() = user_id) OR is_admin())
  with check ((auth.uid() = user_id) OR is_admin());

drop policy if exists "own or admin sessions" on public.sessions;
create policy "own or admin sessions" on public.sessions
  as permissive
  for all
  using ((auth.uid() = user_id) OR is_admin())
  with check ((auth.uid() = user_id) OR is_admin());

drop policy if exists "own or admin can delete schedule" on public.weekly_schedule;
create policy "own or admin can delete schedule" on public.weekly_schedule
  as permissive
  for delete
  using ((auth.uid() = user_id) OR is_admin());

drop policy if exists "own or admin can insert schedule" on public.weekly_schedule;
create policy "own or admin can insert schedule" on public.weekly_schedule
  as permissive
  for insert
  with check ((auth.uid() = user_id) OR is_admin());

drop policy if exists "own or admin can read schedule" on public.weekly_schedule;
create policy "own or admin can read schedule" on public.weekly_schedule
  as permissive
  for select
  using ((auth.uid() = user_id) OR is_admin());

drop policy if exists "own or admin can update schedule" on public.weekly_schedule;
create policy "own or admin can update schedule" on public.weekly_schedule
  as permissive
  for update
  using ((auth.uid() = user_id) OR is_admin());

-- Nutrition beta: usable only by admins and trainees with profiles.nutrition_enabled.
alter table public.foods enable row level security;

drop policy if exists "foods readable" on public.foods;
create policy "foods readable" on public.foods for select to authenticated using (
  nutrition_allowed() and (verified or source in ('moh', 'usda', 'off') or created_by = auth.uid() or is_admin())
);

-- A trainee may only add a label they typed (private until verified). Only
-- the coach adds shared rows: the OFF cache, coach and moh foods. A trainee's
-- scan still works when its OFF cache insert is refused; the log just has no
-- food_id. This stops a trainee planting fake macros under a real barcode.
drop policy if exists "foods insert" on public.foods;
create policy "foods insert" on public.foods for insert to authenticated with check (
  nutrition_allowed() and created_by = auth.uid()
  and (is_admin() or (source = 'user' and not verified))
);

drop policy if exists "foods update" on public.foods;
create policy "foods update" on public.foods for update to authenticated
  using (is_admin() or (created_by = auth.uid() and not verified and source = 'user'))
  with check (is_admin() or (created_by = auth.uid() and not verified and source = 'user'));

drop policy if exists "foods delete" on public.foods;
create policy "foods delete" on public.foods for delete to authenticated
  using (is_admin() or (created_by = auth.uid() and not verified and source = 'user'));

alter table public.food_logs enable row level security;

drop policy if exists "own food logs or admin" on public.food_logs;
create policy "own food logs or admin" on public.food_logs for all to authenticated
  using ((auth.uid() = user_id and nutrition_allowed()) or is_admin())
  with check ((auth.uid() = user_id and nutrition_allowed()) or is_admin());

alter table public.saved_meals enable row level security;

drop policy if exists "own saved meals or admin" on public.saved_meals;
create policy "own saved meals or admin" on public.saved_meals for all to authenticated
  using ((auth.uid() = user_id and nutrition_allowed()) or is_admin())
  with check ((auth.uid() = user_id and nutrition_allowed()) or is_admin());

alter table public.nutrition_targets enable row level security;

drop policy if exists "read own targets or admin" on public.nutrition_targets;
create policy "read own targets or admin" on public.nutrition_targets for select to authenticated
  using ((auth.uid() = user_id and nutrition_allowed()) or is_admin());

drop policy if exists "admin writes targets" on public.nutrition_targets;
create policy "admin writes targets" on public.nutrition_targets for all to authenticated
  using (is_admin()) with check (is_admin());

-- Water tracker: same visibility as the food diary. The trainee or the coach sets the goal.
alter table public.water_logs enable row level security;

drop policy if exists "own water logs or admin" on public.water_logs;
create policy "own water logs or admin" on public.water_logs for all to authenticated
  using ((auth.uid() = user_id and nutrition_allowed()) or is_admin())
  with check ((auth.uid() = user_id and nutrition_allowed()) or is_admin());

alter table public.water_goals enable row level security;

drop policy if exists "own water goal or admin" on public.water_goals;
create policy "own water goal or admin" on public.water_goals for all to authenticated
  using ((auth.uid() = user_id and nutrition_allowed()) or is_admin())
  with check ((auth.uid() = user_id and nutrition_allowed()) or is_admin());

alter table public.food_favorites enable row level security;

drop policy if exists "own favorites or admin" on public.food_favorites;
create policy "own favorites or admin" on public.food_favorites for all to authenticated
  using ((auth.uid() = user_id and nutrition_allowed()) or is_admin())
  with check ((auth.uid() = user_id and nutrition_allowed()) or is_admin());

-- ===== 4. Grants =====
-- push_config: no API access at all.
revoke all on public.push_config from anon, authenticated;
-- push_subscriptions: anon gets nothing; authenticated is limited by the RLS policies above.
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
-- Other public tables keep Supabase default grants; RLS is the gate.

-- ===== 5. Triggers =====
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

drop trigger if exists trg_check_for_new_prs on public.sessions;
create trigger trg_check_for_new_prs after insert on public.sessions for each row execute function public.check_for_new_prs();

drop trigger if exists protect_admin_flag_trg on public.profiles;
create trigger protect_admin_flag_trg before insert or update on public.profiles for each row execute function public.protect_admin_flag();

-- ===== 6. Scheduled jobs (needs the pg_cron and pg_net extensions) =====
do $$
begin
  if exists (select 1 from cron.job where jobname = 'daily-inactivity-check') then
    perform cron.unschedule('daily-inactivity-check');
  end if;
  perform cron.schedule(
    'daily-inactivity-check',
    '0 5 * * *',
    $job$select check_inactive_trainees();$job$
  );
  if exists (select 1 from cron.job where jobname = 'workout-reminders') then
    perform cron.unschedule('workout-reminders');
  end if;
  perform cron.schedule(
    'workout-reminders',
    '*/15 * * * *',
    $job$select public.run_workout_reminders()$job$
  );
  if exists (select 1 from cron.job where jobname = 'purge-old-error-logs') then
    perform cron.unschedule('purge-old-error-logs');
  end if;
  perform cron.schedule(
    'purge-old-error-logs',
    '30 3 * * *',
    $job$delete from public.error_logs where created_at < now() - interval '90 days'$job$
  );
end $$;

-- ===== 6b. Coach tools (supabase-coach-tools.sql) =====
-- A session counts as reviewed once the coach opened it or commented on it.
alter table public.sessions add column if not exists reviewed_at timestamptz;

-- Every screen loads one person's rows by user_id ordered by date; none of
-- these tables had an index for it.
create index if not exists sessions_user_date on public.sessions (user_id, date desc);
create index if not exists body_weight_logs_user_date on public.body_weight_logs (user_id, date desc);
create index if not exists waist_logs_user_date on public.waist_logs (user_id, date desc);
create index if not exists exercises_user_idx on public.exercises (user_id);
create index if not exists routines_user_idx on public.routines (user_id);
create index if not exists weekly_schedule_user_idx on public.weekly_schedule (user_id);
create index if not exists admin_notifications_trainee_idx on public.admin_notifications (trainee_id, sent_at desc);

-- Private to the coach: trainees never read these.
create table if not exists public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists coach_notes_trainee_idx on public.coach_notes (trainee_id, created_at desc);

create table if not exists public.coach_goals (
  trainee_id uuid primary key references auth.users(id) on delete cascade,
  goal text check (length(goal) <= 300),
  target_weight numeric check (target_weight > 0 and target_weight < 500),
  -- Used when the trainee has no weekly schedule to measure against.
  sessions_per_week smallint check (sessions_per_week between 1 and 14),
  next_checkin date,
  updated_at timestamptz not null default now()
);

alter table public.coach_notes enable row level security;
alter table public.coach_goals enable row level security;

drop policy if exists "admins manage coach notes" on public.coach_notes;
create policy "admins manage coach notes" on public.coach_notes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage coach goals" on public.coach_goals;
create policy "admins manage coach goals" on public.coach_goals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- One row per account with everything the People list shows, computed in the
-- database so the page makes one request instead of downloading every
-- session. p_today is the coach's local date, so weeks (Sunday start) match
-- the rest of the app. Admins only.
create or replace function public.coach_roster(p_today date)
 returns table (
  id uuid,
  email text,
  full_name text,
  is_admin boolean,
  nutrition_enabled boolean,
  inactivity_alert_days integer,
  created_at timestamptz,
  last_session date,
  week_counts integer[],
  planned_per_week integer,
  to_review integer,
  last_weight numeric,
  weight_unit text,
  last_weight_date date,
  weight_change numeric,
  prs_7d integer,
  prs_30d integer,
  last_pr text,
  food_days_7 integer,
  kcal_avg_7 numeric,
  protein_avg_7 numeric,
  kcal_target integer,
  protein_target numeric,
  terms_version integer,
  terms_variant text,
  terms_accepted_at timestamptz,
  guardian_name text,
  goal text,
  target_weight numeric,
  next_checkin date,
  pinned_note text
 )
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  week0 date := p_today - extract(dow from p_today)::int;
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;

  return query
  select
    p.id, p.email, p.full_name, p.is_admin, p.nutrition_enabled, p.inactivity_alert_days, p.created_at,
    (select max(s.date) from sessions s where s.user_id = p.id),
    (select array_agg(
        (select count(*)::int from sessions s
          where s.user_id = p.id and s.date >= week0 - 7 * (7 - i) and s.date < week0 - 7 * (6 - i))
        order by i)
      from generate_series(0, 7) i),
    coalesce(
      (select nullif(count(*), 0)::int from weekly_schedule w where w.user_id = p.id and w.routine_id is not null),
      g.sessions_per_week::int),
    (select count(*)::int from sessions s
      where s.user_id = p.id and s.date >= p_today - 14 and s.reviewed_at is null
        and coalesce(s.trainer_comment, '') = ''),
    bw.weight, bw.unit, bw.date,
    (select bw.weight - b2.weight from body_weight_logs b2
      where b2.user_id = p.id and b2.unit = bw.unit and b2.date <= bw.date - 21
      order by b2.date desc limit 1),
    (select count(*)::int from admin_notifications n
      where n.trainee_id = p.id and n.type = 'pr' and n.sent_at >= p_today - 6),
    (select count(*)::int from admin_notifications n
      where n.trainee_id = p.id and n.type = 'pr' and n.sent_at >= p_today - 29),
    (select n.detail from admin_notifications n
      where n.trainee_id = p.id and n.type = 'pr' order by n.sent_at desc limit 1),
    f.days, f.kcal, f.protein,
    nt.kcal, nt.protein,
    c.version, c.variant, c.accepted_at, c.guardian_name,
    g.goal, g.target_weight, g.next_checkin,
    (select cn.body from coach_notes cn where cn.trainee_id = p.id and cn.pinned
      order by cn.created_at desc limit 1)
  from profiles p
  left join coach_goals g on g.trainee_id = p.id
  left join nutrition_targets nt on nt.user_id = p.id
  left join lateral (
    select b.weight, b.unit, b.date from body_weight_logs b
    where b.user_id = p.id order by b.date desc, b.created_at desc limit 1
  ) bw on true
  left join lateral (
    -- The last seven finished days: today is still being eaten.
    select count(*)::int as days, round(avg(d.kcal)) as kcal, round(avg(d.protein), 1) as protein
    from (
      select fl.date, sum(fl.kcal) as kcal, sum(fl.protein) as protein
      from food_logs fl
      where fl.user_id = p.id and fl.date >= p_today - 7 and fl.date < p_today
      group by fl.date
    ) d
  ) f on true
  left join lateral (
    select cs.version, cs.variant, cs.accepted_at, cs.guardian_name from consents cs
    where cs.user_id = p.id and cs.doc_key = 'training-terms'
    order by cs.version desc, cs.accepted_at desc limit 1
  ) c on true
  order by coalesce(p.full_name, p.email);
end;
$function$;

revoke execute on function public.coach_roster(date) from public, anon;
grant execute on function public.coach_roster(date) to authenticated;

-- ===== 6c. Progress photos (supabase-progress-photos.sql) =====
--
-- Who can do what:
--  - A trainee can add photos only after turning them on (their latest
--    'progress-photos' consent is 'granted'), and never if they signed up as
--    under 18. They can see and delete their own photos.
--  - The coach (is_admin) can see and delete any trainee's photos, but can
--    never add one, even while managing a trainee's account.
--  - Nobody else can read anything: the bucket is private and every image is
--    shown through a link that expires after a few minutes.
--
-- Image files are only ever removed through the Storage API (the app, or the
-- purge-progress-photos Edge Function), never by deleting rows in
-- storage.objects, which Supabase does not allow.

-- One row per photo. Deleting the account removes the rows (cascade); the
-- app removes the files first and the nightly purge catches anything left.
create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  taken_on date not null,
  angle text not null check (angle in ('front', 'side', 'back')),
  path text not null unique,
  thumb_path text,
  created_at timestamptz not null default now(),
  -- The file always lives in the owner's own folder.
  constraint progress_photos_path_owner check (path like (user_id::text || '/%')),
  constraint progress_photos_thumb_owner check (thumb_path is null or thumb_path like (user_id::text || '/%'))
);
create index if not exists progress_photos_user_idx on public.progress_photos (user_id, taken_on desc);

-- True when the signed-in person may add photos right now.
create or replace function public.photos_allowed()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((
    select variant = 'granted' from consents
    where user_id = auth.uid() and doc_key = 'progress-photos'
    order by accepted_at desc limit 1
  ), false)
  and exists (
    select 1 from consents where user_id = auth.uid() and doc_key = 'training-terms'
  )
  -- Anyone who ever signed up as under 18 stays out, so a later 'adult' row
  -- written by hand can't switch photos on.
  and not exists (
    select 1 from consents where user_id = auth.uid() and doc_key = 'training-terms' and variant = 'minor'
  );
$function$;
revoke execute on function public.photos_allowed() from public, anon;
grant execute on function public.photos_allowed() to authenticated;

alter table public.progress_photos enable row level security;

drop policy if exists "read own or admin photos" on public.progress_photos;
create policy "read own or admin photos" on public.progress_photos for select to authenticated
  using ((auth.uid() = user_id) or is_admin());

drop policy if exists "add own photos when allowed" on public.progress_photos;
create policy "add own photos when allowed" on public.progress_photos for insert to authenticated
  with check (auth.uid() = user_id and photos_allowed());

drop policy if exists "delete own or admin photos" on public.progress_photos;
create policy "delete own or admin photos" on public.progress_photos for delete to authenticated
  using ((auth.uid() = user_id) or is_admin());

-- No update policy: a photo is replaced by deleting it and adding another.

-- Private bucket: JPEG only (the app re-encodes every photo, which also drops
-- location and camera details), at most 5 MB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

drop policy if exists "progress photos: read own or admin" on storage.objects;
create policy "progress photos: read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "progress photos: add own when allowed" on storage.objects;
create policy "progress photos: add own when allowed" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text and public.photos_allowed());

drop policy if exists "progress photos: delete own or admin" on storage.objects;
create policy "progress photos: delete own or admin" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Retention: once a night, the purge-progress-photos Edge Function removes
-- photos of anyone who hasn't logged a workout for 12 months, and any files
-- left behind by a deleted account. Uses the same cron secret as reminders.
create or replace function public.run_photo_purge()
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  secret text;
begin
  select value into secret from public.push_config where key = 'cron_secret';
  if secret is null then return; end if;
  perform net.http_post(
    url := 'https://hwdgjkiwanxluicdpndh.supabase.co/functions/v1/purge-progress-photos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb
  );
end;
$function$;
revoke execute on function public.run_photo_purge() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-progress-photos') then
    perform cron.unschedule('purge-progress-photos');
  end if;
end $$;
select cron.schedule('purge-progress-photos', '30 2 * * *', 'select public.run_photo_purge()');

-- ===== 6d. Coach feedback notifications (supabase-coach-feedback.sql) =====
-- Trainer feedback reaches the trainee: a push when the coach saves it, and an
-- unread mark until the trainee opens it.

-- When the feedback was last written, and when the trainee last opened it.
-- Feedback written before this change has no time and counts as read.
alter table public.sessions add column if not exists trainer_comment_at timestamptz;
alter table public.sessions add column if not exists trainer_comment_seen_at timestamptz;

-- Only an admin can write feedback, so a trainee can't fake a note from the
-- coach. A real change of the text stamps its time and asks the push function
-- to tell the trainee; clearing it sends nothing.
create or replace function public.on_trainer_comment()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  secret text;
begin
  if new.trainer_comment is not distinct from old.trainer_comment
     and new.trainer_comment_at is not distinct from old.trainer_comment_at then
    return new;
  end if;
  if not public.is_admin() then
    new.trainer_comment := old.trainer_comment;
    new.trainer_comment_at := old.trainer_comment_at;
    return new;
  end if;
  if new.trainer_comment is not distinct from old.trainer_comment then
    new.trainer_comment_at := old.trainer_comment_at;
    return new;
  end if;
  if coalesce(btrim(new.trainer_comment), '') = '' then
    new.trainer_comment_at := null;
    return new;
  end if;

  new.trainer_comment_at := now();
  -- The coach's own workouts need no notification.
  if new.user_id is distinct from auth.uid() then
    select value into secret from public.push_config where key = 'cron_secret';
    if secret is not null then
      perform net.http_post(
        url := 'https://hwdgjkiwanxluicdpndh.supabase.co/functions/v1/send-workout-reminders',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
        body := jsonb_build_object('feedback_session_id', new.id)
      );
    end if;
  end if;
  return new;
end;
$function$;

revoke execute on function public.on_trainer_comment() from public, anon, authenticated;

drop trigger if exists trg_trainer_comment on public.sessions;
create trigger trg_trainer_comment before update of trainer_comment, trainer_comment_at on public.sessions
  for each row execute function public.on_trainer_comment();

-- ===== 6e. Security round 3: two-step verification, invite-only sign-up (supabase-security-round3.sql) =====
-- ---------- 1. Signed-out visitors get nothing ----------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- The app's own functions (not the ones extensions such as pg_trgm put in
-- public): nobody gets them by default. Trigger functions fire without
-- EXECUTE, so nobody needs to call those directly.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- The functions the app and its RLS rules do call, signed in.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.nutrition_allowed() to authenticated;
grant execute on function public.photos_allowed() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.coach_roster(date) to authenticated;

-- ---------- 2. Two-step verification ----------
-- True when this session is good enough for this person: they passed the
-- second step, or they never turned it on.
create or replace function public.mfa_satisfied()
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    );
$function$;
revoke execute on function public.mfa_satisfied() from public, anon;
grant execute on function public.mfa_satisfied() to authenticated;

-- Coach powers need the second step. A coach session without it acts as a
-- plain signed-in user; the app sends the coach to set up two-step first.
create or replace function public.is_admin()
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$function$;

-- One restrictive rule per table: on top of the existing rules, never
-- instead of them. "(select ...)" makes Postgres check it once per query.
do $$
declare
  tb text;
begin
  foreach tb in array array[
    'admin_notifications', 'body_weight_logs', 'coach_goals', 'coach_notes', 'consents',
    'error_logs', 'exercises', 'food_favorites', 'food_logs', 'foods', 'global_exercises',
    'nutrition_targets', 'profiles', 'progress_photos', 'push_subscriptions', 'routines',
    'saved_meals', 'sessions', 'water_goals', 'water_logs', 'weekly_schedule'
  ] loop
    if to_regclass('public.' || tb) is null then continue; end if;
    execute format('drop policy if exists "two-step verification when enabled" on public.%I', tb);
    execute format(
      'create policy "two-step verification when enabled" on public.%I as restrictive for all to authenticated '
      'using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()))', tb);
  end loop;
end $$;

drop policy if exists "progress photos: two-step verification when enabled" on storage.objects;
create policy "progress photos: two-step verification when enabled" on storage.objects
  as restrictive for all to authenticated
  using (bucket_id <> 'progress-photos' or (select public.mfa_satisfied()))
  with check (bucket_id <> 'progress-photos' or (select public.mfa_satisfied()));

-- ---------- 3. Coach-only fields ----------
-- The old own-profile update rule read profiles from inside a profiles rule,
-- which Postgres calls infinite recursion once a second rule (the two-step
-- one) is on the table. protect_admin_flag() below already refuses any
-- change to the admin flag, so the rule only needs "your own row".
drop policy if exists "users update their own profile but not their admin flag" on public.profiles;
create policy "users update their own profile but not their admin flag" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Profiles: besides the admin and nutrition flags, a trainee can't change
-- the coach's inactivity alert setting for them or the email the coach sees.
create or replace function public.protect_admin_flag()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
    new.inactivity_alert_days := old.inactivity_alert_days;
    new.email := old.email;
  end if;
  return new;
end;
$function$;
revoke execute on function public.protect_admin_flag() from public, anon, authenticated;

-- Sessions: a trainee's new workout can't arrive with coach feedback or a
-- "reviewed" mark already on it, and a trainee can't mark their own workout
-- reviewed. (Feedback edits are already guarded by on_trainer_comment.)
create or replace function public.guard_session_coach_fields()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated') or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.trainer_comment := null;
    new.trainer_comment_at := null;
    new.trainer_comment_seen_at := null;
    new.reviewed_at := null;
  else
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end;
$function$;
revoke execute on function public.guard_session_coach_fields() from public, anon, authenticated;

drop trigger if exists trg_guard_session_coach_fields on public.sessions;
create trigger trg_guard_session_coach_fields before insert or update on public.sessions
  for each row execute function public.guard_session_coach_fields();

-- ---------- 4. error_logs can't be flooded ----------
drop policy if exists "anyone signed in can log their own error" on public.error_logs;
create policy "anyone signed in can log their own error" on public.error_logs
  for insert to authenticated with check (auth.uid() = user_id);

alter table public.error_logs drop constraint if exists error_logs_size_check;
alter table public.error_logs add constraint error_logs_size_check check (
  length(coalesce(message, '')) <= 2000 and length(coalesce(stack, '')) <= 4000
  and length(coalesce(component_stack, '')) <= 4000 and length(coalesce(url, '')) <= 500
) not valid;

create or replace function public.limit_error_logs()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if (select count(*) from public.error_logs
      where user_id = new.user_id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'TOO_MANY_ERROR_REPORTS' using errcode = '54000';
  end if;
  return new;
end;
$function$;
revoke execute on function public.limit_error_logs() from public, anon, authenticated;

drop trigger if exists trg_limit_error_logs on public.error_logs;
create trigger trg_limit_error_logs before insert on public.error_logs
  for each row execute function public.limit_error_logs();

-- ---------- 5. Invite-only sign-up ----------
create table if not exists public.signup_invites (
  email text not null,
  invited_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  constraint signup_invites_pkey primary key (email),
  constraint signup_invites_email_lower check (email = lower(btrim(email)))
);
alter table public.signup_invites enable row level security;
revoke all on public.signup_invites from anon;

drop policy if exists "admins manage invites" on public.signup_invites;
create policy "admins manage invites" on public.signup_invites
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "two-step verification when enabled" on public.signup_invites;
create policy "two-step verification when enabled" on public.signup_invites
  as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- Called by Supabase Auth before it creates any account (once the hook is
-- switched on). Lets in an email the coach invited in the last 30 days and
-- turns everyone else away.
create or replace function public.hook_signup_invite_only(event jsonb)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
begin
  if exists (
    select 1 from public.signup_invites
    where email = lower(btrim(event -> 'user' ->> 'email')) and expires_at > now()
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'message', 'Sign-up is by invitation only. Ask your coach for an invite link.',
    'http_code', 403));
end;
$function$;
revoke execute on function public.hook_signup_invite_only(jsonb) from public, anon, authenticated;
grant execute on function public.hook_signup_invite_only(jsonb) to supabase_auth_admin;

-- ===== 6d. Gym profiles (supabase-gyms.sql) =====
-- The PR alert above compares against the same gym only.
-- The extra gyms a person trains at. The main gym is not a row: it is the
-- "no gym" (null) on a workout, and its name lives on the profile.
create table if not exists public.gyms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create index if not exists gyms_user_idx on public.gyms (user_id);

alter table public.gyms enable row level security;
drop policy if exists "own or admin gyms" on public.gyms;
create policy "own or admin gyms" on public.gyms
  as permissive
  for all
  using ((auth.uid() = user_id) OR is_admin())
  with check ((auth.uid() = user_id) OR is_admin());

-- Which gym a workout was at (null = main gym). Removing a gym moves its
-- workouts back to the main gym rather than deleting them.
alter table public.sessions add column if not exists gym_id uuid references public.gyms(id) on delete set null;

-- The main gym's name; null shows as "Main gym".
alter table public.profiles add column if not exists main_gym_name text check (main_gym_name is null or char_length(main_gym_name) <= 60);

-- A workout can only point at one of its owner's own gyms.
create or replace function public.check_session_gym()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if NEW.gym_id is not null
    and not exists (select 1 from gyms where id = NEW.gym_id and user_id = NEW.user_id) then
    raise exception 'gym does not belong to this person';
  end if;
  return NEW;
end;
$function$;
drop trigger if exists trg_check_session_gym on public.sessions;
create trigger trg_check_session_gym before insert or update of gym_id on public.sessions
  for each row execute function public.check_session_gym();


-- ===== 6f. Rest timer alerts in the background (supabase-rest-timer-push.sql) =====
alter table public.push_subscriptions add column if not exists rest_ends_at timestamptz;
create index if not exists push_subscriptions_rest_due
  on public.push_subscriptions (rest_ends_at) where rest_ends_at is not null;

-- Takes the alerts that are due and clears them in the same statement, so
-- each one is sent once even if two runs overlap, and a rest the app
-- cancelled a moment earlier is no longer there to take. Only the push
-- function (service role) may call it.
create or replace function public.claim_due_rest_alerts()
 returns table (id uuid, endpoint text, p256dh text, auth text, lang text, ends_at timestamptz)
 language sql
 security definer
 set search_path to ''
as $function$
  with due as (
    select d.id, d.rest_ends_at from public.push_subscriptions d
     where d.rest_ends_at <= now()
     for update skip locked
  )
  update public.push_subscriptions s
     set rest_ends_at = null
    from due
   where s.id = due.id
  returning s.id, s.endpoint, s.p256dh, s.auth, s.lang, due.rest_ends_at;
$function$;
revoke execute on function public.claim_due_rest_alerts() from public, anon, authenticated;
grant execute on function public.claim_due_rest_alerts() to service_role;

-- Runs every 10 seconds, but only wakes the push function when a rest has
-- actually ended, so a quiet gym costs one indexed lookup.
create or replace function public.run_rest_alerts()
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  secret text;
begin
  if not exists (select 1 from public.push_subscriptions where rest_ends_at <= now()) then
    return;
  end if;
  select value into secret from public.push_config where key = 'cron_secret';
  if secret is null then return; end if;
  perform net.http_post(
    url := 'https://hwdgjkiwanxluicdpndh.supabase.co/functions/v1/send-workout-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{"rest_alerts": true}'::jsonb
  );
end;
$function$;
revoke execute on function public.run_rest_alerts() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'rest-timer-alerts') then
    perform cron.unschedule('rest-timer-alerts');
  end if;
  perform cron.schedule('rest-timer-alerts', '10 seconds', $job$select public.run_rest_alerts()$job$);
end $$;

-- ===== 6g. Coach tasks (supabase-coach-tasks.sql) =====
-- The coach enters a trainee's birthday on the trainee's coach page.
alter table public.coach_goals add column if not exists birthday date;

create table if not exists public.coach_tasks (
  id uuid primary key default gen_random_uuid(),
  -- null for a task the coach wrote that isn't about one trainee.
  trainee_id uuid references auth.users(id) on delete cascade,
  kind text not null check (kind in ('quiet', 'food', 'birthday', 'checkin', 'weigh', 'welcome', 'custom')),
  -- Only for 'custom': the coach's own words.
  title text check (length(title) between 1 and 300),
  -- One task per reason: e.g. 'quiet:2026-10-15' is one quiet spell, so a
  -- task the coach ticked off isn't created again the next morning.
  dedupe_key text unique,
  -- The day the reason started (last session, last food log, last weigh-in),
  -- so the task can close itself once something newer is logged.
  since date,
  -- Days quiet / days since food / age turning, depending on kind.
  n integer,
  due date not null default current_date,
  done_at timestamptz,
  auto_done boolean not null default false,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  check ((kind = 'custom') = (title is not null))
);
create index if not exists coach_tasks_open_idx on public.coach_tasks (done_at, due);
create index if not exists coach_tasks_trainee_idx on public.coach_tasks (trainee_id);

alter table public.coach_tasks enable row level security;
revoke all on public.coach_tasks from anon;
revoke truncate, references, trigger on public.coach_tasks from authenticated;
drop policy if exists "admins manage coach tasks" on public.coach_tasks;
create policy "admins manage coach tasks" on public.coach_tasks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Adds the tasks that are due as of p_today and closes the ones whose reason
-- went away. Returns how many tasks it added. The app calls it when the
-- People page opens (admins only); the morning job calls it too.
create or replace function public.refresh_coach_tasks(p_today date)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  added integer := 0;
  c integer;
begin
  -- Signed-in callers must be the coach; the cron job runs with no user.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
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
  where not p.is_admin and l.last is not null
    and p_today - l.last >= coalesce(p.inactivity_alert_days, 5)
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- Not logging food: nutrition on with a calorie target, account older than
  -- three days, and nothing logged in the last three finished days.
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, n, due)
  select p.id, 'food', 'food:' || p.id || ':' || coalesce(l.last::text, 'none'), l.last,
         case when l.last is null then null else p_today - l.last end, p_today
  from profiles p
  join nutrition_targets nt on nt.user_id = p.id and nt.kcal is not null
  join lateral (select max(f.date) as last from food_logs f where f.user_id = p.id and f.date < p_today) l on true
  where not p.is_admin and p.nutrition_enabled
    and p.created_at::date <= p_today - 3
    and (l.last is null or l.last < p_today - 3)
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- Birthday today (29 Feb birthdays on 28 Feb in other years).
  insert into coach_tasks (trainee_id, kind, dedupe_key, n, due)
  select g.trainee_id, 'birthday', 'birthday:' || g.trainee_id || ':' || extract(year from p_today),
         extract(year from age(p_today, g.birthday))::int, p_today
  from coach_goals g
  join profiles p on p.id = g.trainee_id and not p.is_admin
  where g.birthday is not null
    and (to_char(g.birthday, 'MM-DD') = to_char(p_today, 'MM-DD')
      or (to_char(g.birthday, 'MM-DD') = '02-29' and to_char(p_today, 'MM-DD') = '02-28'
          and extract(day from (date_trunc('year', p_today) + interval '1 month 28 days')) <> 29))
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- Check-in date reached (set on the trainee's coach page).
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, due)
  select g.trainee_id, 'checkin', 'checkin:' || g.trainee_id || ':' || g.next_checkin, g.next_checkin, g.next_checkin
  from coach_goals g
  join profiles p on p.id = g.trainee_id and not p.is_admin
  where g.next_checkin is not null and g.next_checkin <= p_today
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- No weigh-in for 14 days, for people who do weigh in.
  insert into coach_tasks (trainee_id, kind, dedupe_key, since, n, due)
  select p.id, 'weigh', 'weigh:' || p.id || ':' || l.last, l.last, p_today - l.last, p_today
  from profiles p
  join lateral (select max(b.date) as last from body_weight_logs b where b.user_id = p.id) l on true
  where not p.is_admin and l.last is not null and l.last <= p_today - 14
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  -- New trainee, three days in: see how the first week is going.
  insert into coach_tasks (trainee_id, kind, dedupe_key, due)
  select p.id, 'welcome', 'welcome:' || p.id, p_today
  from profiles p
  where not p.is_admin
    and p.created_at::date between p_today - 10 and p_today - 3
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; added := added + c;

  return added;
end;
$function$;

revoke execute on function public.refresh_coach_tasks(date) from public, anon;
grant execute on function public.refresh_coach_tasks(date) to authenticated;

-- The morning job: refresh, then tell the coach about tasks not yet sent.
-- App notification through the Edge Function when the coach has one turned
-- on (it marks the tasks as sent); otherwise ntfy, marked here.
create or replace function public.run_coach_tasks()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  secret text;
  pending integer;
begin
  perform refresh_coach_tasks(today);

  select count(*) into pending from coach_tasks where done_at is null and notified_at is null;
  if pending = 0 then return; end if;

  select value into secret from push_config where key = 'cron_secret';
  if secret is not null and exists (
    select 1 from push_subscriptions s join profiles p on p.id = s.user_id where p.is_admin
  ) then
    perform net.http_post(
      url := 'https://hwdgjkiwanxluicdpndh.supabase.co/functions/v1/send-workout-reminders',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
      body := jsonb_build_object('coach_tasks', true)
    );
  else
    perform send_admin_push(
      'Ironlog: ' || pending || ' משימות למאמן',
      'יש ' || pending || ' דברים חדשים שדורשים תשומת לב. פתחו את מסך המתאמנים.'
    );
    update coach_tasks set notified_at = now() where done_at is null and notified_at is null;
  end if;
end;
$function$;

revoke execute on function public.run_coach_tasks() from public, anon, authenticated;

-- 05:30 UTC: 08:30 in Israel in summer, 07:30 in winter.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'coach-tasks') then
    perform cron.unschedule('coach-tasks');
  end if;
  perform cron.schedule('coach-tasks', '30 5 * * *', $job$select public.run_coach_tasks()$job$);
end $$;

-- ===== 7. Verification (read-only) =====
-- RLS must be enabled on all 24 tables (rowsecurity = true on every row).
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- Every policy, with its command, roles and expressions.
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
