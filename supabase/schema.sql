


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."am_removed"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce((select removed_at is not null from public.profiles where id = auth.uid()), false);
$$;


ALTER FUNCTION "public"."am_removed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_owner_name"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(nullif(btrim(o.full_name), ''), 'Ironlog')
  from public.profiles o where o.is_admin order by o.created_at limit 1;
$$;


ALTER FUNCTION "public"."app_owner_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_coach"("p_person" "uuid", "p_coach" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_admin() then
    raise exception 'owner only' using errcode = '42501';
  end if;
  if p_person = auth.uid() or not public.can_coach(p_person) then
    raise exception 'not your trainee' using errcode = '42501';
  end if;
  update public.profiles set coach_id = p_coach where id = p_person;
end;
$$;


ALTER FUNCTION "public"."assign_coach"("p_person" "uuid", "p_coach" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_coach"("target" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2' and exists (
    select 1 from public.profiles me
    join public.profiles t on t.id = target
    where me.id = auth.uid() and me.removed_at is null
      and (me.is_admin or (me.is_coach and not me.coach_frozen))
      and (
        (me.is_admin and t.id = me.id)
        or (t.id <> me.id and not t.is_admin and not t.is_coach
            and (t.coach_id = me.id or (me.is_admin and t.coach_id is null)))
      )
  );
$$;


ALTER FUNCTION "public"."can_coach"("target" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_coach_folder"("folder" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
  select case
    when folder ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then public.can_coach(folder::uuid)
    else public.is_admin()
  end;
$_$;


ALTER FUNCTION "public"."can_coach_folder"("folder" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_for_new_prs"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
  detail_he text;
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
          detail_he := this_top || ' דק׳';
          if nullif(this_top_set->>'intensity', '') is not null then
            detail_text := detail_text || ' · intensity ' || (this_top_set->>'intensity');
            detail_he := detail_he || ' · עצימות ' || (this_top_set->>'intensity');
          end if;
          if nullif(this_top_set->>'distance', '') is not null then
            detail_text := detail_text || ' · ' || (this_top_set->>'distance') || ' ' || ex_unit;
            detail_he := detail_he || ' · ' || (this_top_set->>'distance') || ' ' || ex_unit;
          end if;
        elsif ex_bodyweight then
          detail_text := this_top || ' reps';
          detail_he := this_top || ' חזרות';
          if nullif(this_top_set->>'weight', '') is not null
            and (this_top_set->>'weight') ~ numeric_pattern
            and (this_top_set->>'weight')::numeric > 0 then
            detail_text := '+' || (this_top_set->>'weight') || ex_unit || ' × ' || detail_text;
            detail_he := '+' || (this_top_set->>'weight') || ex_unit || ' × ' || detail_he;
          end if;
        else
          detail_text := this_top || ex_unit;
          if nullif(this_top_set->>'reps', '') is not null then
            detail_text := detail_text || ' × ' || (this_top_set->>'reps');
          end if;
          detail_he := detail_text;
        end if;

        if public.owner_gets_alerts(NEW.user_id) then
        perform send_pr_alert(trainee_name, ex_name, detail_text, detail_he);
        else
          perform public.notify_coach_pr(NEW.user_id, ex_name || ' — ' || detail_text, ex_name || ' — ' || detail_he);
        end if;

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
          detail_he := 'שיא חזרות: ' || (reps_set->>'weight') || ex_unit || ' × ' || (reps_set->>'reps');

          if public.owner_gets_alerts(NEW.user_id) then
          perform send_pr_alert(trainee_name, ex_name, detail_text, detail_he);
          else
            perform public.notify_coach_pr(NEW.user_id, ex_name || ' — ' || detail_text, ex_name || ' — ' || detail_he);
          end if;

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
$_$;


ALTER FUNCTION "public"."check_for_new_prs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_inactive_trainees"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r record;
  last_date date;
  days_since integer;
  already_alerted boolean;
begin
  for r in
    select distinct p.id, coalesce(p.full_name, p.email) as name, p.inactivity_alert_days
    from profiles p
    where p.is_admin = false and not p.is_coach
      -- Other coaches' trainees are their coach's business (coach tasks).
      and public.owner_gets_alerts(p.id)
      and p.removed_at is null
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
$$;


ALTER FUNCTION "public"."check_inactive_trainees"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_session_gym"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if NEW.gym_id is not null
    and not exists (select 1 from gyms where id = NEW.gym_id and user_id = NEW.user_id) then
    raise exception 'gym does not belong to this person';
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."check_session_gym"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_due_rest_alerts"() RETURNS TABLE("id" "uuid", "endpoint" "text", "p256dh" "text", "auth" "text", "lang" "text", "ends_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."claim_due_rest_alerts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_changed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  -- An earlier "moved to you" was for the previous coach.
  update public.coach_tasks set done_at = now(), auto_done = true
   where trainee_id = new.id and kind = 'moved' and done_at is null;
  insert into public.coach_tasks (trainee_id, kind, dedupe_key, due)
  values (new.id, 'moved', 'moved:' || new.id || ':' || new.coach_id || ':' || current_date, current_date)
  on conflict (dedupe_key) do update set done_at = null, auto_done = false, notified_at = null;
  return new;
end;
$$;


ALTER FUNCTION "public"."coach_changed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_for"("p_user" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select case when p.is_admin or p.is_coach then p.id
              else coalesce(p.coach_id, (select o.id from public.profiles o where o.is_admin order by o.created_at limit 1))
         end
  from public.profiles p where p.id = p_user;
$$;


ALTER FUNCTION "public"."coach_for"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_has_room"("p_coach" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce((
    select c.is_admin or c.coach_trainee_limit is null
           or public.coach_trainee_count(c.id) < c.coach_trainee_limit
    from public.profiles c where c.id = p_coach), true);
$$;


ALTER FUNCTION "public"."coach_has_room"("p_coach" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_removed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if exists (select 1 from public.profiles t where t.coach_id = old.id and t.id <> old.id) then
    raise exception 'COACH_HAS_TRAINEES';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;


ALTER FUNCTION "public"."coach_removed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_roster"("p_today" "date") RETURNS TABLE("id" "uuid", "email" "text", "full_name" "text", "is_admin" boolean, "nutrition_enabled" boolean, "inactivity_alert_days" integer, "created_at" timestamp with time zone, "last_session" "date", "week_counts" integer[], "planned_per_week" integer, "to_review" integer, "last_weight" numeric, "weight_unit" "text", "last_weight_date" "date", "weight_change" numeric, "prs_7d" integer, "prs_30d" integer, "last_pr" "text", "food_days_7" integer, "kcal_avg_7" numeric, "protein_avg_7" numeric, "kcal_target" integer, "protein_target" numeric, "terms_version" integer, "terms_variant" "text", "terms_accepted_at" timestamp with time zone, "guardian_name" "text", "goal" "text", "target_weight" numeric, "next_checkin" "date", "pinned_note" "text", "is_coach" boolean, "coach_id" "uuid", "coach_name" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
declare
  week0 date := p_today - extract(dow from p_today)::int;
begin
  if not public.is_coach() then
    raise exception 'coaches only' using errcode = '42501';
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
    (select cn.body from coach_notes cn where cn.trainee_id = p.id and cn.pinned and cn.author_id = auth.uid()
      order by cn.created_at desc limit 1),
    p.is_coach, p.coach_id, coalesce(nullif(co.full_name, ''), co.email)
  from profiles p
  left join profiles co on co.id = p.coach_id
  left join coach_goals g on g.trainee_id = p.id and g.author_id = auth.uid()
  left join nutrition_targets nt on nt.user_id = p.id
  left join lateral (
    select b.weight, b.unit, b.date from body_weight_logs b
    where b.user_id = p.id order by b.date desc, b.created_at desc limit 1
  ) bw on true
  left join lateral (
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
  -- A coach sees themselves and their own trainees; the owner sees everyone.
  where p.id = auth.uid() or public.can_coach(p.id)
  order by coalesce(p.full_name, p.email);
end;
$$;


ALTER FUNCTION "public"."coach_roster"("p_today" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_row_author"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is not null then
    new.author_id := auth.uid();
  elsif new.author_id is null then
    new.author_id := coalesce(
      (select p.coach_id from public.profiles p where p.id = new.trainee_id),
      (select o.id from public.profiles o where o.is_admin order by o.created_at limit 1));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."coach_row_author"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_task_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.trainee_id is null and new.coach_id is null then
    new.coach_id := auth.uid();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."coach_task_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_task_skip_attention_off"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.trainee_id is not null and new.kind <> 'custom'
     and exists (
       select 1 from public.coach_settings cs
       where cs.coach_id = public.coach_for(new.trainee_id)
         and new.trainee_id = any(cs.attention_off)
     ) then
    return null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."coach_task_skip_attention_off"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_task_skip_removed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.trainee_id is not null
     and exists (select 1 from public.profiles p where p.id = new.trainee_id and p.removed_at is not null) then
    return null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."coach_task_skip_removed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_trainee_count"("p_coach" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select count(*)::integer from public.profiles t
  where t.coach_id = p_coach and t.id <> p_coach and t.removed_at is null;
$$;


ALTER FUNCTION "public"."coach_trainee_count"("p_coach" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_my_account"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if exists (select 1 from profiles where id = uid and is_admin) then
    raise exception 'ADMIN_CANNOT_SELF_DELETE';
  end if;
  if exists (select 1 from profiles where id = uid and is_coach) then
    raise exception 'COACH_CANNOT_SELF_DELETE';
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


ALTER FUNCTION "public"."delete_my_account"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_recovery_codes"() RETURNS "text"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := auth.uid();
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  codes text[] := '{}';
  raw text;
  bytes bytea;
  i int;
  j int;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'two-step code required' using errcode = '42501';
  end if;
  delete from public.mfa_recovery_codes where user_id = uid;
  for i in 1..10 loop
    bytes := extensions.gen_random_bytes(10);
    raw := '';
    for j in 0..9 loop
      raw := raw || substr(alphabet, (get_byte(bytes, j) % 32) + 1, 1);
    end loop;
    codes := codes || (substr(raw, 1, 5) || '-' || substr(raw, 6, 5));
    insert into public.mfa_recovery_codes (user_id, code_hash)
    values (uid, extensions.crypt(raw, extensions.gen_salt('bf')));
  end loop;
  return codes;
end;
$$;


ALTER FUNCTION "public"."generate_recovery_codes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_session_coach_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated') or public.can_coach(new.user_id) then
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
$$;


ALTER FUNCTION "public"."guard_session_coach_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, email, full_name, is_admin, coach_id)
  values (
    new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), false,
    coalesce(
      (select i.invited_by from public.signup_invites i
         join public.profiles c on c.id = i.invited_by and (c.is_admin or c.is_coach)
        where i.email = lower(btrim(new.email))),
      (select o.id from public.profiles o where o.is_admin order by o.created_at limit 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hook_signup_invite_only"("event" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  inviter uuid;
begin
  select i.invited_by into inviter from public.signup_invites i
   where i.email = lower(btrim(event -> 'user' ->> 'email')) and i.expires_at > now();
  if not found then
    return jsonb_build_object('error', jsonb_build_object(
      'message', 'Sign-up is by invitation only. Ask your coach for an invite link.',
      'http_code', 403));
  end if;
  if exists (select 1 from public.profiles c
             where c.id = inviter and c.is_coach and not c.is_admin
               and (c.coach_frozen or c.removed_at is not null or not public.coach_has_room(c.id))) then
    return jsonb_build_object('error', jsonb_build_object(
      'message', 'Your coach can''t take new trainees right now. Please ask them about it.',
      'http_code', 403));
  end if;
  return '{}'::jsonb;
end;
$$;


ALTER FUNCTION "public"."hook_signup_invite_only"("event" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."html_escape"("t" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select replace(replace(replace(replace(coalesce(t,''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;')
$$;


ALTER FUNCTION "public"."html_escape"("t" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_coach"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce((select is_admin or (is_coach and not coach_frozen and removed_at is null)
                   from public.profiles where id = auth.uid()), false)
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;


ALTER FUNCTION "public"."is_coach"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keep_coach_meals"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."keep_coach_meals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."limit_error_logs"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if (select count(*) from public.error_logs
      where user_id = new.user_id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'TOO_MANY_ERROR_REPORTS' using errcode = '54000';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."limit_error_logs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_coaches"() RETURNS TABLE("id" "uuid", "name" "text", "email" "text", "frozen" boolean, "trainees" integer, "trainee_limit" integer, "removed" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select p.id, coalesce(nullif(p.full_name, ''), p.email), p.email, p.coach_frozen,
         public.coach_trainee_count(p.id), p.coach_trainee_limit, p.removed_at is not null
  from public.profiles p
  where p.is_coach and not p.is_admin and public.is_admin()
  order by 2;
$$;


ALTER FUNCTION "public"."list_coaches"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_messages_read"("p_trainee" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  n integer;
begin
  if auth.uid() is null or not public.mfa_satisfied() then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_trainee = auth.uid() then
    update public.coach_messages
       set read_at = now()
     where trainee_id = p_trainee and sender_id <> auth.uid() and read_at is null;
  elsif public.can_coach(p_trainee) then
    update public.coach_messages
       set read_at = now()
     where trainee_id = p_trainee and sender_id = p_trainee and read_at is null;
  else
    raise exception 'not allowed' using errcode = '42501';
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;


ALTER FUNCTION "public"."mark_messages_read"("p_trainee" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."measurement_setup"("p_user" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."measurement_setup"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."messages_allowed"("p_trainee" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  -- Only answers for the trainee or their coach; anyone else gets true (the
  -- other insert policies still decide), so the flag never leaks.
  select not ((auth.uid() = p_trainee or public.can_coach(p_trainee))
    and coalesce((select messages_off from public.trainee_settings where user_id = p_trainee), false));
$$;


ALTER FUNCTION "public"."messages_allowed"("p_trainee" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mfa_satisfied"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    );
$$;


ALTER FUNCTION "public"."mfa_satisfied"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_brand"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce((
    select jsonb_build_object('name', cs.brand_name, 'color', cs.brand_color, 'logo', cs.brand_logo)
    from public.coach_settings cs where cs.coach_id = public.coach_for(auth.uid())), '{}'::jsonb);
$$;


ALTER FUNCTION "public"."my_brand"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_checkin_questions"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce((select cs.checkin_questions from public.coach_settings cs
                   where cs.coach_id = public.coach_for(auth.uid())), '[]'::jsonb);
$$;


ALTER FUNCTION "public"."my_checkin_questions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_coach"() RETURNS TABLE("name" "text", "contact" "text", "is_owner" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(nullif(c.full_name, ''), c.email), c.email, c.is_admin
  from public.profiles me join public.profiles c on c.id = me.coach_id
  where me.id = auth.uid();
$$;


ALTER FUNCTION "public"."my_coach"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_coach_limit"() RETURNS TABLE("trainees" integer, "trainee_limit" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select public.coach_trainee_count(p.id), p.coach_trainee_limit
  from public.profiles p
  where p.id = auth.uid() and p.is_coach and not p.is_admin and public.is_coach();
$$;


ALTER FUNCTION "public"."my_coach_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_coach_pr"("trainee" "uuid", "detail" "text", "detail_he" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."notify_coach_pr"("trainee" "uuid", "detail" "text", "detail_he" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."nutrition_allowed"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select is_admin or is_coach or nutrition_enabled from profiles where id = auth.uid()), false);
$$;


ALTER FUNCTION "public"."nutrition_allowed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_coach_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  secret text;
begin
  if exists (
    select 1 from public.coach_messages m
     where m.trainee_id = new.trainee_id and m.sender_id = new.sender_id
       and m.id <> new.id and m.read_at is null
       and m.created_at > now() - interval '60 seconds'
  ) then
    return null;
  end if;

  select value into secret from public.push_config where key = 'cron_secret';
  if secret is null then return null; end if;
  begin
    perform net.http_post(
      url := 'https://hwdgjkiwanxluicdpndh.supabase.co/functions/v1/send-workout-reminders',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
      body := jsonb_build_object('message_id', new.id)
    );
  exception when others then
    raise warning 'message push failed: %', sqlerrm;
  end;
  return null;
end;
$$;


ALTER FUNCTION "public"."on_coach_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_trainer_comment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  secret text;
begin
  if new.trainer_comment is not distinct from old.trainer_comment
     and new.trainer_comment_at is not distinct from old.trainer_comment_at then
    return new;
  end if;
  if not public.can_coach(new.user_id) then
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
$$;


ALTER FUNCTION "public"."on_trainer_comment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_gets_alerts"("trainee" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select not exists (
    select 1 from public.profiles t join public.profiles c on c.id = t.coach_id
    where t.id = trainee and c.is_coach and not c.is_admin
  );
$$;


ALTER FUNCTION "public"."owner_gets_alerts"("trainee" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owner_lang"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((
    select s.lang from push_subscriptions s join profiles p on p.id = s.user_id
    where p.is_admin order by s.updated_at desc limit 1
  ), 'he')
$$;


ALTER FUNCTION "public"."owner_lang"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."photos_allowed"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((
    select variant = 'granted' from consents
    where user_id = auth.uid() and doc_key = 'progress-photos'
    order by accepted_at desc limit 1
  ), false)
  and exists (
    select 1 from consents where user_id = auth.uid() and doc_key = 'training-terms'
  )
  and not exists (
    select 1 from consents where user_id = auth.uid() and doc_key = 'training-terms' and variant = 'minor'
  );
$$;


ALTER FUNCTION "public"."photos_allowed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_admin_flag"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Only requests that come through the app's public API (signed in or not)
  -- are checked. The SQL Editor and server-side jobs have no such role.
  if coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_admin := false;
    new.nutrition_enabled := false;
    new.is_coach := false;
    new.coach_id := null;
    new.coach_frozen := false;
    new.coach_trainee_limit := null;
    new.removed_at := null;
    new.removed_by := null;
  elsif public.is_admin() then
    -- Nobody becomes owner (or stops being one) through the app; that stays
    -- a SQL Editor change, so the owner can't create a second owner by mistake.
    if new.is_admin is distinct from old.is_admin then
      raise exception 'ADMIN_FLAG_PROTECTED';
    end if;
    -- A coach is nobody's trainee.
    if new.is_coach then
      new.coach_id := null;
    end if;
    -- Limits go through set_coach_limit(), removal through set_removed().
    if new.coach_trainee_limit is distinct from old.coach_trainee_limit
       and coalesce(current_setting('ironlog.set_coach_limit', true), '') <> 'on' then
      raise exception 'COACH_FIELDS_PROTECTED';
    end if;
    if (new.removed_at is distinct from old.removed_at or new.removed_by is distinct from old.removed_by)
       and coalesce(current_setting('ironlog.set_removed', true), '') <> 'on' then
      raise exception 'COACH_FIELDS_PROTECTED';
    end if;
    -- Freezing goes through set_coach_frozen(), never a plain update.
    if new.coach_frozen is distinct from old.coach_frozen
       and coalesce(current_setting('ironlog.set_coach_frozen', true), '') <> 'on' then
      raise exception 'COACH_FIELDS_PROTECTED';
    end if;
    -- A trainee's coach must be the owner or an active (not frozen) coach.
    if new.coach_id is distinct from old.coach_id and new.coach_id is not null and not exists (
      select 1 from public.profiles c where c.id = new.coach_id and (c.is_admin or (c.is_coach and not c.coach_frozen))) then
      raise exception 'NOT_A_COACH';
    end if;
    -- A coach who is removed can't take trainees, nor one at his limit.
    if new.coach_id is distinct from old.coach_id and new.coach_id is not null then
      if exists (select 1 from public.profiles c where c.id = new.coach_id and c.removed_at is not null) then
        raise exception 'NOT_A_COACH';
      end if;
      if not public.coach_has_room(new.coach_id) then
        raise exception 'COACH_LIMIT_REACHED';
      end if;
    end if;
  else
    if new.is_admin is distinct from old.is_admin then
      raise exception 'ADMIN_FLAG_PROTECTED';
    end if;
    -- The one coach-field change a coach may make: return_to_owner() hands
    -- their own trainee back to the owner.
    if coalesce(current_setting('ironlog.return_to_owner', true), '') = 'on'
       and new.is_coach is not distinct from old.is_coach
       and old.coach_id = auth.uid()
       and new.coach_id = (select o.id from public.profiles o where o.is_admin order by o.created_at limit 1)
       and new.coach_frozen is not distinct from old.coach_frozen then
      null;
    elsif new.is_coach is distinct from old.is_coach or new.coach_id is distinct from old.coach_id
       or new.coach_frozen is distinct from old.coach_frozen then
      raise exception 'COACH_FIELDS_PROTECTED';
    end if;
    -- A coach may remove or restore his own trainee, only through set_removed().
    if new.coach_trainee_limit is distinct from old.coach_trainee_limit
       or ((new.removed_at is distinct from old.removed_at or new.removed_by is distinct from old.removed_by)
           and coalesce(current_setting('ironlog.set_removed', true), '') <> 'on') then
      raise exception 'COACH_FIELDS_PROTECTED';
    end if;
    if not public.can_coach(old.id) then
      if new.nutrition_enabled is distinct from old.nutrition_enabled then
        raise exception 'NUTRITION_FLAG_PROTECTED';
      end if;
      new.inactivity_alert_days := old.inactivity_alert_days;
    end if;
    new.email := old.email;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_admin_flag"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_invite"("p_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  e text := lower(btrim(p_email));
  cur public.signup_invites%rowtype;
  holder uuid;
begin
  if not public.is_coach() then
    raise exception 'coaches only' using errcode = '42501';
  end if;
  if e is null or e !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    raise exception 'BAD_EMAIL' using errcode = '22023';
  end if;
  if not public.coach_has_room(auth.uid()) then
    raise exception 'COACH_LIMIT_REACHED' using errcode = '42501';
  end if;
  select * into cur from public.signup_invites where email = e;
  if found then
    -- Old invites with no inviter are the owner's.
    holder := coalesce(cur.invited_by, (select o.id from public.profiles o where o.is_admin order by o.created_at limit 1));
    if holder is distinct from auth.uid() and cur.expires_at > now()
       and exists (select 1 from public.profiles c where c.id = holder and (c.is_admin or c.is_coach)) then
      raise exception 'INVITED_BY_OTHER_COACH' using errcode = '42501';
    end if;
  end if;
  insert into public.signup_invites (email, invited_by, created_at, expires_at)
  values (e, auth.uid(), now(), now() + interval '30 days')
  on conflict (email) do update
    set invited_by = excluded.invited_by, created_at = excluded.created_at, expires_at = excluded.expires_at;
end;
$_$;


ALTER FUNCTION "public"."record_invite"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recovery_codes_left"() RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select count(*)::int from public.mfa_recovery_codes
  where user_id = auth.uid() and used_at is null;
$$;


ALTER FUNCTION "public"."recovery_codes_left"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_coach_tasks"("p_today" "date") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."refresh_coach_tasks"("p_today" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."return_to_owner"("p_person" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_coach() or public.is_admin() or not public.can_coach(p_person) then
    raise exception 'not your trainee' using errcode = '42501';
  end if;
  perform set_config('ironlog.return_to_owner', 'on', true);
  update public.profiles
     set coach_id = (select o.id from public.profiles o where o.is_admin order by o.created_at limit 1)
   where id = p_person;
  perform set_config('ironlog.return_to_owner', '', true);
end;
$$;


ALTER FUNCTION "public"."return_to_owner"("p_person" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_coach_tasks"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  secret text;
  pending integer;
begin
  perform refresh_coach_tasks(today);

  select count(*) into pending from coach_tasks where done_at is null and notified_at is null;
  if pending = 0 then return; end if;

  select value into secret from push_config where key = 'cron_secret';
  -- The function sends each coach their own trainees' tasks, and falls back
  -- to ntfy (the owner's phone) for the owner's tasks.
  if secret is not null and exists (
    select 1 from push_subscriptions s join profiles p on p.id = s.user_id where p.is_admin or p.is_coach
  ) then
    perform net.http_post(
      url := 'https://hwdgjkiwanxluicdpndh.supabase.co/functions/v1/send-workout-reminders',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
      body := jsonb_build_object('coach_tasks', true)
    );
  else
    select count(*) into pending from coach_tasks
      where done_at is null and notified_at is null
        and case when trainee_id is null
          then coach_id in (select id from profiles where is_admin)
          else public.owner_gets_alerts(trainee_id) end;
    if pending = 0 then return; end if;
    perform send_admin_push(
      'Ironlog: ' || case when pending = 1 then 'משימה חדשה אחת' else pending || ' משימות חדשות' end,
      case when pending = 1 then 'יש דבר חדש אחד שדורש תשומת לב.' else 'יש ' || pending || ' דברים חדשים שדורשים תשומת לב.' end || ' פתחו את מסך המתאמנים.'
    );
    update coach_tasks set notified_at = now() where done_at is null and notified_at is null
      and case when trainee_id is null
          then coach_id in (select id from profiles where is_admin)
          else public.owner_gets_alerts(trainee_id) end;
  end if;
end;
$$;


ALTER FUNCTION "public"."run_coach_tasks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_photo_purge"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."run_photo_purge"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_rest_alerts"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."run_rest_alerts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_workout_reminders"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."run_workout_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_admin_email"("p_subject" "text", "p_html" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."send_admin_email"("p_subject" "text", "p_html" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_admin_push"("p_title" "text", "p_message" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."send_admin_push"("p_title" "text", "p_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_pr_alert"("trainee_name" "text", "ex_name" "text", "detail_en" "text", "detail_he" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."send_pr_alert"("trainee_name" "text", "ex_name" "text", "detail_en" "text", "detail_he" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_routine_to_coach"("p_routine" "uuid", "p_coach" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  r public.routines%rowtype;
  src public.exercises%rowtype;
  it jsonb;
  v_name text;
  v_cat text;
  m uuid;
  items jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'owner only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles c where c.id = p_coach and c.is_coach and not c.is_admin) then
    raise exception 'NOT_A_COACH' using errcode = '42501';
  end if;
  select * into r from public.routines where id = p_routine and user_id = auth.uid();
  if not found then
    raise exception 'not your routine' using errcode = '42501';
  end if;
  for it in select * from jsonb_array_elements(coalesce(r.exercises, '[]'::jsonb)) loop
    src := null;
    if coalesce(it ->> 'exerciseId', '') ~ '^[0-9a-fA-F-]{36}$' then
      select * into src from public.exercises e where e.id = (it ->> 'exerciseId')::uuid and e.user_id = auth.uid();
    end if;
    v_name := coalesce(src.name, it ->> 'name');
    v_cat := coalesce(src.category, it ->> 'category', r.category, 'strength');
    m := null;
    if v_name is not null then
      select e.id into m from public.exercises e
       where e.user_id = p_coach and e.category = v_cat
         and lower(regexp_replace(btrim(e.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(v_name), '\s+', ' ', 'g'))
       order by e.created_at limit 1;
      if m is null then
        insert into public.exercises (user_id, name, name_he, category, unit, bodyweight, timed, intensity_type,
                                      track_rir, rest_seconds, video_url, notes, clip)
        values (p_coach, v_name, src.name_he, v_cat,
                coalesce(src.unit, it ->> 'unit', 'kg'),
                coalesce(src.bodyweight, (it ->> 'bodyweight')::boolean, false),
                coalesce(src.timed, (it ->> 'timed')::boolean, false),
                coalesce(src.intensity_type, it ->> 'intensityType', 'rpe'),
                coalesce(src.track_rir, false), src.rest_seconds,
                coalesce(src.video_url, it ->> 'videoUrl', ''), coalesce(src.notes, ''), src.clip)
        returning id into m;
      end if;
      it := it || jsonb_build_object('exerciseId', m, 'name', v_name);
    end if;
    items := items || jsonb_build_array(it);
  end loop;
  insert into public.routines (user_id, name, category, exercises) values (p_coach, r.name, r.category, items);
end;
$_$;


ALTER FUNCTION "public"."send_routine_to_coach"("p_routine" "uuid", "p_coach" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_coach"("p_person" "uuid", "p_on" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_admin() then
    raise exception 'owner only' using errcode = '42501';
  end if;
  if p_on and (p_person = auth.uid() or not public.can_coach(p_person)) then
    raise exception 'not your trainee' using errcode = '42501';
  end if;
  if not p_on and not exists (select 1 from public.profiles where id = p_person and is_coach) then
    raise exception 'not a coach' using errcode = '42501';
  end if;
  if not p_on and exists (select 1 from public.profiles where coach_id = p_person and id <> p_person) then
    raise exception 'COACH_HAS_TRAINEES' using errcode = '42501';
  end if;
  perform set_config('ironlog.set_coach_frozen', 'on', true);
  update public.profiles set is_coach = p_on, coach_frozen = false where id = p_person and not is_admin;
  perform set_config('ironlog.set_coach_frozen', '', true);
  -- A new coach edits their own nutrition targets; targets the owner set
  -- while they were a trainee would otherwise stay locked to them.
  if p_on then
    update public.nutrition_targets set set_by = 'self' where user_id = p_person and set_by = 'coach';
  end if;
end;
$$;


ALTER FUNCTION "public"."set_coach"("p_person" "uuid", "p_on" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_coach_frozen"("p_coach" "uuid", "p_frozen" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_admin() then
    raise exception 'owner only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_coach and is_coach and not is_admin) then
    raise exception 'not a coach' using errcode = '42501';
  end if;
  perform set_config('ironlog.set_coach_frozen', 'on', true);
  update public.profiles set coach_frozen = p_frozen where id = p_coach;
  perform set_config('ironlog.set_coach_frozen', '', true);
end;
$$;


ALTER FUNCTION "public"."set_coach_frozen"("p_coach" "uuid", "p_frozen" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_coach_limit"("p_coach" "uuid", "p_limit" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_admin() then
    raise exception 'owner only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_coach and is_coach and not is_admin) then
    raise exception 'not a coach' using errcode = '42501';
  end if;
  if p_limit is not null and p_limit < 0 then
    raise exception 'BAD_LIMIT' using errcode = '22023';
  end if;
  perform set_config('ironlog.set_coach_limit', 'on', true);
  update public.profiles set coach_trainee_limit = p_limit where id = p_coach;
  perform set_config('ironlog.set_coach_limit', '', true);
end;
$$;


ALTER FUNCTION "public"."set_coach_limit"("p_coach" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_removed"("p_person" "uuid", "p_removed" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  t public.profiles%rowtype;
begin
  select * into t from public.profiles where id = p_person;
  if not found or t.is_admin or p_person = auth.uid() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not (
    (public.is_admin() and t.is_coach)
    or (public.is_coach() and not t.is_coach and public.can_coach(p_person))
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Restoring a trainee counts towards their coach's limit again.
  if not p_removed and t.removed_at is not null and t.coach_id is not null and not t.is_coach
     and not public.coach_has_room(t.coach_id) then
    raise exception 'COACH_LIMIT_REACHED' using errcode = '42501';
  end if;
  perform set_config('ironlog.set_removed', 'on', true);
  update public.profiles
     set removed_at = case when p_removed then coalesce(removed_at, now()) end,
         removed_by = case when p_removed then coalesce(removed_by, auth.uid()) end
   where id = p_person;
  perform set_config('ironlog.set_removed', '', true);
  if p_removed then
    -- No more pushes to them, and nothing left on anyone's To do about them.
    delete from public.push_subscriptions where user_id = p_person;
    update public.coach_tasks set done_at = now(), auto_done = true
     where trainee_id = p_person and done_at is null;
  end if;
end;
$$;


ALTER FUNCTION "public"."set_removed"("p_person" "uuid", "p_removed" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."use_recovery_code"("code" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := auth.uid();
  norm text;
  hit uuid;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mfa_recovery:' || uid::text, 0));
  delete from public.mfa_recovery_attempts where created_at < now() - interval '1 day';
  if (select count(*) from public.mfa_recovery_attempts
      where user_id = uid and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many_attempts' using errcode = '54000';
  end if;
  norm := upper(regexp_replace(coalesce(code, ''), '[\s-]', '', 'g'));
  select c.id into hit
  from public.mfa_recovery_codes c
  where c.user_id = uid and c.used_at is null
    and c.code_hash = extensions.crypt(norm, c.code_hash)
  limit 1;
  if hit is null then
    insert into public.mfa_recovery_attempts (user_id) values (uid);
    return false;
  end if;
  update public.mfa_recovery_codes set used_at = now() where id = hit;
  delete from public.mfa_recovery_attempts where user_id = uid;
  delete from auth.mfa_factors where user_id = uid;
  return true;
end;
$$;


ALTER FUNCTION "public"."use_recovery_code"("code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."valid_checkin_questions"("p" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $_$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 12 and not exists (
    select 1 from jsonb_array_elements(p) q
    where jsonb_typeof(q) <> 'object'
       or coalesce(q ->> 'id', '') !~ '^[a-z0-9_-]{1,40}$'
       or coalesce(q ->> 'type', '') not in ('scale', 'number', 'text')
       or (coalesce(btrim(q ->> 'en'), '') = '' and coalesce(btrim(q ->> 'he'), '') = '')
       or char_length(coalesce(q ->> 'en', '')) > 200
       or char_length(coalesce(q ->> 'he', '')) > 200);
$_$;


ALTER FUNCTION "public"."valid_checkin_questions"("p" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."valid_meal_layout"("p" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."valid_meal_layout"("p" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."valid_measurement_kinds"("p_kinds" "text"[]) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $_$
  select coalesce(array_length(p_kinds, 1), 0) <= 30 and not exists (
    select 1 from unnest(p_kinds) k
    where k !~ '^(waist|hips|chest|upper_arm|thigh|calf|neck|body_fat|c_[0-9a-f-]{36})$');
$_$;


ALTER FUNCTION "public"."valid_measurement_kinds"("p_kinds" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."valid_snippets"("p" "text"[]) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select coalesce(array_length(p, 1), 0) <= 30
     and not exists (select 1 from unnest(p) s where char_length(s) not between 1 and 500);
$$;


ALTER FUNCTION "public"."valid_snippets"("p" "text"[]) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "trainee_id" "uuid",
    "detail" "text",
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_notifications_type_check" CHECK (("type" = ANY (ARRAY['pr'::"text", 'inactivity'::"text"])))
);


ALTER TABLE "public"."admin_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."body_measurements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "kind" "text" NOT NULL,
    "value" numeric NOT NULL,
    "unit" "text" DEFAULT 'cm'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "body_measurements_kind_check" CHECK (("kind" ~ '^(hips|chest|upper_arm|thigh|calf|neck|body_fat|c_[0-9a-f-]{36})$'::"text")),
    CONSTRAINT "body_measurements_unit_check" CHECK (("unit" = ANY (ARRAY['cm'::"text", 'in'::"text", '%'::"text", ''::"text"]))),
    CONSTRAINT "body_measurements_value_check" CHECK ((("value" >= (0)::numeric) AND ("value" < (10000)::numeric)))
);


ALTER TABLE "public"."body_measurements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."body_weight_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "weight" numeric NOT NULL,
    "unit" "text" DEFAULT 'kg'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."body_weight_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkin_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "answers" "jsonb" NOT NULL,
    "questions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "checkin_answers_answers_check" CHECK ((("jsonb_typeof"("answers") = 'object'::"text") AND ("pg_column_size"("answers") < 20000))),
    CONSTRAINT "checkin_answers_questions_check" CHECK ((("jsonb_typeof"("questions") = 'array'::"text") AND ("pg_column_size"("questions") < 20000)))
);


ALTER TABLE "public"."checkin_answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_goals" (
    "trainee_id" "uuid" NOT NULL,
    "goal" "text",
    "target_weight" numeric,
    "sessions_per_week" smallint,
    "next_checkin" "date",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "birthday" "date",
    "author_id" "uuid" NOT NULL,
    CONSTRAINT "coach_goals_goal_check" CHECK (("length"("goal") <= 300)),
    CONSTRAINT "coach_goals_sessions_per_week_check" CHECK ((("sessions_per_week" >= 1) AND ("sessions_per_week" <= 14))),
    CONSTRAINT "coach_goals_target_weight_check" CHECK ((("target_weight" > (0)::numeric) AND ("target_weight" < (500)::numeric)))
);


ALTER TABLE "public"."coach_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trainee_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone,
    CONSTRAINT "coach_messages_body_check" CHECK ((("length"("body") >= 1) AND ("length"("body") <= 2000)))
);


ALTER TABLE "public"."coach_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trainee_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "author_id" "uuid" NOT NULL,
    CONSTRAINT "coach_notes_body_check" CHECK ((("length"("body") >= 1) AND ("length"("body") <= 4000)))
);


ALTER TABLE "public"."coach_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_settings" (
    "coach_id" "uuid" NOT NULL,
    "default_measurements" "text"[] DEFAULT '{waist}'::"text"[] NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tasks_off" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "weigh_days" integer DEFAULT 14 NOT NULL,
    "food_days" integer DEFAULT 3 NOT NULL,
    "behind_pct" integer DEFAULT 60 NOT NULL,
    "checkin_days" integer DEFAULT 7 NOT NULL,
    "pr_alerts" boolean DEFAULT true NOT NULL,
    "snippets" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "invite_text" "text",
    "checkin_questions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "brand_name" "text",
    "brand_color" "text",
    "brand_logo" "text",
    "attention_off" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "priority" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    CONSTRAINT "coach_settings_brand_check" CHECK (((("brand_name" IS NULL) OR (("char_length"("brand_name") >= 1) AND ("char_length"("brand_name") <= 40))) AND (("brand_color" IS NULL) OR ("brand_color" = ANY (ARRAY['ember'::"text", 'red'::"text", 'gold'::"text", 'lime'::"text", 'green'::"text", 'mint'::"text", 'teal'::"text", 'sky'::"text", 'royal'::"text", 'navy'::"text", 'violet'::"text", 'purple'::"text", 'pink'::"text", 'grey'::"text", 'mono'::"text"])) OR ("brand_color" ~ '^#[0-9A-Fa-f]{6}$'::"text")) AND (("brand_logo" IS NULL) OR (("brand_logo" ~ '^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$'::"text") AND ("char_length"("brand_logo") < 120000))))),
    CONSTRAINT "coach_settings_checkin_check" CHECK ("public"."valid_checkin_questions"("checkin_questions")),
    CONSTRAINT "coach_settings_extras_check" CHECK (("public"."valid_snippets"("snippets") AND (("invite_text" IS NULL) OR ("char_length"("invite_text") <= 1000)))),
    CONSTRAINT "coach_settings_measurements_check" CHECK ("public"."valid_measurement_kinds"("default_measurements")),
    CONSTRAINT "coach_settings_prefs_check" CHECK ((("tasks_off" <@ ARRAY['quiet'::"text", 'food'::"text", 'birthday'::"text", 'checkin'::"text", 'weigh'::"text", 'welcome'::"text"]) AND (("weigh_days" >= 3) AND ("weigh_days" <= 90)) AND (("food_days" >= 1) AND ("food_days" <= 30)) AND (("behind_pct" >= 10) AND ("behind_pct" <= 100)) AND (("checkin_days" >= 1) AND ("checkin_days" <= 90))))
);


ALTER TABLE "public"."coach_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trainee_id" "uuid",
    "kind" "text" NOT NULL,
    "title" "text",
    "dedupe_key" "text",
    "since" "date",
    "n" integer,
    "due" "date" DEFAULT CURRENT_DATE NOT NULL,
    "done_at" timestamp with time zone,
    "auto_done" boolean DEFAULT false NOT NULL,
    "notified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "coach_id" "uuid",
    CONSTRAINT "coach_tasks_check" CHECK ((("kind" = 'custom'::"text") = ("title" IS NOT NULL))),
    CONSTRAINT "coach_tasks_kind_check" CHECK (("kind" = ANY (ARRAY['quiet'::"text", 'food'::"text", 'birthday'::"text", 'checkin'::"text", 'weigh'::"text", 'welcome'::"text", 'custom'::"text", 'moved'::"text"]))),
    CONSTRAINT "coach_tasks_title_check" CHECK ((("length"("title") >= 1) AND ("length"("title") <= 300)))
);


ALTER TABLE "public"."coach_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "doc_key" "text" NOT NULL,
    "version" integer NOT NULL,
    "variant" "text" NOT NULL,
    "lang" "text" NOT NULL,
    "text_sha256" "text" NOT NULL,
    "guardian_name" "text",
    "guardian_contact" "text",
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."consents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."error_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "message" "text",
    "stack" "text",
    "component_stack" "text",
    "url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."error_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'strength'::"text" NOT NULL,
    "video_url" "text" DEFAULT ''::"text",
    "notes" "text" DEFAULT ''::"text",
    "unit" "text" DEFAULT 'kg'::"text" NOT NULL,
    "last_weight" numeric,
    "last_reps" integer,
    "last_date" "date",
    "last_sets" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bodyweight" boolean DEFAULT false NOT NULL,
    "intensity_type" "text" DEFAULT 'rpe'::"text" NOT NULL,
    "last_distance" numeric,
    "name_he" "text",
    "track_rir" boolean DEFAULT false NOT NULL,
    "last_note" "text",
    "last_note_date" "date",
    "timed" boolean DEFAULT false NOT NULL,
    "rest_seconds" integer,
    "clip" "text",
    CONSTRAINT "exercises_category_check" CHECK (("category" = ANY (ARRAY['strength'::"text", 'mobility'::"text", 'cardio'::"text"]))),
    CONSTRAINT "exercises_clip_check" CHECK ((("clip" IS NULL) OR ("clip" ~ '^[a-z0-9-]{1,80}$'::"text"))),
    CONSTRAINT "exercises_intensity_type_check" CHECK (("intensity_type" = ANY (ARRAY['rpe'::"text", 'hr_zone'::"text"]))),
    CONSTRAINT "exercises_rest_seconds_check" CHECK ((("rest_seconds" IS NULL) OR (("rest_seconds" >= 5) AND ("rest_seconds" <= 3600))))
);


ALTER TABLE "public"."exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."food_favorites" (
    "user_id" "uuid" NOT NULL,
    "food_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."food_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."food_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "meal" "text" NOT NULL,
    "food_id" "uuid",
    "name" "text" NOT NULL,
    "grams" numeric,
    "unit_label" "text",
    "unit_qty" numeric,
    "kcal" numeric NOT NULL,
    "protein" numeric DEFAULT 0 NOT NULL,
    "carbs" numeric DEFAULT 0 NOT NULL,
    "fat" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fiber" numeric,
    CONSTRAINT "food_logs_carbs_check" CHECK (("carbs" >= (0)::numeric)),
    CONSTRAINT "food_logs_fat_check" CHECK (("fat" >= (0)::numeric)),
    CONSTRAINT "food_logs_fiber_check" CHECK (("fiber" >= (0)::numeric)),
    CONSTRAINT "food_logs_grams_check" CHECK (("grams" > (0)::numeric)),
    CONSTRAINT "food_logs_kcal_check" CHECK (("kcal" >= (0)::numeric)),
    CONSTRAINT "food_logs_meal_check" CHECK (("meal" = ANY (ARRAY['breakfast'::"text", 'lunch'::"text", 'dinner'::"text", 'snack'::"text", 'snack2'::"text", 'snack3'::"text"]))),
    CONSTRAINT "food_logs_protein_check" CHECK (("protein" >= (0)::numeric))
);


ALTER TABLE "public"."food_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."foods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "source_ref" "text",
    "barcode" "text",
    "name_he" "text",
    "name_en" "text",
    "brand" "text",
    "kcal" numeric NOT NULL,
    "protein" numeric DEFAULT 0 NOT NULL,
    "carbs" numeric DEFAULT 0 NOT NULL,
    "fat" numeric DEFAULT 0 NOT NULL,
    "fiber" numeric,
    "units" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "search_text" "text" DEFAULT ''::"text" NOT NULL,
    "verified" boolean DEFAULT false NOT NULL,
    "label_photo_path" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "foods_barcode_check" CHECK (("barcode" ~ '^[0-9]{8,14}$'::"text")),
    CONSTRAINT "foods_carbs_check" CHECK ((("carbs" >= (0)::numeric) AND ("carbs" <= (100)::numeric))),
    CONSTRAINT "foods_check" CHECK ((COALESCE("name_he", "name_en") IS NOT NULL)),
    CONSTRAINT "foods_fat_check" CHECK ((("fat" >= (0)::numeric) AND ("fat" <= (100)::numeric))),
    CONSTRAINT "foods_fiber_check" CHECK ((("fiber" >= (0)::numeric) AND ("fiber" <= (100)::numeric))),
    CONSTRAINT "foods_kcal_check" CHECK ((("kcal" >= (0)::numeric) AND ("kcal" <= (900)::numeric))),
    CONSTRAINT "foods_protein_check" CHECK ((("protein" >= (0)::numeric) AND ("protein" <= (100)::numeric))),
    CONSTRAINT "foods_source_check" CHECK (("source" = ANY (ARRAY['moh'::"text", 'usda'::"text", 'off'::"text", 'user'::"text", 'coach'::"text"])))
);


ALTER TABLE "public"."foods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."global_exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'strength'::"text" NOT NULL,
    "unit" "text" DEFAULT 'kg'::"text" NOT NULL,
    "bodyweight" boolean DEFAULT false NOT NULL,
    "notes" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "intensity_type" "text" DEFAULT 'rpe'::"text" NOT NULL,
    "name_he" "text",
    CONSTRAINT "global_exercises_category_check" CHECK (("category" = ANY (ARRAY['strength'::"text", 'mobility'::"text", 'cardio'::"text"]))),
    CONSTRAINT "global_exercises_intensity_type_check" CHECK (("intensity_type" = ANY (ARRAY['rpe'::"text", 'hr_zone'::"text"])))
);


ALTER TABLE "public"."global_exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gyms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gyms_name_check" CHECK ((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 60)))
);


ALTER TABLE "public"."gyms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."measurement_settings" (
    "user_id" "uuid" NOT NULL,
    "kinds" "text"[] DEFAULT '{waist}'::"text"[] NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "measurement_settings_kinds_check" CHECK ("public"."valid_measurement_kinds"("kinds"))
);


ALTER TABLE "public"."measurement_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."measurement_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "label_en" "text",
    "label_he" "text",
    "unit_kind" "text" NOT NULL,
    "archived" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "measurement_types_label_en_check" CHECK ((("label_en" IS NULL) OR ("char_length"("label_en") <= 40))),
    CONSTRAINT "measurement_types_label_he_check" CHECK ((("label_he" IS NULL) OR ("char_length"("label_he") <= 40))),
    CONSTRAINT "measurement_types_named" CHECK (((COALESCE("btrim"("label_en"), ''::"text") <> ''::"text") OR (COALESCE("btrim"("label_he"), ''::"text") <> ''::"text"))),
    CONSTRAINT "measurement_types_unit_kind_check" CHECK (("unit_kind" = ANY (ARRAY['length'::"text", 'percent'::"text", 'number'::"text"])))
);


ALTER TABLE "public"."measurement_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mfa_recovery_attempts" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mfa_recovery_attempts" OWNER TO "postgres";


ALTER TABLE "public"."mfa_recovery_attempts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."mfa_recovery_attempts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."mfa_recovery_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "code_hash" "text" NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mfa_recovery_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutrition_targets" (
    "user_id" "uuid" NOT NULL,
    "kcal" integer,
    "protein" numeric(6,1),
    "carbs" numeric(6,1),
    "fat" numeric(6,1),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "set_by" "text" DEFAULT 'coach'::"text" NOT NULL,
    "fiber" numeric,
    "kcal_band" integer DEFAULT 10 NOT NULL,
    "meals" "jsonb",
    CONSTRAINT "nutrition_targets_carbs_check" CHECK (("carbs" >= (0)::numeric)),
    CONSTRAINT "nutrition_targets_fat_check" CHECK (("fat" >= (0)::numeric)),
    CONSTRAINT "nutrition_targets_fiber_check" CHECK ((("fiber" IS NULL) OR (("fiber" > (0)::numeric) AND ("fiber" < (200)::numeric)))),
    CONSTRAINT "nutrition_targets_kcal_band_check" CHECK ((("kcal_band" >= 5) AND ("kcal_band" <= 25))),
    CONSTRAINT "nutrition_targets_kcal_check" CHECK (("kcal" > 0)),
    CONSTRAINT "nutrition_targets_meals_check" CHECK ("public"."valid_meal_layout"("meals")),
    CONSTRAINT "nutrition_targets_protein_check" CHECK (("protein" >= (0)::numeric)),
    CONSTRAINT "nutrition_targets_set_by_check" CHECK (("set_by" = ANY (ARRAY['coach'::"text", 'self'::"text"])))
);


ALTER TABLE "public"."nutrition_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "is_admin" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "inactivity_alert_days" integer DEFAULT 5 NOT NULL,
    "dashboard_style" "text" DEFAULT 'cards'::"text" NOT NULL,
    "nutrition_enabled" boolean DEFAULT false NOT NULL,
    "main_gym_name" "text",
    "is_coach" boolean DEFAULT false NOT NULL,
    "coach_id" "uuid",
    "coach_frozen" boolean DEFAULT false NOT NULL,
    "birthday" "date",
    "coach_trainee_limit" integer,
    "removed_at" timestamp with time zone,
    "removed_by" "uuid",
    CONSTRAINT "profiles_coach_trainee_limit_check" CHECK ((("coach_trainee_limit" IS NULL) OR ("coach_trainee_limit" >= 0))),
    CONSTRAINT "profiles_main_gym_name_check" CHECK ((("main_gym_name" IS NULL) OR ("char_length"("main_gym_name") <= 60)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."progress_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "taken_on" "date" NOT NULL,
    "angle" "text" NOT NULL,
    "path" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "thumb_path" "text",
    CONSTRAINT "progress_photos_angle_check" CHECK (("angle" = ANY (ARRAY['front'::"text", 'side'::"text", 'back'::"text"]))),
    CONSTRAINT "progress_photos_path_owner" CHECK (("path" ~~ (("user_id")::"text" || '/%'::"text"))),
    CONSTRAINT "progress_photos_thumb_owner" CHECK ((("thumb_path" IS NULL) OR ("thumb_path" ~~ (("user_id")::"text" || '/%'::"text"))))
);


ALTER TABLE "public"."progress_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_config" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL
);


ALTER TABLE "public"."push_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "remind_time" time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    "tz" "text" DEFAULT 'UTC'::"text" NOT NULL,
    "lang" "text" DEFAULT 'en'::"text" NOT NULL,
    "last_sent_date" "date",
    "last_test_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rest_ends_at" timestamp with time zone,
    "remind_days" smallint[] DEFAULT '{0,1,2,3,4,5,6}'::smallint[] NOT NULL,
    CONSTRAINT "push_subscriptions_endpoint_check" CHECK (("endpoint" ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'::"text")),
    CONSTRAINT "push_subscriptions_lang_check" CHECK (("lang" = ANY (ARRAY['en'::"text", 'he'::"text"]))),
    CONSTRAINT "push_subscriptions_remind_days_check" CHECK ((("remind_days" <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint]) AND ("cardinality"("remind_days") >= 1)))
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."routines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'strength'::"text" NOT NULL,
    "exercises" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "routines_category_check" CHECK (("category" = ANY (ARRAY['strength'::"text", 'mobility'::"text", 'cardio'::"text"])))
);


ALTER TABLE "public"."routines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_meals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."saved_meals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "routine_id" "uuid",
    "routine_name" "text" DEFAULT 'Freestyle'::"text" NOT NULL,
    "category" "text" DEFAULT 'strength'::"text" NOT NULL,
    "date" "date" NOT NULL,
    "notes" "text" DEFAULT ''::"text",
    "entries" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trainer_comment" "text",
    "started_at" timestamp with time zone,
    "duration_minutes" integer,
    "reviewed_at" timestamp with time zone,
    "trainer_comment_at" timestamp with time zone,
    "trainer_comment_seen_at" timestamp with time zone,
    "gym_id" "uuid",
    CONSTRAINT "sessions_category_check" CHECK (("category" = ANY (ARRAY['strength'::"text", 'mobility'::"text", 'cardio'::"text"])))
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."signup_invites" (
    "email" "text" NOT NULL,
    "invited_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval) NOT NULL,
    CONSTRAINT "signup_invites_email_lower" CHECK (("email" = "lower"("btrim"("email"))))
);


ALTER TABLE "public"."signup_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trainee_settings" (
    "user_id" "uuid" NOT NULL,
    "messages_off" boolean DEFAULT false NOT NULL,
    "weigh_prompt_off" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "remind_time" time without time zone,
    "remind_days" smallint[],
    CONSTRAINT "trainee_settings_remind_days_check" CHECK ((("remind_days" IS NULL) OR ((("array_length"("remind_days", 1) >= 1) AND ("array_length"("remind_days", 1) <= 7)) AND ("remind_days" <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint]))))
);


ALTER TABLE "public"."trainee_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waist_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "waist" numeric NOT NULL,
    "unit" "text" DEFAULT 'cm'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "waist_logs_unit_check" CHECK (("unit" = ANY (ARRAY['cm'::"text", 'in'::"text"]))),
    CONSTRAINT "waist_logs_waist_check" CHECK ((("waist" > (0)::numeric) AND ("waist" < (400)::numeric)))
);


ALTER TABLE "public"."waist_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."water_goals" (
    "user_id" "uuid" NOT NULL,
    "ml" integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "water_goals_ml_check" CHECK ((("ml" >= 500) AND ("ml" <= 10000)))
);


ALTER TABLE "public"."water_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."water_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "ml" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "water_logs_ml_check" CHECK ((("ml" > 0) AND ("ml" <= 5000)))
);


ALTER TABLE "public"."water_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_schedule" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "routine_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "slot" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "weekly_schedule_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "weekly_schedule_slot_check" CHECK ((("slot" >= 0) AND ("slot" <= 2)))
);


ALTER TABLE "public"."weekly_schedule" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_notifications"
    ADD CONSTRAINT "admin_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."body_measurements"
    ADD CONSTRAINT "body_measurements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."body_weight_logs"
    ADD CONSTRAINT "body_weight_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkin_answers"
    ADD CONSTRAINT "checkin_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkin_answers"
    ADD CONSTRAINT "checkin_answers_user_id_week_start_key" UNIQUE ("user_id", "week_start");



ALTER TABLE ONLY "public"."coach_goals"
    ADD CONSTRAINT "coach_goals_pkey" PRIMARY KEY ("trainee_id", "author_id");



ALTER TABLE ONLY "public"."coach_messages"
    ADD CONSTRAINT "coach_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_notes"
    ADD CONSTRAINT "coach_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_settings"
    ADD CONSTRAINT "coach_settings_pkey" PRIMARY KEY ("coach_id");



ALTER TABLE ONLY "public"."coach_tasks"
    ADD CONSTRAINT "coach_tasks_dedupe_key_key" UNIQUE ("dedupe_key");



ALTER TABLE ONLY "public"."coach_tasks"
    ADD CONSTRAINT "coach_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consents"
    ADD CONSTRAINT "consents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."error_logs"
    ADD CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."error_logs"
    ADD CONSTRAINT "error_logs_size_check" CHECK ((("length"(COALESCE("message", ''::"text")) <= 2000) AND ("length"(COALESCE("stack", ''::"text")) <= 4000) AND ("length"(COALESCE("component_stack", ''::"text")) <= 4000) AND ("length"(COALESCE("url", ''::"text")) <= 500))) NOT VALID;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_favorites"
    ADD CONSTRAINT "food_favorites_pkey" PRIMARY KEY ("user_id", "food_id");



ALTER TABLE ONLY "public"."food_logs"
    ADD CONSTRAINT "food_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."foods"
    ADD CONSTRAINT "foods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."global_exercises"
    ADD CONSTRAINT "global_exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gyms"
    ADD CONSTRAINT "gyms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."measurement_settings"
    ADD CONSTRAINT "measurement_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."measurement_types"
    ADD CONSTRAINT "measurement_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mfa_recovery_attempts"
    ADD CONSTRAINT "mfa_recovery_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mfa_recovery_codes"
    ADD CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_targets"
    ADD CONSTRAINT "nutrition_targets_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."progress_photos"
    ADD CONSTRAINT "progress_photos_path_key" UNIQUE ("path");



ALTER TABLE ONLY "public"."progress_photos"
    ADD CONSTRAINT "progress_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_config"
    ADD CONSTRAINT "push_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."routines"
    ADD CONSTRAINT "routines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_meals"
    ADD CONSTRAINT "saved_meals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."signup_invites"
    ADD CONSTRAINT "signup_invites_pkey" PRIMARY KEY ("email");



ALTER TABLE ONLY "public"."trainee_settings"
    ADD CONSTRAINT "trainee_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."waist_logs"
    ADD CONSTRAINT "waist_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."water_goals"
    ADD CONSTRAINT "water_goals_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."water_logs"
    ADD CONSTRAINT "water_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_schedule"
    ADD CONSTRAINT "weekly_schedule_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_schedule"
    ADD CONSTRAINT "weekly_schedule_user_id_day_of_week_slot_key" UNIQUE ("user_id", "day_of_week", "slot");



CREATE INDEX "admin_notifications_trainee_idx" ON "public"."admin_notifications" USING "btree" ("trainee_id", "sent_at" DESC);



CREATE INDEX "body_measurements_user_kind_date" ON "public"."body_measurements" USING "btree" ("user_id", "kind", "date" DESC);



CREATE INDEX "body_weight_logs_user_date" ON "public"."body_weight_logs" USING "btree" ("user_id", "date" DESC);



CREATE INDEX "checkin_answers_user_week" ON "public"."checkin_answers" USING "btree" ("user_id", "week_start" DESC);



CREATE INDEX "coach_messages_thread_idx" ON "public"."coach_messages" USING "btree" ("trainee_id", "created_at");



CREATE INDEX "coach_messages_unread_idx" ON "public"."coach_messages" USING "btree" ("trainee_id") WHERE ("read_at" IS NULL);



CREATE INDEX "coach_notes_trainee_idx" ON "public"."coach_notes" USING "btree" ("trainee_id", "created_at" DESC);



CREATE INDEX "coach_tasks_coach_idx" ON "public"."coach_tasks" USING "btree" ("coach_id");



CREATE INDEX "coach_tasks_open_idx" ON "public"."coach_tasks" USING "btree" ("done_at", "due");



CREATE INDEX "coach_tasks_trainee_idx" ON "public"."coach_tasks" USING "btree" ("trainee_id");



CREATE INDEX "consents_user_idx" ON "public"."consents" USING "btree" ("user_id", "doc_key", "version" DESC);



CREATE INDEX "exercises_user_idx" ON "public"."exercises" USING "btree" ("user_id");



CREATE INDEX "food_logs_user_date" ON "public"."food_logs" USING "btree" ("user_id", "date");



CREATE INDEX "foods_barcode_idx" ON "public"."foods" USING "btree" ("barcode") WHERE ("barcode" IS NOT NULL);



CREATE INDEX "foods_search_trgm" ON "public"."foods" USING "gin" ("search_text" "public"."gin_trgm_ops");



CREATE UNIQUE INDEX "foods_source_ref_uniq" ON "public"."foods" USING "btree" ("source", "source_ref") WHERE ("source_ref" IS NOT NULL);



CREATE INDEX "gyms_user_idx" ON "public"."gyms" USING "btree" ("user_id");



CREATE INDEX "measurement_types_coach" ON "public"."measurement_types" USING "btree" ("coach_id");



CREATE INDEX "mfa_recovery_attempts_user_idx" ON "public"."mfa_recovery_attempts" USING "btree" ("user_id", "created_at");



CREATE INDEX "mfa_recovery_codes_user_idx" ON "public"."mfa_recovery_codes" USING "btree" ("user_id");



CREATE INDEX "profiles_coach_id_idx" ON "public"."profiles" USING "btree" ("coach_id");



CREATE INDEX "progress_photos_user_idx" ON "public"."progress_photos" USING "btree" ("user_id", "taken_on" DESC);



CREATE INDEX "push_subscriptions_rest_due" ON "public"."push_subscriptions" USING "btree" ("rest_ends_at") WHERE ("rest_ends_at" IS NOT NULL);



CREATE INDEX "routines_user_idx" ON "public"."routines" USING "btree" ("user_id");



CREATE INDEX "sessions_user_date" ON "public"."sessions" USING "btree" ("user_id", "date" DESC);



CREATE INDEX "waist_logs_user_date" ON "public"."waist_logs" USING "btree" ("user_id", "date" DESC);



CREATE INDEX "water_logs_user_date" ON "public"."water_logs" USING "btree" ("user_id", "date");



CREATE INDEX "weekly_schedule_user_idx" ON "public"."weekly_schedule" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "keep_coach_meals" BEFORE INSERT OR UPDATE ON "public"."nutrition_targets" FOR EACH ROW EXECUTE FUNCTION "public"."keep_coach_meals"();



CREATE OR REPLACE TRIGGER "protect_admin_flag_trg" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_admin_flag"();



CREATE OR REPLACE TRIGGER "trg_check_for_new_prs" AFTER INSERT ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."check_for_new_prs"();



CREATE OR REPLACE TRIGGER "trg_check_session_gym" BEFORE INSERT OR UPDATE OF "gym_id" ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."check_session_gym"();



CREATE OR REPLACE TRIGGER "trg_coach_changed" AFTER UPDATE OF "coach_id" ON "public"."profiles" FOR EACH ROW WHEN ((("old"."coach_id" IS DISTINCT FROM "new"."coach_id") AND ("new"."coach_id" IS NOT NULL) AND (NOT "new"."is_coach") AND (NOT "new"."is_admin"))) EXECUTE FUNCTION "public"."coach_changed"();



CREATE OR REPLACE TRIGGER "trg_coach_deleted" BEFORE DELETE ON "public"."profiles" FOR EACH ROW WHEN (("old"."is_coach" AND (NOT "old"."is_admin"))) EXECUTE FUNCTION "public"."coach_removed"();



CREATE OR REPLACE TRIGGER "trg_coach_goal_author" BEFORE INSERT ON "public"."coach_goals" FOR EACH ROW EXECUTE FUNCTION "public"."coach_row_author"();



CREATE OR REPLACE TRIGGER "trg_coach_message_push" AFTER INSERT ON "public"."coach_messages" FOR EACH ROW EXECUTE FUNCTION "public"."on_coach_message"();



CREATE OR REPLACE TRIGGER "trg_coach_note_author" BEFORE INSERT ON "public"."coach_notes" FOR EACH ROW EXECUTE FUNCTION "public"."coach_row_author"();



CREATE OR REPLACE TRIGGER "trg_coach_removed" BEFORE UPDATE OF "is_coach" ON "public"."profiles" FOR EACH ROW WHEN (("old"."is_coach" AND (NOT "new"."is_coach") AND (NOT "new"."is_admin"))) EXECUTE FUNCTION "public"."coach_removed"();



CREATE OR REPLACE TRIGGER "trg_coach_task_owner" BEFORE INSERT ON "public"."coach_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."coach_task_owner"();



CREATE OR REPLACE TRIGGER "trg_coach_task_skip_attention_off" BEFORE INSERT ON "public"."coach_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."coach_task_skip_attention_off"();



CREATE OR REPLACE TRIGGER "trg_coach_task_skip_removed" BEFORE INSERT ON "public"."coach_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."coach_task_skip_removed"();



CREATE OR REPLACE TRIGGER "trg_guard_session_coach_fields" BEFORE INSERT OR UPDATE ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."guard_session_coach_fields"();



CREATE OR REPLACE TRIGGER "trg_limit_error_logs" BEFORE INSERT ON "public"."error_logs" FOR EACH ROW EXECUTE FUNCTION "public"."limit_error_logs"();



CREATE OR REPLACE TRIGGER "trg_trainer_comment" BEFORE UPDATE OF "trainer_comment", "trainer_comment_at" ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."on_trainer_comment"();



ALTER TABLE ONLY "public"."admin_notifications"
    ADD CONSTRAINT "admin_notifications_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."body_measurements"
    ADD CONSTRAINT "body_measurements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."body_weight_logs"
    ADD CONSTRAINT "body_weight_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkin_answers"
    ADD CONSTRAINT "checkin_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_goals"
    ADD CONSTRAINT "coach_goals_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_goals"
    ADD CONSTRAINT "coach_goals_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_messages"
    ADD CONSTRAINT "coach_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_messages"
    ADD CONSTRAINT "coach_messages_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_notes"
    ADD CONSTRAINT "coach_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_notes"
    ADD CONSTRAINT "coach_notes_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_settings"
    ADD CONSTRAINT "coach_settings_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_tasks"
    ADD CONSTRAINT "coach_tasks_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_tasks"
    ADD CONSTRAINT "coach_tasks_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consents"
    ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."error_logs"
    ADD CONSTRAINT "error_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_favorites"
    ADD CONSTRAINT "food_favorites_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_favorites"
    ADD CONSTRAINT "food_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_logs"
    ADD CONSTRAINT "food_logs_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."food_logs"
    ADD CONSTRAINT "food_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."foods"
    ADD CONSTRAINT "foods_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gyms"
    ADD CONSTRAINT "gyms_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."measurement_settings"
    ADD CONSTRAINT "measurement_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."measurement_types"
    ADD CONSTRAINT "measurement_types_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mfa_recovery_attempts"
    ADD CONSTRAINT "mfa_recovery_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mfa_recovery_codes"
    ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_targets"
    ADD CONSTRAINT "nutrition_targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."progress_photos"
    ADD CONSTRAINT "progress_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."routines"
    ADD CONSTRAINT "routines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_meals"
    ADD CONSTRAINT "saved_meals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."signup_invites"
    ADD CONSTRAINT "signup_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trainee_settings"
    ADD CONSTRAINT "trainee_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waist_logs"
    ADD CONSTRAINT "waist_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."water_goals"
    ADD CONSTRAINT "water_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."water_logs"
    ADD CONSTRAINT "water_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_schedule"
    ADD CONSTRAINT "weekly_schedule_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."weekly_schedule"
    ADD CONSTRAINT "weekly_schedule_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "add own photos when allowed" ON "public"."progress_photos" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."photos_allowed"()));



CREATE POLICY "admin writes targets" ON "public"."nutrition_targets" TO "authenticated" USING ("public"."can_coach"("user_id")) WITH CHECK ("public"."can_coach"("user_id"));



ALTER TABLE "public"."admin_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins can read notification log" ON "public"."admin_notifications" FOR SELECT USING ("public"."can_coach"("trainee_id"));



CREATE POLICY "admins can update any profile including admin flag" ON "public"."profiles" FOR UPDATE USING ("public"."can_coach"("id")) WITH CHECK ("public"."can_coach"("id"));



CREATE POLICY "admins manage coach goals" ON "public"."coach_goals" TO "authenticated" USING (("public"."can_coach"("trainee_id") AND ("author_id" = "auth"."uid"()))) WITH CHECK (("public"."can_coach"("trainee_id") AND ("author_id" = "auth"."uid"())));



CREATE POLICY "admins manage coach notes" ON "public"."coach_notes" TO "authenticated" USING (("public"."can_coach"("trainee_id") AND ("author_id" = "auth"."uid"()))) WITH CHECK (("public"."can_coach"("trainee_id") AND ("author_id" = "auth"."uid"())));



CREATE POLICY "admins manage coach tasks" ON "public"."coach_tasks" TO "authenticated" USING (
CASE
    WHEN ("trainee_id" IS NULL) THEN ("public"."is_coach"() AND ("coach_id" = "auth"."uid"()))
    ELSE "public"."can_coach"("trainee_id")
END) WITH CHECK (
CASE
    WHEN ("trainee_id" IS NULL) THEN ("public"."is_coach"() AND ("coach_id" = "auth"."uid"()))
    ELSE "public"."can_coach"("trainee_id")
END);



CREATE POLICY "admins manage invites" ON "public"."signup_invites" TO "authenticated" USING (("public"."is_admin"() AND ("invited_by" IS NULL))) WITH CHECK (("public"."is_admin"() AND ("invited_by" IS NULL)));



CREATE POLICY "anyone signed in can log their own error" ON "public"."error_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "anyone signed in can read the library" ON "public"."global_exercises" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."body_measurements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."body_weight_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "change own checkins" ON "public"."checkin_answers" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."checkin_answers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach sets measurement settings" ON "public"."measurement_settings" USING (("public"."can_coach"("user_id") OR (("auth"."uid"() = "user_id") AND "public"."is_coach"()))) WITH CHECK (("public"."can_coach"("user_id") OR (("auth"."uid"() = "user_id") AND "public"."is_coach"())));



CREATE POLICY "coach sets trainee settings" ON "public"."trainee_settings" USING ("public"."can_coach"("user_id")) WITH CHECK ("public"."can_coach"("user_id"));



ALTER TABLE "public"."coach_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coaches manage own invites" ON "public"."signup_invites" TO "authenticated" USING (("public"."is_coach"() AND ("invited_by" = "auth"."uid"()))) WITH CHECK (("public"."is_coach"() AND ("invited_by" = "auth"."uid"())));



ALTER TABLE "public"."consents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delete own checkins" ON "public"."checkin_answers" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "delete own or admin photos" ON "public"."progress_photos" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id")));



ALTER TABLE "public"."error_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercises" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."foods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "foods delete" ON "public"."foods" FOR DELETE TO "authenticated" USING (("public"."is_admin"() OR (("created_by" = "auth"."uid"()) AND (NOT "verified") AND ("source" = 'user'::"text"))));



CREATE POLICY "foods insert" ON "public"."foods" FOR INSERT TO "authenticated" WITH CHECK (("public"."nutrition_allowed"() AND ("created_by" = "auth"."uid"()) AND ("public"."is_admin"() OR (("source" = 'user'::"text") AND (NOT "verified")))));



CREATE POLICY "foods readable" ON "public"."foods" FOR SELECT TO "authenticated" USING (("public"."nutrition_allowed"() AND ("verified" OR ("source" = ANY (ARRAY['moh'::"text", 'usda'::"text", 'off'::"text"])) OR ("created_by" = "auth"."uid"()) OR "public"."is_admin"() OR "public"."can_coach"("created_by"))));



CREATE POLICY "foods update" ON "public"."foods" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR (("created_by" = "auth"."uid"()) AND (NOT "verified") AND ("source" = 'user'::"text")))) WITH CHECK (("public"."is_admin"() OR (("created_by" = "auth"."uid"()) AND (NOT "verified") AND ("source" = 'user'::"text"))));



ALTER TABLE "public"."global_exercises" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gyms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert own consent" ON "public"."consents" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."measurement_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."measurement_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages switched off" ON "public"."coach_messages" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ("public"."messages_allowed"("trainee_id"));



ALTER TABLE "public"."mfa_recovery_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mfa_recovery_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutrition_targets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "only admins can delete error logs" ON "public"."error_logs" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "only admins can read error logs" ON "public"."error_logs" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "only admins delete from the library" ON "public"."global_exercises" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "only admins manage the library" ON "public"."global_exercises" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "only admins update the library" ON "public"."global_exercises" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "own coach settings" ON "public"."coach_settings" USING ((("coach_id" = "auth"."uid"()) AND "public"."is_coach"())) WITH CHECK ((("coach_id" = "auth"."uid"()) AND "public"."is_coach"()));



CREATE POLICY "own favorites or admin" ON "public"."food_favorites" TO "authenticated" USING (((("auth"."uid"() = "user_id") AND "public"."nutrition_allowed"()) OR "public"."can_coach"("user_id"))) WITH CHECK (((("auth"."uid"() = "user_id") AND "public"."nutrition_allowed"()) OR "public"."can_coach"("user_id")));



CREATE POLICY "own food logs or admin" ON "public"."food_logs" TO "authenticated" USING (((("auth"."uid"() = "user_id") AND "public"."nutrition_allowed"()) OR "public"."can_coach"("user_id"))) WITH CHECK (((("auth"."uid"() = "user_id") AND "public"."nutrition_allowed"()) OR "public"."can_coach"("user_id")));



CREATE POLICY "own measurement types" ON "public"."measurement_types" USING ((("coach_id" = "auth"."uid"()) AND "public"."is_coach"())) WITH CHECK ((("coach_id" = "auth"."uid"()) AND "public"."is_coach"()));



CREATE POLICY "own or admin body weight" ON "public"."body_weight_logs" USING ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id"))) WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id")));



CREATE POLICY "own or admin can delete schedule" ON "public"."weekly_schedule" FOR DELETE USING ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id")));



CREATE POLICY "own or admin can insert schedule" ON "public"."weekly_schedule" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id")));



CREATE POLICY "own or admin can read schedule" ON "public"."weekly_schedule" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id")));



CREATE POLICY "own or admin can update schedule" ON "public"."weekly_schedule" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id")));



CREATE POLICY "own or admin exercises" ON "public"."exercises" USING ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id"))) WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id")));



CREATE POLICY "own or admin gyms" ON "public"."gyms" USING ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id"))) WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id")));



CREATE POLICY "own or admin routines" ON "public"."routines" USING ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id"))) WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id")));



CREATE POLICY "own or admin sessions" ON "public"."sessions" USING ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id"))) WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id")));



CREATE POLICY "own or admin waist" ON "public"."waist_logs" USING ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id"))) WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id")));



