-- Three features in one migration. Safe to run more than once.

-- ─── 1. Last session's note per exercise ───────────────────────────────
-- The most recent non-empty note written on an exercise ("seat on 4",
-- "left knee sore") is shown the next time that exercise is logged.
alter table exercises add column if not exists last_note text;
alter table exercises add column if not exists last_note_date date;

-- Backfill from existing history, so notes you've already written show up
-- straight away instead of only after the next session.
update exercises ex
set last_note = x.note, last_note_date = x.date
from (
  select distinct on (s.user_id, e->>'exerciseId')
    s.user_id, e->>'exerciseId' as exid, trim(e->>'notes') as note, s.date
  from sessions s, jsonb_array_elements(s.entries) e
  where coalesce(trim(e->>'notes'), '') <> ''
  order by s.user_id, e->>'exerciseId', s.date desc, s.created_at desc
) x
where ex.id::text = x.exid and ex.user_id = x.user_id;

-- ─── 2. Workout duration ───────────────────────────────────────────────
alter table sessions add column if not exists started_at timestamptz;
alter table sessions add column if not exists duration_minutes integer;

-- ─── 3. Self-service account deletion ──────────────────────────────────
-- A signed-in person can permanently delete their OWN account and every
-- row of their data. The app can't delete a login by itself (that needs
-- elevated rights), so this runs with elevated rights but only ever acts
-- on auth.uid() — nobody can use it to delete anyone else.
-- Admin accounts are refused, so the coach account can't be wiped by a
-- stray tap and leave every trainee without a coach.
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
