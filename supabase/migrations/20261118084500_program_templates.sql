-- Program templates: a coach saves a set of their own routines plus a
-- weekly plan as one program, and gives it to several trainees in one step.
--
-- program_templates: the coach's programs. `routine_ids` are the coach's own
-- routines in the program (live: editing a routine changes the program too);
-- `schedule` places them on the week as [{"day": 0-6, "slot": 0-2,
-- "routine_id": uuid}], the same days and slots as weekly_schedule.
--
-- program_assignments: who was given which program and when, so the coach
-- can see who is on it. Assigning copies the routines into the trainee's own
-- account and writes their weekly plan (done by the app with the coach's
-- existing rights on routines and weekly_schedule); this row is the record.

create table if not exists public.program_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  notes text not null default '' check (length(notes) <= 1000),
  routine_ids uuid[] not null default '{}' check (cardinality(routine_ids) <= 21),
  schedule jsonb not null default '[]'::jsonb check (jsonb_typeof(schedule) = 'array' and jsonb_array_length(schedule) <= 21),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists program_templates_coach_idx on public.program_templates (coach_id, created_at desc);

create table if not exists public.program_assignments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.program_templates(id) on delete cascade,
  trainee_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  replaced_plan boolean not null default true,
  assigned_at timestamptz not null default now()
);

create index if not exists program_assignments_template_idx on public.program_assignments (template_id, assigned_at desc);
create index if not exists program_assignments_trainee_idx on public.program_assignments (trainee_id, assigned_at desc);

alter table public.program_templates enable row level security;
alter table public.program_assignments enable row level security;

-- Only the coach who made a program sees or changes it, and only while they
-- may coach (not frozen or removed, two-step verified: is_coach() checks all).
drop policy if exists "coaches manage own programs" on public.program_templates;
create policy "coaches manage own programs" on public.program_templates
  to authenticated
  using (coach_id = auth.uid() and public.is_coach())
  with check (coach_id = auth.uid() and public.is_coach());

-- A coach records and reads their own assignments, only for trainees they
-- coach and only for their own programs. Assignments are a log: no updates.
drop policy if exists "coaches read own assignments" on public.program_assignments;
create policy "coaches read own assignments" on public.program_assignments
  for select to authenticated
  using (assigned_by = auth.uid() and public.is_coach());

drop policy if exists "coaches record assignments" on public.program_assignments;
create policy "coaches record assignments" on public.program_assignments
  for insert to authenticated
  with check (
    assigned_by = auth.uid()
    and public.can_coach(trainee_id)
    and exists (select 1 from public.program_templates pt where pt.id = template_id and pt.coach_id = auth.uid())
  );

drop policy if exists "coaches delete own assignments" on public.program_assignments;
create policy "coaches delete own assignments" on public.program_assignments
  for delete to authenticated
  using (assigned_by = auth.uid() and public.is_coach());

-- The same blanket rules every other table has.
drop policy if exists "removed people cannot add" on public.program_templates;
create policy "removed people cannot add" on public.program_templates
  as restrictive for insert to authenticated with check (not public.am_removed());
drop policy if exists "removed people cannot change" on public.program_templates;
create policy "removed people cannot change" on public.program_templates
  as restrictive for update to authenticated using (not public.am_removed()) with check (not public.am_removed());
drop policy if exists "two-step verification when enabled" on public.program_templates;
create policy "two-step verification when enabled" on public.program_templates
  as restrictive to authenticated using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

drop policy if exists "removed people cannot add" on public.program_assignments;
create policy "removed people cannot add" on public.program_assignments
  as restrictive for insert to authenticated with check (not public.am_removed());
drop policy if exists "two-step verification when enabled" on public.program_assignments;
create policy "two-step verification when enabled" on public.program_assignments
  as restrictive to authenticated using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- Keep updated_at honest without trusting the client's clock.
create or replace function public.touch_program_template() returns trigger
  language plpgsql
  set search_path to ''
as $$
begin
  new.updated_at := now();
  new.coach_id := old.coach_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_program_template on public.program_templates;
create trigger trg_touch_program_template before update on public.program_templates
  for each row execute function public.touch_program_template();

grant select, insert, update, delete on table public.program_templates to authenticated;
grant all on table public.program_templates to service_role;
grant select, insert, delete on table public.program_assignments to authenticated;
grant all on table public.program_assignments to service_role;
