-- Undo supabase-attention-off.sql. Redeploy the app without the switch first.
begin;
drop trigger if exists trg_coach_task_skip_attention_off on public.coach_tasks;
drop function if exists public.coach_task_skip_attention_off();
alter table public.coach_settings drop column if exists attention_off;
alter table public.coach_settings drop column if exists priority;
commit;