CREATE POLICY "own or coach measurements" ON "public"."body_measurements" USING ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id"))) WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id")));



CREATE POLICY "own push subs delete" ON "public"."push_subscriptions" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own push subs insert" ON "public"."push_subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own push subs select" ON "public"."push_subscriptions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own push subs update" ON "public"."push_subscriptions" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own saved meals or admin" ON "public"."saved_meals" TO "authenticated" USING (((("auth"."uid"() = "user_id") AND "public"."nutrition_allowed"()) OR "public"."can_coach"("user_id"))) WITH CHECK (((("auth"."uid"() = "user_id") AND "public"."nutrition_allowed"()) OR "public"."can_coach"("user_id")));



CREATE POLICY "own targets while self set" ON "public"."nutrition_targets" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."nutrition_allowed"() AND ("set_by" = 'self'::"text")));



CREATE POLICY "own water goal or admin" ON "public"."water_goals" TO "authenticated" USING (((("auth"."uid"() = "user_id") AND "public"."nutrition_allowed"()) OR "public"."can_coach"("user_id"))) WITH CHECK (((("auth"."uid"() = "user_id") AND "public"."nutrition_allowed"()) OR "public"."can_coach"("user_id")));



CREATE POLICY "own water logs or admin" ON "public"."water_logs" TO "authenticated" USING (((("auth"."uid"() = "user_id") AND "public"."nutrition_allowed"()) OR "public"."can_coach"("user_id"))) WITH CHECK (((("auth"."uid"() = "user_id") AND "public"."nutrition_allowed"()) OR "public"."can_coach"("user_id")));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."progress_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read own or admin" ON "public"."consents" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id")));



