-- Workout reminder weekdays: lets each phone pick which days of the week it
-- gets the daily reminder. 0 = Sunday ... 6 = Saturday (JavaScript getDay order),
-- read in the subscription's own time zone.
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- Before this is run the app hides the day picker and the reminder fires every
-- day; the send-workout-reminders function treats a missing column or a null
-- as "every day".

alter table public.push_subscriptions
  add column if not exists remind_days smallint[] not null default '{0,1,2,3,4,5,6}';

-- Values 0-6 only, and at least one day (an empty list would mean never).
alter table public.push_subscriptions drop constraint if exists push_subscriptions_remind_days_check;
alter table public.push_subscriptions
  add constraint push_subscriptions_remind_days_check
  check (remind_days <@ array[0,1,2,3,4,5,6]::smallint[] and cardinality(remind_days) >= 1);
