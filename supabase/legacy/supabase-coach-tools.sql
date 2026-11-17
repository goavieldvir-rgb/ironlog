-- Coach tools for the People page: one roster summary call, private coach
-- notes, a goal per trainee and a "reviewed" mark on sessions.
-- Safe to re-run. Also folded into supabase/schema.sql.

-- A session counts as reviewed once the coach opened it or commented on it.
alter table public.sessions add column if not exists reviewed_at timestamptz;

-- Every screen loads one person's rows by user_id ordered by date; none of
-- these tables had an index for it.
create index if not exists sessions_user_date on public.sessions (user_id, date desc);
create index if not exists body_weight_logs_user_date on public.body_weight_logs (user_id, date desc);
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
    where cs.user_id = p.id order by cs.accepted_at desc limit 1
  ) c on true
  order by coalesce(p.full_name, p.email);
end;
$function$;

revoke execute on function public.coach_roster(date) from public, anon;
grant execute on function public.coach_roster(date) to authenticated;
