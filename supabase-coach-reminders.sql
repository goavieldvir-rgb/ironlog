-- Ironlog: the coach sets a trainee's daily workout reminder.
--
-- Run after supabase-coach-extras.sql. Safe to run more than once.
-- Then deploy the send-workout-reminders function again
-- (supabase functions deploy send-workout-reminders) so it reads these.
--
-- remind_time / remind_days on trainee_settings override the time and
-- weekdays the trainee picked on their phone. Null keeps the trainee's own
-- choice. The trainee still decides whether reminders are on at all (they
-- need to allow notifications on their phone).

alter table public.trainee_settings add column if not exists remind_time time;
alter table public.trainee_settings add column if not exists remind_days smallint[];

alter table public.trainee_settings drop constraint if exists trainee_settings_remind_days_check;
alter table public.trainee_settings add constraint trainee_settings_remind_days_check check (
  remind_days is null or (array_length(remind_days, 1) between 1 and 7 and remind_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
);

notify pgrst, 'reload schema';
