-- Timed holds (plank, wall sit, dead hang): lets an exercise be logged in
-- seconds instead of reps. Run once in the Supabase SQL Editor.
-- The app keeps working without it; only turning "Timed hold" on needs it.
alter table exercises add column if not exists timed boolean not null default false;
notify pgrst, 'reload schema';
