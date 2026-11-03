-- Demo clip per exercise: lets a coach pick which of Ironlog's animation
-- clips shows next to an exercise (Exercises > edit > "Demo clip"), or hide
-- a wrong automatic match. Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Without this column the app still shows clips, matched automatically by
-- the exercise's English name. Only the coach's own pick needs it.
--
-- Values: a clip name such as 'lat-pulldown', 'none' for no clip, or null
-- for automatic. Same row-level security as the rest of the exercise row.

alter table public.exercises add column if not exists clip text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exercises_clip_check') then
    alter table public.exercises
      add constraint exercises_clip_check
      check (clip is null or clip ~ '^[a-z0-9-]{1,80}$');
  end if;
end $$;

notify pgrst, 'reload schema';