CREATE POLICY "read own or admin photos" ON "public"."progress_photos" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id")));



CREATE POLICY "read own or admin reads all profiles" ON "public"."profiles" FOR SELECT USING ((("auth"."uid"() = "id") OR "public"."can_coach"("id")));



CREATE POLICY "read own or coached checkins" ON "public"."checkin_answers" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id")));



CREATE POLICY "read own or coached measurement settings" ON "public"."measurement_settings" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id")));



CREATE POLICY "read own or coached trainee settings" ON "public"."trainee_settings" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."can_coach"("user_id")));



CREATE POLICY "read own targets or admin" ON "public"."nutrition_targets" FOR SELECT TO "authenticated" USING (((("auth"."uid"() = "user_id") AND "public"."nutrition_allowed"()) OR "public"."can_coach"("user_id")));



CREATE POLICY "read own thread or coach" ON "public"."coach_messages" FOR SELECT TO "authenticated" USING ((("trainee_id" = "auth"."uid"()) OR "public"."can_coach"("trainee_id")));



CREATE POLICY "removed people cannot add" ON "public"."admin_notifications" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."body_measurements" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."body_weight_logs" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."checkin_answers" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."coach_goals" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."coach_messages" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."coach_notes" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."coach_settings" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."coach_tasks" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."consents" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."exercises" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."food_favorites" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."food_logs" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."foods" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."global_exercises" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."gyms" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."measurement_settings" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."measurement_types" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."mfa_recovery_attempts" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."mfa_recovery_codes" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."nutrition_targets" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."profiles" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."progress_photos" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."push_config" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."push_subscriptions" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."routines" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."saved_meals" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."sessions" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."signup_invites" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."trainee_settings" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."waist_logs" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."water_goals" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."water_logs" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot add" ON "public"."weekly_schedule" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."admin_notifications" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."body_measurements" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."body_weight_logs" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."checkin_answers" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."coach_goals" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."coach_messages" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."coach_notes" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."coach_settings" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."coach_tasks" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."consents" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."exercises" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."food_favorites" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."food_logs" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."foods" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."global_exercises" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."gyms" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."measurement_settings" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."measurement_types" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."mfa_recovery_attempts" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."mfa_recovery_codes" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."nutrition_targets" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."profiles" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."progress_photos" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."push_config" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."push_subscriptions" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."routines" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."saved_meals" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."sessions" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."signup_invites" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."trainee_settings" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."waist_logs" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."water_goals" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."water_logs" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



