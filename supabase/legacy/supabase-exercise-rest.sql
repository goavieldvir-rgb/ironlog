-- Per-exercise rest time: an exercise can carry its own rest between sets,
-- and the workout's rest timer starts at that length after each of its sets.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- A routine can also set a rest for one exercise in that routine. That value
-- lives inside the routine's `exercises` JSON (`restSeconds`), so it needs no
-- database change and works before this file is run. Only the exercise-level
-- default (Exercises > edit > "Rest between sets") needs this column.
--
-- Order the timer uses: the routine's rest for that exercise, then the
-- exercise's own rest, then whatever length was last picked on the timer.

alter table public.exercises add column if not exists rest_seconds integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exercises_rest_seconds_check') then
    alter table public.exercises
      add constraint exercises_rest_seconds_check
      check (rest_seconds is null or (rest_seconds between 5 and 3600));
  end if;
end $$;

notify pgrst, 'reload schema';
