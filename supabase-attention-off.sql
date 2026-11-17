-- Ironlog: per-trainee settings for each coach on People (Edit trainees):
-- a "Needs attention" switch and a priority star.
--
-- Run after supabase-coach-preferences.sql and supabase-coach-controls.sql.
-- Safe to run more than once. Nothing changes until a coach turns someone off
-- on People (Edit trainees).
--
-- - coach_settings.attention_off: trainees this coach doesn't want flagged.
--   They drop out of Needs attention, Deal with first and the To do list;
--   sessions waiting for review still show. Each coach has their own list.
-- - coach_settings.priority: trainees this coach starred. They show first
--   on People and in Deal with first.
-- - A trigger stops new automatic To do items (and so the morning push)
--   about a trainee their coach turned off. Tasks the coach writes still work.

alter table public.coach_settings add column if not exists attention_off uuid[] not null default '{}';
alter table public.coach_settings add column if not exists priority uuid[] not null default '{}';

create or replace function public.coach_task_skip_attention_off()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
revoke execute on function public.coach_task_skip_attention_off() from public, anon, authenticated;
drop trigger if exists trg_coach_task_skip_attention_off on public.coach_tasks;
create trigger trg_coach_task_skip_attention_off before insert on public.coach_tasks
  for each row execute function public.coach_task_skip_attention_off();