CREATE POLICY "removed people cannot change" ON "public"."weekly_schedule" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."am_removed"())) WITH CHECK ((NOT "public"."am_removed"()));



ALTER TABLE "public"."routines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_meals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."signup_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trainee_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "two-step verification when enabled" ON "public"."admin_notifications" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."body_weight_logs" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."coach_goals" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."coach_messages" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."coach_notes" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."consents" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."error_logs" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."exercises" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."food_favorites" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."food_logs" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."foods" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."global_exercises" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."nutrition_targets" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."profiles" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."progress_photos" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."push_subscriptions" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."routines" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."saved_meals" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."sessions" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."signup_invites" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."water_goals" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."water_logs" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "two-step verification when enabled" ON "public"."weekly_schedule" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied")) WITH CHECK (( SELECT "public"."mfa_satisfied"() AS "mfa_satisfied"));



CREATE POLICY "update own self set targets" ON "public"."nutrition_targets" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_id") AND "public"."nutrition_allowed"() AND ("set_by" = 'self'::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."nutrition_allowed"() AND ("set_by" = 'self'::"text")));



CREATE POLICY "users update their own profile but not their admin flag" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."waist_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."water_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."water_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_schedule" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "write own checkins" ON "public"."checkin_answers" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "write own thread or coach" ON "public"."coach_messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND (("trainee_id" = "auth"."uid"()) OR "public"."can_coach"("trainee_id"))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "supabase_auth_admin";






GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";











































































































































































REVOKE ALL ON FUNCTION "public"."am_removed"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."am_removed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."am_removed"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."app_owner_name"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."app_owner_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."app_owner_name"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."assign_coach"("p_person" "uuid", "p_coach" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_coach"("p_person" "uuid", "p_coach" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_coach"("p_person" "uuid", "p_coach" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_coach"("target" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_coach"("target" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_coach"("target" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_coach_folder"("folder" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_coach_folder"("folder" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_coach_folder"("folder" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_for_new_prs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_for_new_prs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_inactive_trainees"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_inactive_trainees"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_session_gym"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_session_gym"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_session_gym"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_due_rest_alerts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_due_rest_alerts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."coach_changed"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coach_changed"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."coach_for"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coach_for"("p_user" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."coach_has_room"("p_coach" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coach_has_room"("p_coach" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."coach_removed"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coach_removed"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."coach_roster"("p_today" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coach_roster"("p_today" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."coach_roster"("p_today" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."coach_row_author"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coach_row_author"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."coach_task_owner"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coach_task_owner"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."coach_task_skip_attention_off"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coach_task_skip_attention_off"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."coach_task_skip_removed"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coach_task_skip_removed"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."coach_trainee_count"("p_coach" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coach_trainee_count"("p_coach" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_my_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."generate_recovery_codes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_recovery_codes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_recovery_codes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_session_coach_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_session_coach_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."hook_signup_invite_only"("event" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hook_signup_invite_only"("event" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."hook_signup_invite_only"("event" "jsonb") TO "supabase_auth_admin";



REVOKE ALL ON FUNCTION "public"."html_escape"("t" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."html_escape"("t" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_coach"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_coach"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_coach"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."keep_coach_meals"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keep_coach_meals"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."limit_error_logs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."limit_error_logs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_coaches"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_coaches"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_coaches"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_messages_read"("p_trainee" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_messages_read"("p_trainee" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_messages_read"("p_trainee" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."measurement_setup"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."measurement_setup"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."measurement_setup"("p_user" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."messages_allowed"("p_trainee" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."messages_allowed"("p_trainee" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."messages_allowed"("p_trainee" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mfa_satisfied"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mfa_satisfied"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mfa_satisfied"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_brand"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_brand"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_brand"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_checkin_questions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_checkin_questions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_checkin_questions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_coach"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_coach"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_coach"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_coach_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_coach_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_coach_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_coach_pr"("trainee" "uuid", "detail" "text", "detail_he" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_coach_pr"("trainee" "uuid", "detail" "text", "detail_he" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."nutrition_allowed"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nutrition_allowed"() TO "service_role";
GRANT ALL ON FUNCTION "public"."nutrition_allowed"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."on_coach_message"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."on_coach_message"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."on_trainer_comment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."on_trainer_comment"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."owner_gets_alerts"("trainee" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_gets_alerts"("trainee" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."owner_lang"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_lang"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."photos_allowed"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."photos_allowed"() TO "service_role";
GRANT ALL ON FUNCTION "public"."photos_allowed"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."protect_admin_flag"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_admin_flag"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_invite"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_invite"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_invite"("p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."recovery_codes_left"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recovery_codes_left"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recovery_codes_left"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_coach_tasks"("p_today" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_coach_tasks"("p_today" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_coach_tasks"("p_today" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."return_to_owner"("p_person" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."return_to_owner"("p_person" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."return_to_owner"("p_person" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."run_coach_tasks"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."run_coach_tasks"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."run_photo_purge"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."run_photo_purge"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."run_rest_alerts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."run_rest_alerts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."run_workout_reminders"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."run_workout_reminders"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_admin_email"("p_subject" "text", "p_html" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_admin_email"("p_subject" "text", "p_html" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_admin_push"("p_title" "text", "p_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_admin_push"("p_title" "text", "p_message" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_pr_alert"("trainee_name" "text", "ex_name" "text", "detail_en" "text", "detail_he" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_pr_alert"("trainee_name" "text", "ex_name" "text", "detail_en" "text", "detail_he" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_routine_to_coach"("p_routine" "uuid", "p_coach" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_routine_to_coach"("p_routine" "uuid", "p_coach" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_routine_to_coach"("p_routine" "uuid", "p_coach" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_coach"("p_person" "uuid", "p_on" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_coach"("p_person" "uuid", "p_on" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_coach"("p_person" "uuid", "p_on" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_coach_frozen"("p_coach" "uuid", "p_frozen" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_coach_frozen"("p_coach" "uuid", "p_frozen" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_coach_frozen"("p_coach" "uuid", "p_frozen" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_coach_limit"("p_coach" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_coach_limit"("p_coach" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_coach_limit"("p_coach" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_removed"("p_person" "uuid", "p_removed" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_removed"("p_person" "uuid", "p_removed" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_removed"("p_person" "uuid", "p_removed" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."use_recovery_code"("code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."use_recovery_code"("code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."use_recovery_code"("code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."valid_checkin_questions"("p" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."valid_checkin_questions"("p" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."valid_checkin_questions"("p" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."valid_meal_layout"("p" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."valid_meal_layout"("p" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."valid_meal_layout"("p" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."valid_measurement_kinds"("p_kinds" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."valid_measurement_kinds"("p_kinds" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."valid_measurement_kinds"("p_kinds" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."valid_snippets"("p" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."valid_snippets"("p" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."valid_snippets"("p" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";
























GRANT ALL ON TABLE "public"."admin_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."body_measurements" TO "authenticated";
GRANT ALL ON TABLE "public"."body_measurements" TO "service_role";



GRANT ALL ON TABLE "public"."body_weight_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."body_weight_logs" TO "service_role";



GRANT ALL ON TABLE "public"."checkin_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."checkin_answers" TO "service_role";



GRANT ALL ON TABLE "public"."coach_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_goals" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."coach_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_messages" TO "service_role";



GRANT ALL ON TABLE "public"."coach_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_notes" TO "service_role";



GRANT ALL ON TABLE "public"."coach_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_settings" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."coach_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."consents" TO "authenticated";
GRANT ALL ON TABLE "public"."consents" TO "service_role";



GRANT ALL ON TABLE "public"."error_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."error_logs" TO "service_role";



GRANT ALL ON TABLE "public"."exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."exercises" TO "service_role";



GRANT ALL ON TABLE "public"."food_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."food_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."food_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."food_logs" TO "service_role";



GRANT ALL ON TABLE "public"."foods" TO "authenticated";
GRANT ALL ON TABLE "public"."foods" TO "service_role";



GRANT ALL ON TABLE "public"."global_exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."global_exercises" TO "service_role";



GRANT ALL ON TABLE "public"."gyms" TO "authenticated";
GRANT ALL ON TABLE "public"."gyms" TO "service_role";



GRANT ALL ON TABLE "public"."measurement_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."measurement_settings" TO "service_role";



GRANT ALL ON TABLE "public"."measurement_types" TO "authenticated";
GRANT ALL ON TABLE "public"."measurement_types" TO "service_role";



GRANT ALL ON TABLE "public"."mfa_recovery_attempts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."mfa_recovery_attempts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."mfa_recovery_attempts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."mfa_recovery_codes" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_targets" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."progress_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."progress_photos" TO "service_role";



GRANT ALL ON TABLE "public"."push_config" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."routines" TO "authenticated";
GRANT ALL ON TABLE "public"."routines" TO "service_role";



GRANT ALL ON TABLE "public"."saved_meals" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_meals" TO "service_role";



GRANT ALL ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";



GRANT ALL ON TABLE "public"."signup_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."signup_invites" TO "service_role";



GRANT ALL ON TABLE "public"."trainee_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."trainee_settings" TO "service_role";



GRANT ALL ON TABLE "public"."waist_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."waist_logs" TO "service_role";



GRANT ALL ON TABLE "public"."water_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."water_goals" TO "service_role";



GRANT ALL ON TABLE "public"."water_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."water_logs" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_schedule" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_schedule" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































